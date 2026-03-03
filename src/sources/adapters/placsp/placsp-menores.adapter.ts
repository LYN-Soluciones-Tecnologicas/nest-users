import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import * as zlib from 'zlib';
import { parseStringPromise } from 'xml2js';
import {
  IDataSourceAdapter,
  RawTenderData,
  FetchResult,
  SourceQuery,
} from '../../../common/interfaces/data-source.interface';

/**
 * Adapter for contratos menores from PLACSP.
 * Same ATOM/CODICE format but from sindicacion_1143 feed.
 */
@Injectable()
export class PlacspMenoresAdapter implements IDataSourceAdapter {
  private readonly logger = new Logger(PlacspMenoresAdapter.name);

  readonly sourceId = 'placsp-menores';
  readonly sourceName = 'PLACSP - Contratos Menores';
  readonly region = 'nacional';

  private readonly menoresUrl: string;

  constructor(private readonly config: ConfigService) {
    this.menoresUrl = this.config.get<string>('placsp.menoresUrl');
  }

  async fetch(query: SourceQuery): Promise<FetchResult> {
    const url =
      query.pageToken ||
      `${this.menoresUrl}/contratosMenoresPerfilesContratanteCompleto3.atom`;
    this.logger.log(`Fetching contratos menores from: ${url}`);

    try {
      const xml = await this.fetchUrl(url);
      const parsed = await parseStringPromise(xml, {
        explicitArray: false,
        ignoreAttrs: false,
        tagNameProcessors: [(name) => name.replace(/^.*:/, '')],
      });

      const feed = parsed.feed || parsed;
      const entries = this.ensureArray(feed.entry || []);

      const tenders: RawTenderData[] = entries.map((entry) =>
        this.parseMinorContract(entry),
      );

      const links = this.ensureArray(feed.link || []);
      const nextLink = links.find(
        (l) => l.$?.rel === 'next',
      );
      const nextPageToken = nextLink?.$?.href || null;

      return {
        tenders,
        nextPageToken,
        hasMore: !!nextPageToken,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch contratos menores: ${error.message}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.menoresUrl}/contratosMenoresPerfilesContratanteCompleto3.atom`;
      const response = await this.fetchUrl(url, 5000);
      return response.includes('<feed');
    } catch {
      return false;
    }
  }

  private parseMinorContract(entry: any): RawTenderData {
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
        `menores-${Date.now()}`,
      title:
        procurementProject.Name ||
        procurementProject.name ||
        entry.title?._ ||
        entry.title ||
        'Contrato menor',
      contractingAuthority: authorityName,
      budgetAmount: isNaN(budgetValue) ? null : budgetValue,
      currency: 'EUR',
      status: 'awarded',
      isMinorContract: true,
      publicationDate: entry.updated ? new Date(entry.updated) : new Date(),
      detailUrl: entry.link?.$?.href || '',
      rawData: entry,
      // OCDS: contratos menores are direct awards
      procurementMethod: 'direct',
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
        const encoding = response.headers['content-encoding'];
        let stream: NodeJS.ReadableStream = response;
        if (encoding === 'gzip') {
          stream = response.pipe(zlib.createGunzip());
        }

        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () =>
          resolve(Buffer.concat(chunks).toString('utf-8')),
        );
        stream.on('error', reject);
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
      request.on('error', reject);
    });
  }
}
