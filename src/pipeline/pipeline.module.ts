import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyReport } from './entities/daily-report.entity';
import { Tender } from '../tenders/entities/tender.entity';
import { DailyPipelineService } from './services/daily-pipeline.service';
import { PipelineController } from './pipeline.controller';
import { SourcesModule } from '../sources/sources.module';
import { CompanyModule } from '../company/company.module';
import { SearchProfilesModule } from '../search-profiles/search-profiles.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyReport, Tender]),
    SourcesModule,
    CompanyModule,
    SearchProfilesModule,
    AiModule,
  ],
  controllers: [PipelineController],
  providers: [DailyPipelineService],
  exports: [DailyPipelineService],
})
export class PipelineModule {}
