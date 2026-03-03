import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiTask } from '../entities/ai-task.entity';
import {
  AiTaskExecution,
  ExecutionStatus,
} from '../entities/ai-task-execution.entity';
import { Tender } from '../../tenders/entities/tender.entity';
import { LlmService } from '../../ai/services/llm.service';

/**
 * Executes AI tasks on tenders by rendering prompt templates
 * with tender data and sending them to the configured LLM.
 */
@Injectable()
export class TaskExecutorService {
  private readonly logger = new Logger(TaskExecutorService.name);

  constructor(
    @InjectRepository(AiTaskExecution)
    private readonly executionRepo: Repository<AiTaskExecution>,
    @InjectRepository(Tender)
    private readonly tenderRepo: Repository<Tender>,
    private readonly llmService: LlmService,
  ) {}

  /**
   * Execute a set of tasks on a set of tenders.
   * Returns execution IDs for tracking.
   */
  async executeTasks(
    tenderIds: string[],
    tasks: AiTask[],
  ): Promise<AiTaskExecution[]> {
    const executions: AiTaskExecution[] = [];

    for (const tenderId of tenderIds) {
      const tender = await this.tenderRepo.findOne({
        where: { id: tenderId },
      });
      if (!tender) {
        this.logger.warn(`Tender ${tenderId} not found, skipping`);
        continue;
      }

      // Sort tasks by sortOrder
      const sortedTasks = [...tasks].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );

      for (const task of sortedTasks) {
        // Check if already executed (avoid duplicates)
        const existing = await this.executionRepo.findOne({
          where: {
            tenderId,
            taskId: task.id,
            status: ExecutionStatus.COMPLETED,
          },
        });
        if (existing) {
          this.logger.log(
            `Task "${task.name}" already completed for tender ${tenderId}, skipping`,
          );
          executions.push(existing);
          continue;
        }

        const execution = await this.executeOne(tender, task);
        executions.push(execution);
      }
    }

    return executions;
  }

  /**
   * Execute a single task on a single tender.
   */
  async executeOne(
    tender: Tender,
    task: AiTask,
  ): Promise<AiTaskExecution> {
    // Create execution record
    let execution = this.executionRepo.create({
      tenderId: tender.id,
      taskId: task.id,
      status: ExecutionStatus.RUNNING,
    });
    execution = await this.executionRepo.save(execution);

    const startTime = Date.now();

    try {
      // Render prompt template with tender data
      const renderedPrompt = this.renderTemplate(task.promptTemplate, tender);
      execution.renderedPrompt = renderedPrompt;

      this.logger.log(
        `Executing task "${task.name}" on tender "${tender.title?.slice(0, 50)}"`,
      );

      // Call LLM
      const response = await this.llmService.complete({
        systemPrompt:
          task.systemPrompt ||
          'Eres un analista experto en licitaciones públicas españolas. Responde de forma profesional y estructurada.',
        prompt: renderedPrompt,
        model: task.modelOverride || undefined,
        maxTokens: task.maxTokens,
        temperature: task.temperature,
      });

      execution.result = response.text;
      execution.model = response.model;
      execution.usage = response.usage;
      execution.status = ExecutionStatus.COMPLETED;
      execution.durationMs = Date.now() - startTime;

      this.logger.log(
        `Task "${task.name}" completed in ${execution.durationMs}ms`,
      );
    } catch (error) {
      execution.status = ExecutionStatus.FAILED;
      execution.error = error.message;
      execution.durationMs = Date.now() - startTime;

      this.logger.error(
        `Task "${task.name}" failed for tender ${tender.id}: ${error.message}`,
      );
    }

    return this.executionRepo.save(execution);
  }

  /**
   * Get all executions for a tender.
   */
  async getExecutionsForTender(
    tenderId: string,
  ): Promise<AiTaskExecution[]> {
    return this.executionRepo.find({
      where: { tenderId },
      relations: ['task'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Get all executions for a task.
   */
  async getExecutionsForTask(taskId: string): Promise<AiTaskExecution[]> {
    return this.executionRepo.find({
      where: { taskId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Re-execute a specific execution (retry or regenerate).
   */
  async reExecute(executionId: string): Promise<AiTaskExecution> {
    const existing = await this.executionRepo.findOne({
      where: { id: executionId },
      relations: ['task'],
    });
    if (!existing) throw new Error(`Execution ${executionId} not found`);

    const tender = await this.tenderRepo.findOne({
      where: { id: existing.tenderId },
    });
    if (!tender) throw new Error(`Tender ${existing.tenderId} not found`);

    return this.executeOne(tender, existing.task);
  }

  /**
   * Render a prompt template by replacing {{variable}} placeholders
   * with actual tender data.
   */
  private renderTemplate(template: string, tender: Tender): string {
    const replacements: Record<string, string> = {
      // Legacy variables
      tenderTitle: tender.title || '',
      tenderDescription: tender.description || '',
      contractingAuthority: tender.contractingAuthority || '',
      budgetAmount: tender.budgetAmount?.toString() || 'No especificado',
      cpvCodes: (tender.cpvCodes || []).join(', ') || 'No especificado',
      contractType: tender.contractType || '',
      procedureType: tender.procedureType || '',
      submissionDeadline: tender.submissionDeadline
        ? tender.submissionDeadline.toISOString().split('T')[0]
        : 'No especificado',
      location: tender.location || '',
      detailUrl: tender.detailUrl || '',
      documentUrls: (tender.documentUrls || []).join('\n') || 'No disponibles',
      rawData: tender.rawData
        ? JSON.stringify(tender.rawData, null, 2).slice(0, 5000)
        : 'No disponible',
      // OCDS variables
      ocid: tender.ocid || 'No disponible',
      procurementMethod: tender.procurementMethod || 'No especificado',
      procurementMethodDetails: tender.procurementMethodDetails || '',
      mainProcurementCategory: tender.mainProcurementCategory || 'No especificado',
      ocdsStatus: tender.ocdsStatus || 'No especificado',
      awardCriteria: tender.awardCriteria || 'No especificado',
      awardCriteriaDetails: tender.awardCriteriaDetails || 'No disponible',
      eligibilityCriteria: tender.eligibilityCriteria || 'No disponible',
      tenderValue: tender.value
        ? `${tender.value.amount} ${tender.value.currency}`
        : 'No especificado',
      tenderPeriod: tender.tenderPeriod
        ? `${tender.tenderPeriod.startDate || '?'} — ${tender.tenderPeriod.endDate || '?'}`
        : 'No especificado',
      procuringEntityName: tender.procuringEntity?.name || tender.contractingAuthority || '',
      ocdsItems: (tender.items || [])
        .map((item) =>
          `${item.classification?.id || ''} ${item.classification?.description || item.description || ''}`.trim(),
        )
        .join(', ') || 'No especificado',
    };

    let result = template;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(
        new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
        value,
      );
    }

    return result;
  }
}
