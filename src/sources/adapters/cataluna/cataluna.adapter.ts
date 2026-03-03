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
 * Adapter for Cataluña public procurement data via Socrata SODA API.
 *
 * Data source: Dades Obertes de Catalunya
 * Dataset: Contractació pública a Catalunya (PSCP publications)
 * API: https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json
 *
 * Supports SoQL queries for filtering, pagination, full-text search.
 * No authentication required (app token recommended for higher rate limits).
 */
@Injectable()
export class CatalunaAdapter implements IDataSourceAdapter {
  private readonly logger = new Logger(CatalunaAdapter.name);

  readonly sourceId = 'cataluna';
  readonly sourceName = 'Contratación Pública - Cataluña (PSCP)';
  readonly region = 'cataluna';

  private readonly apiBase =
    'https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json';

  constructor(private readonly config: ConfigService) {}

  async fetch(query: SourceQuery): Promise<FetchResult> {
    const limit = query.limit || 100;
    const offset = query.pageToken ? parseInt(query.pageToken, 10) : 0;

    let url = `${this.apiBase}?$limit=${limit}&$offset=${offset}&$order=data_publicacio DESC`;

    if (query.updatedAfter) {
      const dateStr = query.updatedAfter.toISOString().split('T')[0];
      url += `&$where=data_publicacio > '${dateStr}'`;
    }

    this.logger.log(`Fetching Cataluña SODA API: offset=${offset}`);

    try {
      const responseText = await this.fetchUrl(url);
      const items = JSON.parse(responseText);

      if (!Array.isArray(items)) {
        return { tenders: [], hasMore: false };
      }

      const tenders: RawTenderData[] = items.map((item: any) =>
        this.parseItem(item),
      );

      const hasMore = items.length === limit;

      return {
        tenders,
        nextPageToken: hasMore ? String(offset + limit) : undefined,
        hasMore,
      };
    } catch (error) {
      this.logger.error(`Failed to fetch Cataluña API: ${error.message}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const url = `${this.apiBase}?$limit=1`;
      const response = await this.fetchUrl(url, 10000);
      const data = JSON.parse(response);
      return Array.isArray(data);
    } catch {
      return false;
    }
  }

  private parseItem(item: any): RawTenderData {
    const budgetValue =
      parseFloat(
        item.import_adjudicacio ||
          item.import_licitacio ||
          item.valor_estimat ||
          '0',
      ) || null;

    return {
      externalId:
        item.codi_expedient ||
        item.numero_expedient ||
        `cataluna-${Date.now()}-${Math.random()}`,
      title: item.objecte_contracte || item.denominacio || 'Sin título',
      description: item.descripcio || item.objecte_contracte || '',
      contractingAuthority:
        item.nom_organ || item.denominacio_organ || '',
      cpvCodes: item.codi_cpv ? [item.codi_cpv] : [],
      budgetAmount: budgetValue,
      currency: 'EUR',
      status: item.estat || item.fase || '',
      contractType: item.tipus_contracte || '',
      procedureType: item.procediment || '',
      location: item.ambit_geographic || 'Cataluña',
      publicationDate: item.data_publicacio
        ? new Date(item.data_publicacio)
        : new Date(),
      submissionDeadline: item.data_limit_presentacio
        ? new Date(item.data_limit_presentacio)
        : null,
      detailUrl:
        item.enllac_publicacio ||
        item.url_publicacio ||
        '',
      documentUrls: item.url_plec
        ? [item.url_plec]
        : [],
      isMinorContract:
        item.tipus_contracte?.toLowerCase().includes('menor') || false,
      rawData: item,
      // OCDS fields
      submissionMethod: ['electronicSubmission'],
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
