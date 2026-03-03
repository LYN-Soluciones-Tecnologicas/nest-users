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
import {
  OcdsTenderStatus,
  OcdsProcurementMethod,
  OcdsProcurementCategory,
  OcdsValue,
  OcdsPeriod,
  OcdsItem,
  OcdsDocument,
  OcdsOrganizationReference,
  OcdsOrganization,
  OcdsPartyRole,
} from '../../common/ocds';

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

    // ─── Legacy fields ──────────────────────────────────────────────────

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

    // ─── OCDS fields ────────────────────────────────────────────────────

    // OCID: use provided or generate from source prefix + external ID
    tender.ocid = raw.ocid || this.buildOcid(sourceId, raw.externalId);

    // OCDS status mapping
    tender.ocdsStatus = this.mapToOcdsStatus(raw.status);

    // Procurement method: use provided OCDS field or map from procedureType
    tender.procurementMethod =
      this.mapToOcdsProcurementMethod(raw.procurementMethod) ||
      this.mapToOcdsProcurementMethod(raw.procedureType);
    tender.procurementMethodDetails =
      raw.procurementMethodDetails || raw.procedureType || null;

    // Main procurement category: use provided or map from contractType
    tender.mainProcurementCategory =
      this.mapToOcdsProcurementCategory(raw.mainProcurementCategory) ||
      this.mapToOcdsProcurementCategory(raw.contractType);

    // OCDS Value
    tender.value = this.buildOcdsValue(
      raw.budgetAmount,
      raw.currency || 'EUR',
    );

    // OCDS tender period
    tender.tenderPeriod = this.buildOcdsPeriod(
      raw.tenderPeriod?.startDate || raw.publicationDate?.toISOString(),
      raw.tenderPeriod?.endDate || raw.submissionDeadline?.toISOString(),
    );

    // OCDS items from CPV codes (or use structured items if provided)
    tender.items = raw.items?.length
      ? raw.items
      : this.buildOcdsItems(raw.cpvCodes);

    // OCDS procuring entity
    tender.procuringEntity = raw.procuringEntity ||
      this.buildOcdsProcuringEntity(raw.contractingAuthority);

    // OCDS parties
    tender.parties = raw.parties?.length
      ? raw.parties
      : this.buildOcdsParties(raw.contractingAuthority);

    // OCDS documents
    tender.documents = raw.documents?.length
      ? raw.documents
      : this.buildOcdsDocuments(raw.documentUrls);

    // Optional OCDS fields
    tender.milestones = raw.milestones || [];
    tender.amendments = raw.amendments || [];
    tender.awardCriteria = raw.awardCriteria || null;
    tender.awardCriteriaDetails = raw.awardCriteriaDetails || null;
    tender.eligibilityCriteria = raw.eligibilityCriteria || null;
    tender.submissionMethod = raw.submissionMethod || null;
    tender.numberOfTenderers = raw.numberOfTenderers || null;
    tender.language = raw.language || 'es';
    tender.releaseTag = ['tender'];

    // Build text for embedding
    tender.embeddingText = [raw.title, raw.description, raw.contractingAuthority]
      .filter(Boolean)
      .join(' | ');

    return this.tenderRepo.save(tender);
  }

  // ─── OCDS builder helpers ───────────────────────────────────────────────────

  private buildOcid(sourceId: string, externalId: string): string {
    // OCDS prefix: ocds-{publisher-prefix}-{identifier}
    // Using source ID as publisher prefix
    const prefix = sourceId.replace(/[^a-z0-9]/gi, '');
    return `ocds-${prefix}-${externalId}`;
  }

  private buildOcdsValue(
    amount?: number,
    currency?: string,
  ): OcdsValue | null {
    if (amount == null) return null;
    return { amount, currency: currency || 'EUR' };
  }

  private buildOcdsPeriod(
    startDate?: string,
    endDate?: string,
  ): OcdsPeriod | null {
    if (!startDate && !endDate) return null;
    return {
      startDate: startDate || null,
      endDate: endDate || null,
    };
  }

  private buildOcdsItems(cpvCodes?: string[]): OcdsItem[] {
    if (!cpvCodes?.length) return [];
    return cpvCodes.map((code, index) => ({
      id: String(index + 1),
      classification: {
        scheme: 'CPV',
        id: code,
        description: null,
      },
    }));
  }

  private buildOcdsProcuringEntity(
    name?: string,
  ): OcdsOrganizationReference | null {
    if (!name) return null;
    return {
      id: this.slugify(name),
      name,
    };
  }

  private buildOcdsParties(name?: string): OcdsOrganization[] {
    if (!name) return [];
    return [
      {
        id: this.slugify(name),
        name,
        roles: [OcdsPartyRole.PROCURING_ENTITY],
      },
    ];
  }

  private buildOcdsDocuments(urls?: string[]): OcdsDocument[] {
    if (!urls?.length) return [];
    return urls.map((url, index) => ({
      id: String(index + 1),
      url,
    }));
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  // ─── Status mapping ─────────────────────────────────────────────────────────

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

  private mapToOcdsStatus(status?: string): OcdsTenderStatus {
    if (!status) return OcdsTenderStatus.PLANNED;
    const s = status.toLowerCase();
    if (s.includes('publicad') || s.includes('publish')) return OcdsTenderStatus.PLANNED;
    if (s.includes('abiert') || s.includes('open')) return OcdsTenderStatus.ACTIVE;
    if (s.includes('cerrad') || s.includes('closed')) return OcdsTenderStatus.ACTIVE;
    if (s.includes('adjudic') || s.includes('award')) return OcdsTenderStatus.COMPLETE;
    if (s.includes('resuelt') || s.includes('resolv')) return OcdsTenderStatus.COMPLETE;
    if (s.includes('cancel') || s.includes('anulad')) return OcdsTenderStatus.CANCELLED;
    if (s.includes('desiert') || s.includes('unsuccess')) return OcdsTenderStatus.UNSUCCESSFUL;
    if (s.includes('retir') || s.includes('withdraw')) return OcdsTenderStatus.WITHDRAWN;
    return OcdsTenderStatus.PLANNED;
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

  private mapToOcdsProcurementMethod(
    method?: string,
  ): OcdsProcurementMethod | null {
    if (!method) return null;
    const m = method.toLowerCase();
    if (m.includes('abiert') || m.includes('open')) return OcdsProcurementMethod.OPEN;
    if (m.includes('restringid') || m.includes('selective') || m.includes('restrict'))
      return OcdsProcurementMethod.SELECTIVE;
    if (m.includes('negociad') || m.includes('limited') || m.includes('negotiat'))
      return OcdsProcurementMethod.LIMITED;
    if (m.includes('direct') || m.includes('menor') || m.includes('minor'))
      return OcdsProcurementMethod.DIRECT;
    return null;
  }

  private mapToOcdsProcurementCategory(
    category?: string,
  ): OcdsProcurementCategory | null {
    if (!category) return null;
    const c = category.toLowerCase();
    if (c.includes('servicio') || c.includes('service') || c === 'services')
      return OcdsProcurementCategory.SERVICES;
    if (c.includes('obra') || c.includes('work') || c === 'works')
      return OcdsProcurementCategory.WORKS;
    if (c.includes('suministro') || c.includes('suppl') || c.includes('good') || c === 'goods')
      return OcdsProcurementCategory.GOODS;
    return null;
  }
}
