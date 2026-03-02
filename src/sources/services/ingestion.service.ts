import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SourceRegistryService } from './source-registry.service';
import { DataSourceEntity } from '../entities/data-source.entity';
import { Tender, TenderStatus, ContractType } from '../../tenders/entities/tender.entity';
import {
  RawTenderData,
  SourceQuery,
} from '../../common/interfaces/data-source.interface';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly registry: SourceRegistryService,
    @InjectRepository(DataSourceEntity)
    private readonly sourceRepo: Repository<DataSourceEntity>,
    @InjectRepository(Tender)
    private readonly tenderRepo: Repository<Tender>,
  ) {}

  /**
   * Run ingestion for a specific source.
   * Fetches new/updated tenders and upserts them into the DB.
   */
  async ingestFromSource(sourceId: string): Promise<number> {
    const adapter = this.registry.getAdapter(sourceId);
    if (!adapter) {
      throw new Error(`Source adapter not found: ${sourceId}`);
    }

    let sourceEntity = await this.sourceRepo.findOne({
      where: { id: sourceId },
    });

    if (!sourceEntity) {
      sourceEntity = this.sourceRepo.create({
        id: adapter.sourceId,
        name: adapter.sourceName,
        region: adapter.region,
      });
      await this.sourceRepo.save(sourceEntity);
    }

    this.logger.log(`Starting ingestion from: ${adapter.sourceName}`);

    const query: SourceQuery = {
      updatedAfter: sourceEntity.lastFetchAt || undefined,
      pageToken: sourceEntity.lastPageToken || undefined,
      includeMinorContracts: true,
    };

    let totalIngested = 0;

    try {
      let hasMore = true;

      while (hasMore) {
        const result = await adapter.fetch(query);

        for (const raw of result.tenders) {
          await this.upsertTender(sourceId, raw);
          totalIngested++;
        }

        hasMore = result.hasMore;
        query.pageToken = result.nextPageToken;

        // Save progress
        sourceEntity.lastPageToken = result.nextPageToken || null;
        await this.sourceRepo.save(sourceEntity);

        this.logger.log(
          `Ingested batch of ${result.tenders.length} from ${adapter.sourceName} (total: ${totalIngested})`,
        );
      }

      sourceEntity.lastFetchAt = new Date();
      sourceEntity.lastError = null;
      sourceEntity.tenderCount += totalIngested;
      await this.sourceRepo.save(sourceEntity);

      this.logger.log(
        `Completed ingestion from ${adapter.sourceName}: ${totalIngested} tenders`,
      );
    } catch (error) {
      sourceEntity.lastError = error.message;
      await this.sourceRepo.save(sourceEntity);
      this.logger.error(
        `Ingestion failed for ${adapter.sourceName}: ${error.message}`,
      );
      throw error;
    }

    return totalIngested;
  }

  /**
   * Run ingestion for all enabled sources.
   */
  async ingestAll(): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const adapters = this.registry.getAllAdapters();

    for (const adapter of adapters) {
      const sourceEntity = await this.sourceRepo.findOne({
        where: { id: adapter.sourceId },
      });

      if (sourceEntity && !sourceEntity.enabled) {
        this.logger.log(`Skipping disabled source: ${adapter.sourceName}`);
        continue;
      }

      try {
        results[adapter.sourceId] = await this.ingestFromSource(
          adapter.sourceId,
        );
      } catch (error) {
        results[adapter.sourceId] = -1;
        this.logger.error(
          `Failed to ingest from ${adapter.sourceName}: ${error.message}`,
        );
      }
    }

    return results;
  }

  private async upsertTender(
    sourceId: string,
    raw: RawTenderData,
  ): Promise<Tender> {
    let tender = await this.tenderRepo.findOne({
      where: { sourceId, externalId: raw.externalId },
    });

    if (!tender) {
      tender = this.tenderRepo.create();
    }

    tender.sourceId = sourceId;
    tender.externalId = raw.externalId;
    tender.title = raw.title;
    tender.description = raw.description || null;
    tender.contractingAuthority = raw.contractingAuthority || null;
    tender.cpvCodes = raw.cpvCodes || [];
    tender.budgetAmount = raw.budgetAmount || null;
    tender.currency = raw.currency || 'EUR';
    tender.status = this.mapStatus(raw.status);
    tender.contractType = this.mapContractType(raw.contractType);
    tender.procedureType = raw.procedureType || null;
    tender.location = raw.location || null;
    tender.submissionDeadline = raw.submissionDeadline || null;
    tender.publicationDate = raw.publicationDate || null;
    tender.detailUrl = raw.detailUrl || null;
    tender.documentUrls = raw.documentUrls || [];
    tender.isMinorContract = raw.isMinorContract || false;
    tender.rawData = raw.rawData || null;

    // Build text for embedding
    tender.embeddingText = [raw.title, raw.description, raw.contractingAuthority]
      .filter(Boolean)
      .join(' | ');

    return this.tenderRepo.save(tender);
  }

  private mapStatus(status?: string): TenderStatus {
    if (!status) return TenderStatus.UNKNOWN;
    const s = status.toLowerCase();
    if (s.includes('publicad') || s.includes('publish')) return TenderStatus.PUBLISHED;
    if (s.includes('abiert') || s.includes('open')) return TenderStatus.OPEN;
    if (s.includes('cerrad') || s.includes('closed')) return TenderStatus.CLOSED;
    if (s.includes('adjudic') || s.includes('award')) return TenderStatus.AWARDED;
    if (s.includes('resuelt') || s.includes('resolv')) return TenderStatus.RESOLVED;
    if (s.includes('cancel') || s.includes('anulad')) return TenderStatus.CANCELLED;
    return TenderStatus.UNKNOWN;
  }

  private mapContractType(type?: string): ContractType {
    if (!type) return ContractType.OTHER;
    const t = type.toLowerCase();
    if (t.includes('servicio') || t.includes('service')) return ContractType.SERVICES;
    if (t.includes('obra') || t.includes('work')) return ContractType.WORKS;
    if (t.includes('suministro') || t.includes('suppl')) return ContractType.SUPPLIES;
    if (t.includes('mixt') || t.includes('mixed')) return ContractType.MIXED;
    return ContractType.OTHER;
  }
}
