import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { EmbeddingService } from './services/embedding.service';

@ApiTags('search')
@Controller('search')
export class VectorizationController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Get('similar')
  @ApiOperation({
    summary: 'Find similar tenders by semantic text search',
  })
  async findSimilar(
    @Query('q') query: string,
    @Query('limit') limit?: number,
  ) {
    return this.embeddingService.findSimilar(query, limit || 10);
  }

  @Post('embed')
  @ApiOperation({
    summary: 'Generate embedding for a text (for testing)',
  })
  async embed(@Body() body: { text: string }) {
    const embedding = await this.embeddingService.generateEmbedding(body.text);
    return {
      dimension: embedding.length,
      preview: embedding.slice(0, 10),
    };
  }
}
