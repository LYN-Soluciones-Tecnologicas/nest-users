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
 * Adapter for Plataforma de Contratación del Sector Público (PLACSP).
 *
 * Reads ATOM feeds in CODICE format.
 * Feed structure:
 *   - Root: licitacionesPerfilesContratanteCompleto3.atom
 *   - Pagination: atom:link[@rel="next"] for next page
 *   - Max 500 entries per file
 *   - Monthly archives: ...AAAAMM.zip
 *
 * Includes both regular tenders and contratos menores (separate feed).
 */
@Injectable()
export class PlacspAdapter implements IDataSourceAdapter {
  private readonly logger = new Logger(PlacspAdapter.name);

  readonly sourceId = 'placsp-nacional';
  readonly sourceName = 'PLACSP - Contratación del Sector Público';
  readonly region = 'nacional';

  private readonly baseUrl: string;
  private readonly atomFile: string;
  private readonly menoresUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('placsp.baseUrl');
    this.atomFile = this.config.get<string>('placsp.atomFile');
    this.menoresUrl = this.config.get<string>('placsp.menoresUrl');
  }

  async fetch(query: SourceQuery): Promise<FetchResult> {
    const url = query.pageToken || `${this.baseUrl}/${this.atomFile}`;
    this.logger.log(`Fetching ATOM feed from: ${url}`);

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
        this.parseEntry(entry),
      );

      // Find next page link
      const links = this.ensureArray(feed.link || []);
      const nextLink = links.find(
        (l) => l.$?.rel === 'next' || l.$.rel === 'next',
      );
      const nextPageToken = nextLink?.$?.href || null;

      return {
        tenders,
        nextPageToken,
        hasMore: !!nextPageToken,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch PLACSP feed: ${error.message}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/${this.atomFile}`;
      const response = await this.fetchUrl(url, 5000);
      return response.includes('<feed');
    } catch {
      return false;
    }
  }

  private parseEntry(entry: any): RawTenderData {
    // CODICE format parsing
    const contractFolder =
      entry.ContractFolderStatus || entry.contractFolderStatus || {};
    const contractInfo =
      contractFolder.ContractFolderStatusCode ||
      contractFolder.contractFolderStatusCode;
    const locatedParty =
      contractFolder.LocatedContractingParty ||
      contractFolder.locatedContractingParty ||
      {};
    const party = locatedParty.Party || locatedParty.party || {};
    const partyName =
      party.PartyName || party.partyName || {};
    const procurementProject =
      contractFolder.ProcurementProject ||
      contractFolder.procurementProject ||
      {};
    const budget =
      procurementProject.BudgetAmount || procurementProject.budgetAmount || {};
    const tenderingProcess =
      contractFolder.TenderingProcess || contractFolder.tenderingProcess || {};
    const tenderDeadline =
      tenderingProcess.TenderSubmissionDeadlinePeriod ||
      tenderingProcess.tenderSubmissionDeadlinePeriod ||
      {};

    // Extract CPV codes
    const cpvItems = this.ensureArray(
      procurementProject.RequiredCommodityClassification ||
        procurementProject.requiredCommodityClassification ||
        [],
    );
    const cpvCodes = cpvItems
      .map(
        (item) =>
          item.ItemClassificationCode ||
          item.itemClassificationCode ||
          '',
      )
      .filter((code) => {
        const val = typeof code === 'string' ? code : code?._ || '';
        return val.length > 0;
      })
      .map((code) => (typeof code === 'string' ? code : code?._ || ''));

    // Extract document links
    const docs = this.ensureArray(
      contractFolder.LegalDocumentReference ||
        contractFolder.legalDocumentReference ||
        [],
    );
    const techDocs = this.ensureArray(
      contractFolder.TechnicalDocumentReference ||
        contractFolder.technicalDocumentReference ||
        [],
    );
    const allDocs = [...docs, ...techDocs];
    const documentUrls = allDocs
      .map((doc) => {
        const attachment = doc.Attachment || doc.attachment || {};
        const extRef =
          attachment.ExternalReference || attachment.externalReference || {};
        return extRef.URI || extRef.uri || '';
      })
      .filter(Boolean);

    // Extract budget
    const totalAmount =
      budget.TotalAmount || budget.totalAmount || {};
    const estimatedAmount =
      budget.EstimatedOverallContractAmount ||
      budget.estimatedOverallContractAmount ||
      {};
    const budgetValue = parseFloat(
      typeof totalAmount === 'string'
        ? totalAmount
        : totalAmount?._ || estimatedAmount?._ || '0',
    );

    // Extract name
    const nameObj = partyName.Name || partyName.name || '';
    const authorityName =
      typeof nameObj === 'string' ? nameObj : nameObj?._ || '';

    // Type code
    const typeCode =
      procurementProject.TypeCode || procurementProject.typeCode;
    const typeStr = typeof typeCode === 'string' ? typeCode : typeCode?._ || '';

    const statusStr =
      typeof contractInfo === 'string'
        ? contractInfo
        : contractInfo?._ || '';

    return {
      externalId:
        entry.id ||
        contractFolder.ContractFolderID ||
        contractFolder.contractFolderID ||
        `placsp-${Date.now()}`,
      title:
        procurementProject.Name ||
        procurementProject.name ||
        entry.title?._ ||
        entry.title ||
        'Sin título',
      description:
        typeof (procurementProject.Name || procurementProject.name) === 'object'
          ? (procurementProject.Name?._ || '')
          : '',
      contractingAuthority: authorityName,
      cpvCodes,
      budgetAmount: isNaN(budgetValue) ? null : budgetValue,
      currency: 'EUR',
      status: statusStr,
      contractType: typeStr,
      procedureType:
        tenderingProcess.ProcedureCode?._ ||
        tenderingProcess.procedureCode?._ ||
        '',
      location:
        procurementProject.RealizedLocation?.CountrySubentityCode?._ ||
        procurementProject.realizedLocation?.countrySubentityCode?._ ||
        '',
      publicationDate: entry.updated
        ? new Date(entry.updated)
        : new Date(),
      submissionDeadline: tenderDeadline.EndDate
        ? new Date(tenderDeadline.EndDate)
        : null,
      detailUrl: entry.link?.$?.href || entry.link?.href || '',
      documentUrls,
      isMinorContract: false,
      rawData: entry,
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
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
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
