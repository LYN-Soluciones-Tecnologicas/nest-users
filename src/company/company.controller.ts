import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CompanyService } from './services/company.service';
import { CreateCompanyProfileDto } from './dto/company-profile.dto';

@ApiTags('company')
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get('profiles')
  @ApiOperation({ summary: 'List all company profiles' })
  listProfiles() {
    return this.companyService.listProfiles();
  }

  @Get('profiles/active')
  @ApiOperation({ summary: 'Get the active company profile' })
  getActive() {
    return this.companyService.getActiveProfile();
  }

  @Post('profiles')
  @ApiOperation({ summary: 'Create a new company profile (becomes active)' })
  createProfile(@Body() dto: CreateCompanyProfileDto) {
    return this.companyService.createProfile(dto);
  }

  @Patch('profiles/:id')
  @ApiOperation({ summary: 'Update a company profile' })
  updateProfile(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCompanyProfileDto>,
  ) {
    return this.companyService.updateProfile(id, dto);
  }

  @Post('score')
  @ApiOperation({
    summary: 'Score all tenders against active profile',
  })
  scoreTenders() {
    return this.companyService.scoreTenders();
  }

  @Get('candidates')
  @ApiOperation({
    summary: 'Get top candidate tenders for the company',
  })
  getCandidates(@Query('limit') limit?: number) {
    return this.companyService.getCandidates(limit || 50);
  }
}
