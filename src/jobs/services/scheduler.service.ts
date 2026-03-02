import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * Schedules recurring jobs for data ingestion and embedding generation.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue('ingestion') private readonly ingestionQueue: Queue,
    @InjectQueue('embedding') private readonly embeddingQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Scheduler service initialized');
  }

  /**
   * Daily ingestion at 6:00 AM — fetch new tenders from all sources.
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async scheduleDailyIngestion() {
    this.logger.log('Scheduling daily ingestion');
    await this.ingestionQueue.add('ingest-all', {}, {
      removeOnComplete: 10,
      removeOnFail: 5,
    });
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
