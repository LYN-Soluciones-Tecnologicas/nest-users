import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TaskExecutorService } from './task-executor.service';
import { AiTaskExecution, ExecutionStatus } from '../entities/ai-task-execution.entity';
import { Tender, ContractType } from '../../tenders/entities/tender.entity';
import { AiTask } from '../entities/ai-task.entity';
import { LlmService } from '../../ai/services/llm.service';

/**
 * Tests for the AI task execution engine.
 * Validates template rendering, LLM integration, and execution tracking.
 */
describe('TaskExecutorService', () => {
  let service: TaskExecutorService;
  let executionRepo: any;
  let tenderRepo: any;
  let llmService: any;

  const sampleTender: Partial<Tender> = {
    id: 'tender-1',
    title: 'Desarrollo de aplicación web para el Ayuntamiento de Madrid',
    description: 'Diseño, desarrollo e implantación de una aplicación web de gestión documental',
    contractingAuthority: 'Ayuntamiento de Madrid',
    budgetAmount: 120000,
    cpvCodes: ['72200000', '72300000'],
    contractType: ContractType.SERVICES,
    procedureType: 'Abierto',
    submissionDeadline: new Date('2026-04-15'),
    location: 'Madrid',
    detailUrl: 'https://example.com/tender-1',
    documentUrls: ['https://example.com/pliego.pdf'],
    rawData: { expediente: 'EXP-2026-001' },
  };

  const summaryTask: Partial<AiTask> = {
    id: 'task-summary',
    name: 'Resumen ejecutivo',
    systemPrompt: 'Eres un analista de licitaciones.',
    promptTemplate:
      'Resume esta licitación:\nTÍTULO: {{tenderTitle}}\nPRESUPUESTO: {{budgetAmount}}€\nDESCRIPCIÓN: {{tenderDescription}}',
    maxTokens: 1000,
    temperature: 0.3,
    sortOrder: 1,
  };

  const proposalTask: Partial<AiTask> = {
    id: 'task-proposal',
    name: 'Propuesta técnica',
    systemPrompt: 'Eres un consultor experto.',
    promptTemplate:
      'Redacta propuesta para:\n{{tenderTitle}}\nCPV: {{cpvCodes}}\nPlazo: {{submissionDeadline}}',
    modelOverride: 'gpt-4o',
    maxTokens: 4000,
    temperature: 0.5,
    sortOrder: 2,
  };

  beforeEach(async () => {
    executionRepo = {
      create: jest.fn((data) => ({ ...data, id: 'exec-' + Math.random().toString(36).slice(2) })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    };

    tenderRepo = {
      findOne: jest.fn().mockResolvedValue(sampleTender),
    };

    llmService = {
      complete: jest.fn().mockResolvedValue({
        text: 'Resumen generado por la IA: Esta licitación trata sobre desarrollo web...',
        model: 'gpt-4o-mini',
        usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaskExecutorService,
        { provide: getRepositoryToken(AiTaskExecution), useValue: executionRepo },
        { provide: getRepositoryToken(Tender), useValue: tenderRepo },
        { provide: LlmService, useValue: llmService },
      ],
    }).compile();

    service = module.get(TaskExecutorService);
  });

  describe('template rendering', () => {
    it('should replace all {{variables}} with tender data', async () => {
      await service.executeOne(sampleTender as Tender, summaryTask as AiTask);

      const llmCall = llmService.complete.mock.calls[0][0];
      expect(llmCall.prompt).toContain('Desarrollo de aplicación web');
      expect(llmCall.prompt).toContain('120000€');
      expect(llmCall.prompt).toContain('gestión documental');
      expect(llmCall.prompt).not.toContain('{{tenderTitle}}');
      expect(llmCall.prompt).not.toContain('{{budgetAmount}}');
    });

    it('should render CPV codes as comma-separated list', async () => {
      await service.executeOne(sampleTender as Tender, proposalTask as AiTask);

      const llmCall = llmService.complete.mock.calls[0][0];
      expect(llmCall.prompt).toContain('72200000, 72300000');
    });

    it('should render submission deadline as date string', async () => {
      await service.executeOne(sampleTender as Tender, proposalTask as AiTask);

      const llmCall = llmService.complete.mock.calls[0][0];
      expect(llmCall.prompt).toContain('2026-04-15');
    });

    it('should handle missing optional fields gracefully', async () => {
      const minimalTender: Partial<Tender> = {
        id: 'tender-minimal',
        title: 'Licitación simple',
        description: null,
        budgetAmount: null,
        cpvCodes: [],
        submissionDeadline: null,
      };
      tenderRepo.findOne.mockResolvedValue(minimalTender);

      await service.executeOne(minimalTender as Tender, summaryTask as AiTask);

      const llmCall = llmService.complete.mock.calls[0][0];
      expect(llmCall.prompt).toContain('Licitación simple');
      expect(llmCall.prompt).toContain('No especificado');
    });
  });

  describe('executeOne', () => {
    it('should create execution record and call LLM', async () => {
      const result = await service.executeOne(sampleTender as Tender, summaryTask as AiTask);

      expect(result.status).toBe(ExecutionStatus.COMPLETED);
      expect(result.result).toContain('Resumen generado');
      expect(result.model).toBe('gpt-4o-mini');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should use task-specific model override', async () => {
      await service.executeOne(sampleTender as Tender, proposalTask as AiTask);

      const llmCall = llmService.complete.mock.calls[0][0];
      expect(llmCall.model).toBe('gpt-4o');
    });

    it('should use default system prompt when task has none', async () => {
      const noSystemTask = { ...summaryTask, systemPrompt: null };

      await service.executeOne(sampleTender as Tender, noSystemTask as AiTask);

      const llmCall = llmService.complete.mock.calls[0][0];
      expect(llmCall.systemPrompt).toContain('licitaciones públicas españolas');
    });

    it('should record FAILED status when LLM throws', async () => {
      llmService.complete.mockRejectedValue(new Error('API rate limit exceeded'));

      const result = await service.executeOne(sampleTender as Tender, summaryTask as AiTask);

      expect(result.status).toBe(ExecutionStatus.FAILED);
      expect(result.error).toContain('rate limit');
      expect(result.result).toBeUndefined();
    });
  });

  describe('executeTasks', () => {
    it('should run multiple tasks on multiple tenders in order', async () => {
      const results = await service.executeTasks(
        ['tender-1'],
        [summaryTask as AiTask, proposalTask as AiTask],
      );

      expect(results).toHaveLength(2);
      expect(llmService.complete).toHaveBeenCalledTimes(2);
    });

    it('should skip already completed tasks', async () => {
      executionRepo.findOne.mockResolvedValue({
        id: 'exec-existing',
        status: ExecutionStatus.COMPLETED,
        result: 'Previously generated',
      });

      const results = await service.executeTasks(
        ['tender-1'],
        [summaryTask as AiTask],
      );

      expect(results).toHaveLength(1);
      expect(results[0].result).toBe('Previously generated');
      expect(llmService.complete).not.toHaveBeenCalled();
    });

    it('should skip non-existent tenders without crashing', async () => {
      tenderRepo.findOne.mockResolvedValue(null);

      const results = await service.executeTasks(
        ['nonexistent-id'],
        [summaryTask as AiTask],
      );

      expect(results).toHaveLength(0);
    });
  });
});
