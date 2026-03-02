import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyPipelineService } from './services/daily-pipeline.service';
import { DailyReport } from './entities/daily-report.entity';

@ApiTags('pipeline')
@Controller('pipeline')
export class PipelineController {
  constructor(
    private readonly pipeline: DailyPipelineService,
    @InjectRepository(DailyReport)
    private readonly reportRepo: Repository<DailyReport>,
  ) {}

  @Post('run')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Execute the daily pipeline manually',
    description:
      'Runs the full 5-step pipeline: Ingest → Deterministic Filter → ' +
      'Vectorial Strategic Fit → LLM Prioritization → Summary Report. ' +
      'Can take several minutes depending on data volume and LLM speed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily report with funnel metrics and top opportunities',
  })
  async runPipeline() {
    return this.pipeline.run();
  }

  @Get('reports')
  @ApiOperation({ summary: 'List daily reports' })
  async listReports(
    @Query('limit') limit?: number,
  ) {
    return this.reportRepo.find({
      order: { reportDate: 'DESC' },
      take: limit || 30,
    });
  }

  @Get('reports/latest')
  @ApiOperation({ summary: 'Get the latest daily report' })
  async getLatestReport() {
    return this.reportRepo.findOne({
      where: {},
      order: { reportDate: 'DESC' },
    });
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a daily report by ID' })
  async getReport(@Param('id') id: string) {
    return this.reportRepo.findOne({ where: { id } });
  }
}
