import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IngestionService } from './ingestion.service';
import { SourceRegistryService } from './source-registry.service';
import { DataSourceEntity } from '../entities/data-source.entity';
import { Tender, TenderStatus, ContractType } from '../../tenders/entities/tender.entity';
import {
  OcdsTenderStatus,
  OcdsProcurementMethod,
  OcdsProcurementCategory,
} from '../../common/ocds';

/**
 * Tests for the data ingestion pipeline.
 * Validates tender normalization, upsert behavior, and status mapping.
 */
describe('IngestionService', () => {
  let service: IngestionService;
  let registry: any;
  let sourceRepo: any;
  let tenderRepo: any;

  const mockAdapter = {
    sourceId: 'test-source',
    sourceName: 'Test Source',
    region: 'test',
    fetch: jest.fn(),
    healthCheck: jest.fn(),
  };

  beforeEach(async () => {
    mockAdapter.fetch.mockReset();
    mockAdapter.healthCheck.mockReset();

    registry = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
      getAllAdapters: jest.fn().mockReturnValue([mockAdapter]),
    };

    sourceRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'test-source',
        name: 'Test Source',
        region: 'test',
        enabled: true,
        lastFetchAt: null,
        lastPageToken: null,
        tenderCount: 0,
      }),
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    tenderRepo = {
      findOne: jest.fn().mockResolvedValue(null), // No existing tender
      create: jest.fn(() => ({} as Tender)),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        { provide: SourceRegistryService, useValue: registry },
        { provide: getRepositoryToken(DataSourceEntity), useValue: sourceRepo },
        { provide: getRepositoryToken(Tender), useValue: tenderRepo },
      ],
    }).compile();

    service = module.get(IngestionService);
  });

  describe('ingestFromSource', () => {
    it('should ingest tenders from a source and create them in DB', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [
          {
            externalId: 'EXP-001',
            title: 'Desarrollo de software',
            description: 'Servicio de desarrollo',
            budgetAmount: 50000,
            cpvCodes: ['72000000'],
            status: 'Abierta',
            contractType: 'Servicios',
          },
        ],
        hasMore: false,
      });

      const count = await service.ingestFromSource('test-source');

      expect(count).toBe(1);
      expect(tenderRepo.save).toHaveBeenCalledTimes(1);

      const savedTender = tenderRepo.save.mock.calls[0][0];
      expect(savedTender.externalId).toBe('EXP-001');
      expect(savedTender.title).toBe('Desarrollo de software');
      expect(savedTender.budgetAmount).toBe(50000);
    });

    it('should upsert existing tenders instead of creating duplicates', async () => {
      const existingTender = {
        id: 'existing-uuid',
        sourceId: 'test-source',
        externalId: 'EXP-001',
        title: 'Old title',
      };
      tenderRepo.findOne.mockResolvedValue(existingTender);

      mockAdapter.fetch.mockResolvedValue({
        tenders: [
          { externalId: 'EXP-001', title: 'Updated title', status: 'Adjudicada' },
        ],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      // Should update the existing entity, not create new
      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.id).toBe('existing-uuid');
      expect(saved.title).toBe('Updated title');
    });

    it('should build embeddingText from title + description + authority', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [
          {
            externalId: 'EXP-002',
            title: 'Chatbot IA',
            description: 'Servicio de chatbot',
            contractingAuthority: 'Ministerio de Sanidad',
          },
        ],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.embeddingText).toBe('Chatbot IA | Servicio de chatbot | Ministerio de Sanidad');
    });

    it('should paginate through multiple pages', async () => {
      mockAdapter.fetch
        .mockResolvedValueOnce({
          tenders: [{ externalId: 'P1', title: 'Page 1' }],
          hasMore: true,
          nextPageToken: 'page-2',
        })
        .mockResolvedValueOnce({
          tenders: [{ externalId: 'P2', title: 'Page 2' }],
          hasMore: false,
        });

      const count = await service.ingestFromSource('test-source');

      expect(count).toBe(2);
      expect(mockAdapter.fetch).toHaveBeenCalledTimes(2);
    });

    it('should throw when adapter not found', async () => {
      registry.getAdapter.mockReturnValue(null);

      await expect(service.ingestFromSource('nonexistent')).rejects.toThrow(
        'Source adapter not found',
      );
    });
  });

  describe('status mapping', () => {
    it.each([
      ['Publicada', TenderStatus.PUBLISHED],
      ['Abierta', TenderStatus.OPEN],
      ['Cerrada', TenderStatus.CLOSED],
      ['Adjudicada', TenderStatus.AWARDED],
      ['Resuelta', TenderStatus.RESOLVED],
      ['Anulada', TenderStatus.CANCELLED],
      ['Something unknown', TenderStatus.UNKNOWN],
    ])('should map "%s" to %s', async (rawStatus, expectedStatus) => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'STATUS-TEST', title: 'Test', status: rawStatus }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.status).toBe(expectedStatus);
    });
  });

  describe('contract type mapping', () => {
    it.each([
      ['Servicios', ContractType.SERVICES],
      ['Obras', ContractType.WORKS],
      ['Suministros', ContractType.SUPPLIES],
      ['Mixto', ContractType.MIXED],
      ['Otro', ContractType.OTHER],
    ])('should map "%s" to %s', async (rawType, expectedType) => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'TYPE-TEST', title: 'Test', contractType: rawType }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.contractType).toBe(expectedType);
    });
  });

  // ─── OCDS field mapping tests ─────────────────────────────────────────────

  describe('OCDS field mapping', () => {
    it('should generate ocid from source ID and external ID', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'EXP-001', title: 'Test' }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.ocid).toBe('ocds-testsource-EXP-001');
    });

    it('should use provided ocid when available', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'EXP-001',
          title: 'Test',
          ocid: 'ocds-custom-12345',
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.ocid).toBe('ocds-custom-12345');
    });

    it.each([
      ['Abierta', OcdsTenderStatus.ACTIVE],
      ['Publicada', OcdsTenderStatus.PLANNED],
      ['Adjudicada', OcdsTenderStatus.COMPLETE],
      ['Anulada', OcdsTenderStatus.CANCELLED],
      ['Resuelta', OcdsTenderStatus.COMPLETE],
    ])('should map "%s" to OCDS status %s', async (rawStatus, expectedOcdsStatus) => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'OCDS-STATUS', title: 'Test', status: rawStatus }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.ocdsStatus).toBe(expectedOcdsStatus);
    });

    it.each([
      ['Abierto', OcdsProcurementMethod.OPEN],
      ['Restringido', OcdsProcurementMethod.SELECTIVE],
      ['Negociado', OcdsProcurementMethod.LIMITED],
      ['Menor', OcdsProcurementMethod.DIRECT],
    ])('should map procedure "%s" to OCDS procurement method %s', async (rawProcedure, expected) => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'METHOD-TEST', title: 'Test', procedureType: rawProcedure }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.procurementMethod).toBe(expected);
    });

    it.each([
      ['Servicios', OcdsProcurementCategory.SERVICES],
      ['Obras', OcdsProcurementCategory.WORKS],
      ['Suministros', OcdsProcurementCategory.GOODS],
    ])('should map contract type "%s" to OCDS category %s', async (rawType, expected) => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'CAT-TEST', title: 'Test', contractType: rawType }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.mainProcurementCategory).toBe(expected);
    });

    it('should build OCDS value from budget amount and currency', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'VAL-TEST',
          title: 'Test',
          budgetAmount: 100000,
          currency: 'EUR',
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.value).toEqual({ amount: 100000, currency: 'EUR' });
    });

    it('should build OCDS items from CPV codes', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'CPV-TEST',
          title: 'Test',
          cpvCodes: ['72000000', '72200000'],
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.items).toHaveLength(2);
      expect(saved.items[0]).toEqual({
        id: '1',
        classification: { scheme: 'CPV', id: '72000000', description: null },
      });
      expect(saved.items[1].classification.id).toBe('72200000');
    });

    it('should build OCDS procuring entity from contracting authority', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'ENT-TEST',
          title: 'Test',
          contractingAuthority: 'Ayuntamiento de Madrid',
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.procuringEntity).toEqual({
        id: 'ayuntamiento-de-madrid',
        name: 'Ayuntamiento de Madrid',
      });
    });

    it('should build OCDS parties from contracting authority', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'PARTY-TEST',
          title: 'Test',
          contractingAuthority: 'Ministerio de Defensa',
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.parties).toHaveLength(1);
      expect(saved.parties[0].name).toBe('Ministerio de Defensa');
      expect(saved.parties[0].roles).toContain('procuringEntity');
    });

    it('should build OCDS documents from document URLs', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'DOC-TEST',
          title: 'Test',
          documentUrls: ['https://example.com/pliego.pdf', 'https://example.com/anexo.pdf'],
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.documents).toHaveLength(2);
      expect(saved.documents[0]).toEqual({ id: '1', url: 'https://example.com/pliego.pdf' });
      expect(saved.documents[1]).toEqual({ id: '2', url: 'https://example.com/anexo.pdf' });
    });

    it('should build OCDS tender period from publication date and submission deadline', async () => {
      const pubDate = new Date('2026-01-01T00:00:00Z');
      const deadline = new Date('2026-02-15T12:00:00Z');

      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'PERIOD-TEST',
          title: 'Test',
          publicationDate: pubDate,
          submissionDeadline: deadline,
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.tenderPeriod).toEqual({
        startDate: pubDate.toISOString(),
        endDate: deadline.toISOString(),
      });
    });

    it('should set default language to "es"', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'LANG-TEST', title: 'Test' }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.language).toBe('es');
    });

    it('should set releaseTag to ["tender"]', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'TAG-TEST', title: 'Test' }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.releaseTag).toEqual(['tender']);
    });

    it('should prefer explicitly provided OCDS items over auto-generated ones', async () => {
      const customItems = [
        { id: '1', description: 'Software', classification: { scheme: 'CPV', id: '72000000', description: 'IT' } },
      ];

      mockAdapter.fetch.mockResolvedValue({
        tenders: [{
          externalId: 'PREF-TEST',
          title: 'Test',
          cpvCodes: ['72000000', '72200000'],
          items: customItems,
        }],
        hasMore: false,
      });

      await service.ingestFromSource('test-source');

      const saved = tenderRepo.save.mock.calls[0][0];
      expect(saved.items).toEqual(customItems);
    });
  });

  describe('ingestAll', () => {
    it('should ingest from all enabled sources', async () => {
      mockAdapter.fetch.mockResolvedValue({
        tenders: [{ externalId: 'ALL-1', title: 'Test' }],
        hasMore: false,
      });

      const results = await service.ingestAll();

      expect(results['test-source']).toBe(1);
    });

    it('should skip disabled sources', async () => {
      sourceRepo.findOne.mockResolvedValue({
        id: 'test-source',
        enabled: false,
      });

      const results = await service.ingestAll();

      expect(mockAdapter.fetch).not.toHaveBeenCalled();
      expect(results).toEqual({});
    });

    it('should continue with other sources when one fails', async () => {
      const adapter2 = { ...mockAdapter, sourceId: 'source-2' };
      registry.getAllAdapters.mockReturnValue([mockAdapter, adapter2]);
      mockAdapter.fetch.mockRejectedValue(new Error('Network error'));
      adapter2.fetch = jest.fn().mockResolvedValue({
        tenders: [{ externalId: 'S2-1', title: 'From source 2' }],
        hasMore: false,
      });

      const results = await service.ingestAll();

      expect(results['test-source']).toBe(-1); // Error marker
    });
  });
});
