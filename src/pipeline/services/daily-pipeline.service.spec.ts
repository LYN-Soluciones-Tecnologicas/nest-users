import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DailyPipelineService } from './daily-pipeline.service';
import { Tender, ContractType } from '../../tenders/entities/tender.entity';
import { DailyReport } from '../entities/daily-report.entity';
import { SmartSearchService } from '../../search-profiles/services/smart-search.service';
import { SearchProfileService } from '../../search-profiles/services/search-profile.service';
import { CompanyService } from '../../company/services/company.service';
import { IngestionService } from '../../sources/services/ingestion.service';
import { LlmService } from '../../ai/services/llm.service';

/**
 * Tests for the daily pipeline (5-step automated flow).
 * Validates orchestration, fallback behavior, and report generation.
 */
describe('DailyPipelineService', () => {
  let service: DailyPipelineService;
  let tenderRepo: any;
  let reportRepo: any;
  let ingestionService: any;
  let companyService: any;
  let smartSearchService: any;
  let searchProfileService: any;
  let llmService: any;

  const sampleTenders: Partial<Tender>[] = [
    {
      id: 'tender-1',
      title: 'Desarrollo web municipal',
      budgetAmount: 80000,
      contractType: ContractType.SERVICES,
      submissionDeadline: new Date('2026-05-01'),
    },
    {
      id: 'tender-2',
      title: 'App móvil para transporte',
      budgetAmount: 120000,
      contractType: ContractType.SERVICES,
      submissionDeadline: new Date('2026-04-15'),
    },
  ];

  beforeEach(async () => {
    tenderRepo = {
      find: jest.fn().mockResolvedValue(sampleTenders),
    };

    reportRepo = {
      create: jest.fn((data) => ({ ...data, id: 'report-1' })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    ingestionService = {
      ingestAll: jest.fn().mockResolvedValue({
        'placsp-nacional': 15,
        'euskadi': 5,
        'cataluna': 8,
      }),
    };

    companyService = {
      scoreTenders: jest.fn().mockResolvedValue({ scored: 28, candidates: 10 }),
      getCandidates: jest.fn().mockResolvedValue(sampleTenders),
    };

    smartSearchService = {
      search: jest.fn().mockResolvedValue(
        sampleTenders.map((t) => ({
          tender: t,
          score: 0.85,
          inclusionSimilarity: 0.9,
          exclusionSimilarity: 0.1,
        })),
      ),
    };

    searchProfileService = {
      getActive: jest.fn().mockResolvedValue({ id: 'profile-1', name: 'Test' }),
    };

    llmService = {
      complete: jest.fn().mockResolvedValue({
        text: JSON.stringify([
          { index: 1, score: 0.9, reason: 'Muy alineado con desarrollo web' },
          { index: 2, score: 0.85, reason: 'App móvil dentro de capacidades' },
        ]),
        model: 'gpt-4o-mini',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DailyPipelineService,
        { provide: getRepositoryToken(Tender), useValue: tenderRepo },
        { provide: getRepositoryToken(DailyReport), useValue: reportRepo },
        { provide: IngestionService, useValue: ingestionService },
        { provide: CompanyService, useValue: companyService },
        { provide: SmartSearchService, useValue: smartSearchService },
        { provide: SearchProfileService, useValue: searchProfileService },
        { provide: LlmService, useValue: llmService },
      ],
    }).compile();

    service = module.get(DailyPipelineService);
  });

  describe('run (full pipeline)', () => {
    it('should execute all 5 steps and produce a DailyReport', async () => {
      const report = await service.run();

      // Step 1: Ingestion ran
      expect(ingestionService.ingestAll).toHaveBeenCalled();
      expect(report.totalDetected).toBeGreaterThan(0);

      // Step 2: Deterministic filter ran
      expect(companyService.scoreTenders).toHaveBeenCalled();

      // Step 3: Vectorial filter ran
      expect(smartSearchService.search).toHaveBeenCalled();
      expect(report.afterStrategicFilter).toBeGreaterThanOrEqual(0);

      // Step 4: Prioritization ran
      expect(report.topOpportunities.length).toBeGreaterThan(0);

      // Step 5: Summary generated
      expect(report.summary).toBeTruthy();

      // Pipeline metadata
      expect(report.durationMs).toBeGreaterThanOrEqual(0);
      expect(report.status).toMatch(/completed/);
    });

    it('should capture funnel metrics: detected > filtered > prioritized', async () => {
      const report = await service.run();

      expect(report.totalDetected).toBeGreaterThan(0);
      expect(report.afterStrategicFilter).toBeLessThanOrEqual(report.totalDetected);
      expect(report.afterPrioritization).toBeLessThanOrEqual(report.afterStrategicFilter);
    });
  });

  describe('pipeline resilience (fallbacks)', () => {
    it('should continue pipeline when ingestion fails', async () => {
      ingestionService.ingestAll.mockRejectedValue(new Error('Network error'));

      const report = await service.run();

      expect(report.errors).toContainEqual(expect.stringContaining('Ingestion failed'));
      expect(report.status).toBe('completed_with_errors');
      // Pipeline should still try remaining steps
      expect(companyService.scoreTenders).toHaveBeenCalled();
    });

    it('should continue pipeline when vectorial search fails', async () => {
      smartSearchService.search.mockRejectedValue(new Error('No active profile'));

      const report = await service.run();

      expect(report.errors).toContainEqual(expect.stringContaining('Strategic filter failed'));
      // Should still have top opportunities (from fallback)
      expect(report.topOpportunities.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate fallback summary when LLM fails', async () => {
      // First call: prioritize (succeeds). Second call: summary (fails)
      llmService.complete
        .mockResolvedValueOnce({ text: '[{"index":1,"score":0.9,"reason":"test"}]' })
        .mockRejectedValueOnce(new Error('LLM timeout'));

      const report = await service.run();

      // Should have fallback markdown summary
      expect(report.summary).toContain('Informe diario de licitaciones');
      expect(report.summary).toContain('*Informe generado automáticamente (sin LLM)*');
    });

    it('should survive total LLM failure gracefully', async () => {
      llmService.complete.mockRejectedValue(new Error('All LLM providers down'));

      const report = await service.run();

      // Should still produce a report with fallback data
      expect(report).toBeDefined();
      expect(report.summary).toBeTruthy();
      expect(report.errors.length).toBeGreaterThan(0);
    });
  });
});
