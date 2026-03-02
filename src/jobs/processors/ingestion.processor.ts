import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IngestionService } from '../../sources/services/ingestion.service';

export interface IngestionJobData {
  sourceId?: string;
}

@Processor('ingestion')
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly ingestionService: IngestionService) {
    super();
  }

  async process(job: Job<IngestionJobData>): Promise<any> {
    this.logger.log(`Processing ingestion job: ${job.name} (${job.id})`);

    switch (job.name) {
      case 'ingest-source':
        return this.ingestSource(job.data);
      case 'ingest-all':
        return this.ingestAll();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async ingestSource(data: IngestionJobData) {
    if (!data.sourceId) {
      throw new Error('sourceId is required');
    }

    const count = await this.ingestionService.ingestFromSource(data.sourceId);
    this.logger.log(`Ingested ${count} tenders from ${data.sourceId}`);
    return { sourceId: data.sourceId, count };
  }

  private async ingestAll() {
    const results = await this.ingestionService.ingestAll();
    this.logger.log(`Ingestion complete: ${JSON.stringify(results)}`);
    return results;
  }
}
