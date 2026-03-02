import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchProfile } from './entities/search-profile.entity';
import { TenderEmbedding } from '../vectorization/entities/tender-embedding.entity';
import { Tender } from '../tenders/entities/tender.entity';
import { SearchProfileService } from './services/search-profile.service';
import { SmartSearchService } from './services/smart-search.service';
import { SearchProfilesController } from './search-profiles.controller';
import { VectorizationModule } from '../vectorization/vectorization.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SearchProfile, TenderEmbedding, Tender]),
    VectorizationModule,
    AiModule,
  ],
  controllers: [SearchProfilesController],
  providers: [SearchProfileService, SmartSearchService],
  exports: [SearchProfileService, SmartSearchService],
})
export class SearchProfilesModule {}
