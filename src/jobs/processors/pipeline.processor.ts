import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DailyPipelineService } from '../../pipeline/services/daily-pipeline.service';

@Processor('pipeline')
export class PipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(private readonly pipeline: DailyPipelineService) {
    super();
  }

  async process(job: Job): Promise<any> {
    this.logger.log(`Processing pipeline job: ${job.name} (${job.id})`);

    switch (job.name) {
      case 'daily-pipeline':
        return this.pipeline.run();
      default:
        this.logger.warn(`Unknown pipeline job: ${job.name}`);
    }
  }
}
