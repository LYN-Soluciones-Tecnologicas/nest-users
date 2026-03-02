import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenderEmbedding } from './entities/tender-embedding.entity';
import { EmbeddingService } from './services/embedding.service';
import { VectorizationController } from './vectorization.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TenderEmbedding])],
  controllers: [VectorizationController],
  providers: [EmbeddingService],
  exports: [EmbeddingService],
})
export class VectorizationModule {}
