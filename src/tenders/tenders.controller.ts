import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TendersService } from './services/tenders.service';
import { OcdsExportService } from './services/ocds-export.service';
import { SearchTendersDto } from './dto/search-tenders.dto';

@ApiTags('tenders')
@Controller('tenders')
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    private readonly ocdsExportService: OcdsExportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter tenders' })
  search(@Query() dto: SearchTendersDto) {
    return this.tendersService.search(dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get tender statistics' })
  getStats() {
    return this.tendersService.getStats();
  }

  @Get('ocds/releases')
  @ApiOperation({ summary: 'Export tenders as OCDS release package' })
  async getOcdsReleases(@Query() dto: SearchTendersDto) {
    const result = await this.tendersService.search(dto);
    const baseUri = '/api/tenders/ocds/releases';
    return this.ocdsExportService.buildReleasePackage(result.items, baseUri);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tender by ID' })
  findOne(@Param('id') id: string) {
    return this.tendersService.findById(id);
  }

  @Get(':id/ocds')
  @ApiOperation({ summary: 'Export a single tender as OCDS release' })
  async getOcdsRelease(@Param('id') id: string) {
    const tender = await this.tendersService.findById(id);
    return this.ocdsExportService.buildRelease(tender);
  }

  @Patch(':id/save')
  @ApiOperation({ summary: 'Mark a tender as saved (candidate)' })
  save(@Param('id') id: string) {
    return this.tendersService.saveTender(id);
  }

  @Patch(':id/dismiss')
  @ApiOperation({ summary: 'Dismiss a tender (not relevant)' })
  dismiss(@Param('id') id: string) {
    return this.tendersService.dismissTender(id);
  }
}
