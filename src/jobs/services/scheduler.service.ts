import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Schedules recurring jobs for data ingestion, embedding generation,
 * and the daily pipeline.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue('ingestion') private readonly ingestionQueue: Queue,
    @InjectQueue('embedding') private readonly embeddingQueue: Queue,
    @InjectQueue('pipeline') private readonly pipelineQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Scheduler service initialized');
  }

  /**
   * Daily at 6:00 AM — run embeddings for any new tenders.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scheduleEarlyEmbeddings() {
    this.logger.log('Scheduling morning embedding batch');
    await this.embeddingQueue.add(
      'embed-batch',
      { batchSize: 500 },
      { removeOnComplete: 10, removeOnFail: 5 },
    );
  }

  /**
   * Daily at 7:00 AM — run the full daily pipeline
   * (ingest + filter + vectorial search + prioritize + report).
   */
  @Cron('0 7 * * *')
  async scheduleDailyPipeline() {
    this.logger.log('Scheduling daily pipeline');
    await this.pipelineQueue.add(
      'daily-pipeline',
      {},
      { removeOnComplete: 10, removeOnFail: 5 },
    );
  }

  /**
   * Every 4 hours — generate embeddings for new tenders.
   */
  @Cron('0 */4 * * *')
  async scheduleEmbeddingBatch() {
    this.logger.log('Scheduling embedding batch');
    await this.embeddingQueue.add(
      'embed-batch',
      { batchSize: 200 },
      {
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
  }

  /**
   * Manually trigger ingestion for a specific source.
   */
  async triggerIngestion(sourceId: string) {
    await this.ingestionQueue.add(
      'ingest-source',
      { sourceId },
      {
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
  }

  /**
   * Manually trigger embedding for a specific tender.
   */
  async triggerEmbedding(tenderId: string) {
    await this.embeddingQueue.add(
      'embed-tender',
      { tenderId },
      {
        removeOnComplete: 10,
        removeOnFail: 5,
      },
    );
  }
}
