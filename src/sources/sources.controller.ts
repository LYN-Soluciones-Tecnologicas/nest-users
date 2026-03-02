import {
  Controller,
  Get,
  Post,
  Param,
  Patch,
  Body,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SourceRegistryService } from './services/source-registry.service';
import { IngestionService } from './services/ingestion.service';
import { DataSourceEntity } from './entities/data-source.entity';

@ApiTags('sources')
@Controller('sources')
export class SourcesController {
  constructor(
    private readonly registry: SourceRegistryService,
    private readonly ingestion: IngestionService,
    @InjectRepository(DataSourceEntity)
    private readonly sourceRepo: Repository<DataSourceEntity>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all registered data sources' })
  async listSources() {
    const adapters = this.registry.getAllAdapters();
    const entities = await this.sourceRepo.find();
    const entityMap = new Map(entities.map((e) => [e.id, e]));

    return adapters.map((adapter) => {
      const entity = entityMap.get(adapter.sourceId);
      return {
        sourceId: adapter.sourceId,
        name: adapter.sourceName,
        region: adapter.region,
        enabled: entity?.enabled ?? true,
        lastFetchAt: entity?.lastFetchAt || null,
        tenderCount: entity?.tenderCount || 0,
        lastError: entity?.lastError || null,
      };
    });
  }

  @Get(':sourceId/health')
  @ApiOperation({ summary: 'Check health of a data source' })
  async healthCheck(@Param('sourceId') sourceId: string) {
    const adapter = this.registry.getAdapter(sourceId);
    if (!adapter) {
      return { sourceId, healthy: false, error: 'Adapter not found' };
    }

    try {
      const healthy = await adapter.healthCheck();
      return { sourceId, healthy };
    } catch (error) {
      return { sourceId, healthy: false, error: error.message };
    }
  }

  @Post(':sourceId/ingest')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger ingestion from a specific source' })
  @ApiResponse({ status: 200, description: 'Ingestion completed' })
  async triggerIngestion(@Param('sourceId') sourceId: string) {
    const count = await this.ingestion.ingestFromSource(sourceId);
    return { sourceId, ingested: count };
  }

  @Post('ingest-all')
  @HttpCode(200)
  @ApiOperation({ summary: 'Trigger ingestion from all enabled sources' })
  async triggerIngestionAll() {
    const results = await this.ingestion.ingestAll();
    return { results };
  }

  @Patch(':sourceId')
  @ApiOperation({ summary: 'Update source configuration (enable/disable, schedule)' })
  async updateSource(
    @Param('sourceId') sourceId: string,
    @Body() body: { enabled?: boolean; fetchSchedule?: string },
  ) {
    let entity = await this.sourceRepo.findOne({ where: { id: sourceId } });
    if (!entity) {
      const adapter = this.registry.getAdapter(sourceId);
      if (!adapter) {
        return { error: 'Source not found' };
      }
      entity = this.sourceRepo.create({
        id: adapter.sourceId,
        name: adapter.sourceName,
        region: adapter.region,
      });
    }

    if (body.enabled !== undefined) entity.enabled = body.enabled;
    if (body.fetchSchedule) entity.fetchSchedule = body.fetchSchedule;

    return this.sourceRepo.save(entity);
  }
}
