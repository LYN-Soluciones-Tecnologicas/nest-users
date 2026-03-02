import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tender } from '../tenders/entities/tender.entity';
import { IngestionProcessor } from './processors/ingestion.processor';
import { EmbeddingProcessor } from './processors/embedding.processor';
import { PipelineProcessor } from './processors/pipeline.processor';
import { SchedulerService } from './services/scheduler.service';
import { SourcesModule } from '../sources/sources.module';
import { VectorizationModule } from '../vectorization/vectorization.module';
import { PipelineModule } from '../pipeline/pipeline.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'ingestion' }),
    BullModule.registerQueue({ name: 'embedding' }),
    BullModule.registerQueue({ name: 'pipeline' }),
    TypeOrmModule.forFeature([Tender]),
    SourcesModule,
    VectorizationModule,
    PipelineModule,
  ],
  providers: [
    IngestionProcessor,
    EmbeddingProcessor,
    PipelineProcessor,
    SchedulerService,
  ],
  exports: [SchedulerService],
})
export class JobsModule {}
