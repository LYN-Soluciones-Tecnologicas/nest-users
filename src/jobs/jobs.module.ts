import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tender } from '../tenders/entities/tender.entity';
import { IngestionProcessor } from './processors/ingestion.processor';
import { EmbeddingProcessor } from './processors/embedding.processor';
import { SchedulerService } from './services/scheduler.service';
import { SourcesModule } from '../sources/sources.module';
import { VectorizationModule } from '../vectorization/vectorization.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'ingestion' }),
    BullModule.registerQueue({ name: 'embedding' }),
    TypeOrmModule.forFeature([Tender]),
    SourcesModule,
    VectorizationModule,
  ],
  providers: [IngestionProcessor, EmbeddingProcessor, SchedulerService],
  exports: [SchedulerService],
})
export class JobsModule {}
