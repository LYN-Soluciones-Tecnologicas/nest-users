import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { TenderStatus, ContractType } from '../entities/tender.entity';

export class SearchTendersDto {
  @ApiPropertyOptional({ description: 'Text search in title/description' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: TenderStatus })
  @IsOptional()
  @IsEnum(TenderStatus)
  status?: TenderStatus;

  @ApiPropertyOptional({ enum: ContractType })
  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @ApiPropertyOptional({ description: 'Filter by source ID' })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Filter by region' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional({ description: 'Filter by CPV codes', type: [String] })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',') : value,
  )
  cpvCodes?: string[];

  @ApiPropertyOptional({ description: 'Minimum budget amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minBudget?: number;

  @ApiPropertyOptional({ description: 'Maximum budget amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxBudget?: number;

  @ApiPropertyOptional({ description: 'Include minor contracts' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeMinorContracts?: boolean;

  @ApiPropertyOptional({ description: 'Only show saved tenders' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  savedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Hide dismissed tenders', default: true })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hideDismissed?: boolean;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Sort by field',
    default: 'publicationDate',
  })
  @IsOptional()
  @IsString()
  sortBy?: string = 'publicationDate';

  @ApiPropertyOptional({ description: 'Sort direction', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsString()
  sortDir?: 'ASC' | 'DESC' = 'DESC';
}
