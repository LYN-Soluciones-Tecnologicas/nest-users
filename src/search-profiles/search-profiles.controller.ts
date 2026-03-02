import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SearchProfileService } from './services/search-profile.service';
import { SmartSearchService } from './services/smart-search.service';
import {
  CreateSearchProfileDto,
  UpdateSearchProfileDto,
  SmartSearchQueryDto,
} from './dto/search-profile.dto';

@ApiTags('search-profiles')
@Controller('search-profiles')
export class SearchProfilesController {
  constructor(
    private readonly profileService: SearchProfileService,
    private readonly smartSearchService: SmartSearchService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new search profile',
    description:
      'Define inclusion/exclusion criteria in natural language. ' +
      'The prompts are vectorized for semantic matching against tender embeddings.',
  })
  async create(@Body() dto: CreateSearchProfileDto) {
    return this.profileService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all search profiles' })
  async list() {
    return this.profileService.list();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the active search profile' })
  async getActive() {
    return this.profileService.getActive();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a search profile by ID' })
  async findById(@Param('id') id: string) {
    return this.profileService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a search profile',
    description: 'If prompts change, embeddings are regenerated automatically.',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateSearchProfileDto) {
    return this.profileService.update(id, dto);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Set a profile as the active one' })
  async activate(@Param('id') id: string) {
    return this.profileService.activate(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a search profile' })
  async delete(@Param('id') id: string) {
    await this.profileService.delete(id);
    return { deleted: true };
  }

  /**
   * Smart vectorial search endpoint.
   * This is the main search — uses semantic similarity, NOT text matching.
   */
  @Post('search')
  @ApiOperation({
    summary: 'Execute smart vectorial search',
    description:
      'Compares all tender embeddings against the search profile\'s inclusion/exclusion ' +
      'criteria using cosine similarity. Optionally re-ranks with LLM for deeper analysis. ' +
      'Returns tenders sorted by composite relevance score.',
  })
  @ApiResponse({
    status: 200,
    description:
      'List of tenders with vectorial relevance scores (inclusionSimilarity, exclusionSimilarity, composite score)',
  })
  async smartSearch(@Body() dto: SmartSearchQueryDto) {
    return this.smartSearchService.search(
      dto.profileId,
      dto.limit || 50,
      dto.useLlmReranking,
    );
  }
}
