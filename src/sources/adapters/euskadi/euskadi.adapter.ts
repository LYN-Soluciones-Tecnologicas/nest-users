import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import {
  IDataSourceAdapter,
  RawTenderData,
  FetchResult,
  SourceQuery,
} from '../../../common/interfaces/data-source.interface';

/**
 * Adapter for Open Data Euskadi - Contrataciones Públicas REST API.
 *
 * API base: https://opendata.euskadi.eus/webopd00-apicontract/es
 * Endpoints:
 *   - /procurements  (C-Contrats: contracts)
 *   - /notices        (CN-Contracting Notices)
 *
 * Returns JSON data from KontratazioA platform (800+ contracting authorities).
 */
@Injectable()
export class EuskadiAdapter implements IDataSourceAdapter {
  private readonly logger = new Logger(EuskadiAdapter.name);

  readonly sourceId = 'euskadi';
  readonly sourceName = 'Open Data Euskadi - KontratazioA';
  readonly region = 'euskadi';

  private readonly apiUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = this.config.get<string>('euskadi.apiUrl');
  }

  async fetch(query: SourceQuery): Promise<FetchResult> {
    const page = query.pageToken ? parseInt(query.pageToken, 10) : 1;
    const limit = query.limit || 50;

    const url = `${this.apiUrl}?api=procurements&_page=${page}&_pageSize=${limit}`;
    this.logger.log(`Fetching Euskadi API: ${url}`);

    try {
      const responseText = await this.fetchUrl(url);
      const data = JSON.parse(responseText);

      const items = data.procurements || data.items || data.results || [];
      const tenders: RawTenderData[] = (Array.isArray(items) ? items : []).map(
        (item: any) => this.parseItem(item),
      );

      const totalCount = data.totalCount || data.total || 0;
      const hasMore = tenders.length === limit;

      return {
        tenders,
        nextPageToken: hasMore ? String(page + 1) : undefined,
        totalCount,
        hasMore,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Euskadi API: ${error.message}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.apiUrl}?api=procurements&_page=1&_pageSize=1`;
      const response = await this.fetchUrl(url, 10000);
      JSON.parse(response);
      return true;
    } catch {
      return false;
    }
  }

  private parseItem(item: any): RawTenderData {
    return {
      externalId: item.id || item.contractId || item.expediente || `euskadi-${Date.now()}`,
      title: item.title || item.objeto || item.contractObject || 'Sin título',
      description: item.description || item.descripcion || '',
      contractingAuthority:
        item.contractingAuthority ||
        item.organContractacio ||
        item.poderAdjudicador ||
        '',
      cpvCodes: item.cpvCodes || (item.cpv ? [item.cpv] : []),
      budgetAmount: parseFloat(item.amount || item.importe || item.presupuesto || '0') || null,
      currency: 'EUR',
      status: item.status || item.estado || '',
      contractType: item.contractType || item.tipoContrato || '',
      procedureType: item.procedureType || item.tipoProcedimiento || '',
      location: item.location || 'Euskadi',
      publicationDate: item.publishDate
        ? new Date(item.publishDate)
        : item.fechaPublicacion
          ? new Date(item.fechaPublicacion)
          : new Date(),
      submissionDeadline: item.deadline
        ? new Date(item.deadline)
        : item.fechaLimite
          ? new Date(item.fechaLimite)
          : null,
      detailUrl: item.url || item.link || '',
      documentUrls: item.documents
        ? item.documents.map((d: any) => d.url || d)
        : [],
      isMinorContract:
        item.isMinorContract ||
        item.contratoMenor ||
        false,
      rawData: item,
    };
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
