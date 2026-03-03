import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { parseStringPromise } from 'xml2js';
import {
  IDataSourceAdapter,
  RawTenderData,
  FetchResult,
  SourceQuery,
} from '../../../common/interfaces/data-source.interface';

/**
 * Adapter for Galicia public procurement data.
 *
 * Galicia's platform (Contratos Públicos de Galicia - CPG) is
 * interoperable with PLACSP since August 2017.
 * Data flows through the national PLACSP aggregation feed.
 *
 * This adapter reads the aggregation feed and filters for Galicia entries.
 */
@Injectable()
export class GaliciaAdapter implements IDataSourceAdapter {
  private readonly logger = new Logger(GaliciaAdapter.name);

  readonly sourceId = 'galicia';
  readonly sourceName = 'Contratación Pública - Galicia';
  readonly region = 'galicia';

  /** Same aggregation feed, filtered for Galicia */
  private readonly aggregationBaseUrl =
    'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044';
  private readonly atomFile = 'PlataformasAgregwordasPerWordfil3.atom';

  constructor(private readonly config: ConfigService) {}

  async fetch(query: SourceQuery): Promise<FetchResult> {
    const url =
      query.pageToken ||
      `${this.aggregationBaseUrl}/${this.atomFile}`;
    this.logger.log(`Fetching Galicia aggregation feed: ${url}`);

    try {
      const xml = await this.fetchUrl(url);
      const parsed = await parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [(name) => name.replace(/^.*:/, '')],
      });

      const feed = parsed.feed || parsed;
      const entries = this.ensureArray(feed.entry || []);

      const galiciaEntries = entries.filter((entry) =>
        this.isGaliciaEntry(entry),
      );

      const tenders: RawTenderData[] = galiciaEntries.map((entry) =>
        this.parseEntry(entry),
      );

      const links = this.ensureArray(feed.link || []);
      const nextLink = links.find((l) => l.$?.rel === 'next');
      const nextPageToken = nextLink?.$?.href || null;

      return {
        tenders,
        nextPageToken,
        hasMore: !!nextPageToken,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Galicia feed: ${error.message}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.aggregationBaseUrl}/${this.atomFile}`;
      const response = await this.fetchUrl(url, 10000);
      return response.includes('<feed') || response.includes('<atom');
    } catch {
      return false;
    }
  }

  private isGaliciaEntry(entry: any): boolean {
    const entryStr = JSON.stringify(entry).toLowerCase();
    return (
      entryStr.includes('galicia') ||
      entryStr.includes('xunta') ||
      entryStr.includes('xunta de galicia') ||
      entryStr.includes('coruña') ||
      entryStr.includes('lugo') ||
      entryStr.includes('ourense') ||
      entryStr.includes('pontevedra') ||
      entryStr.includes('vigo')
    );
  }

  private parseEntry(entry: any): RawTenderData {
    const contractFolder =
      entry.ContractFolderStatus || entry.contractFolderStatus || {};
    const procurementProject =
      contractFolder.ProcurementProject ||
      contractFolder.procurementProject ||
      {};
    const locatedParty =
      contractFolder.LocatedContractingParty ||
      contractFolder.locatedContractingParty ||
      {};
    const party = locatedParty.Party || locatedParty.party || {};
    const partyName = party.PartyName || party.partyName || {};
    const nameObj = partyName.Name || partyName.name || '';
    const authorityName =
      typeof nameObj === 'string' ? nameObj : nameObj?._ || '';

    const budget =
      procurementProject.BudgetAmount || procurementProject.budgetAmount || {};
    const totalAmount = budget.TotalAmount || budget.totalAmount || {};
    const budgetValue = parseFloat(
      typeof totalAmount === 'string' ? totalAmount : totalAmount?._ || '0',
    );

    return {
      externalId:
        entry.id ||
        contractFolder.ContractFolderID ||
        `galicia-${Date.now()}`,
      title:
        procurementProject.Name ||
        procurementProject.name ||
        entry.title?._ ||
        entry.title ||
        'Sin título',
      contractingAuthority: authorityName,
      budgetAmount: isNaN(budgetValue) ? null : budgetValue,
      currency: 'EUR',
      status:
        contractFolder.ContractFolderStatusCode?._ ||
        contractFolder.contractFolderStatusCode ||
        '',
      location: 'Galicia',
      publicationDate: entry.updated ? new Date(entry.updated) : new Date(),
      detailUrl: entry.link?.$?.href || '',
      isMinorContract: false,
      rawData: entry,
      // OCDS fields
      submissionMethod: ['electronicSubmission'],
    };
  }

  private ensureArray(value: any): any[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  private fetchUrl(url: string, timeout = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      const request = https.get(url, { timeout }, (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          this.fetchUrl(response.headers.location, timeout)
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolve(Buffer.concat(chunks).toString('utf-8')),
        );
        response.on('error', reject);
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
      request.on('error', reject);
    });
  }
}
