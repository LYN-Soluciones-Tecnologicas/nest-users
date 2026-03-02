import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
} from 'class-validator';

export class CreateCompanyProfileDto {
  @ApiProperty({ example: 'LYN Soluciones Tecnológicas' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'Empresa de servicios tecnológicos, desarrollo de software, consultoría IT',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'CPV codes the company can bid on',
    example: ['72000000', '72200000', '72300000'],
  })
  @IsArray()
  cpvCodes: string[];

  @ApiProperty({
    description: 'Keywords describing capabilities',
    example: ['software', 'desarrollo', 'web', 'aplicaciones', 'consultoría', 'IT'],
  })
  @IsArray()
  keywords: string[];

  @ApiPropertyOptional({ description: 'Max contract value', example: 500000 })
  @IsOptional()
  @IsNumber()
  maxBudget?: number;

  @ApiPropertyOptional({ description: 'Min contract value worth pursuing', example: 5000 })
  @IsOptional()
  @IsNumber()
  minBudget?: number;

  @ApiPropertyOptional({
    description: 'Preferred contract types',
    example: ['services'],
  })
  @IsOptional()
  @IsArray()
  preferredContractTypes?: string[];

  @ApiPropertyOptional({
    description: 'Preferred regions',
    example: ['nacional', 'cataluna', 'euskadi'],
  })
  @IsOptional()
  @IsArray()
  preferredRegions?: string[];

  @ApiPropertyOptional({
    description: 'Keywords to exclude',
    example: ['obras', 'construcción', 'limpieza'],
  })
  @IsOptional()
  @IsArray()
  excludeKeywords?: string[];
}
