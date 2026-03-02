import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class CreateSearchProfileDto {
  @ApiProperty({ example: 'Desarrollo Software LYN' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Perfil principal de búsqueda para LYN Soluciones' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example:
      'desarrollo de software, páginas web, aplicaciones móviles, inteligencia artificial, chatbots, WordPress, Drupal, diseño UX/UI, consultoría tecnológica, mantenimiento aplicaciones',
  })
  @IsString()
  inclusionPrompt: string;

  @ApiPropertyOptional({
    example:
      'ENS alto, ENS medio, ISO 27001, ISO 9001, certificaciones de calidad, obras de construcción, suministro de hardware, limpieza, seguridad física, vigilancia',
  })
  @IsOptional()
  @IsString()
  exclusionPrompt?: string;

  @ApiPropertyOptional({ default: 0.5, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  inclusionThreshold?: number;

  @ApiPropertyOptional({ default: 0.6, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  exclusionThreshold?: number;

  @ApiPropertyOptional({ default: 0.7, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  inclusionWeight?: number;

  @ApiPropertyOptional({ default: 0.3, minimum: 0, maximum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  exclusionWeight?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  useLlmReranking?: boolean;

  @ApiPropertyOptional({
    description: 'Custom LLM prompt for re-ranking. Variables: {{tenderTitle}}, {{tenderDescription}}, {{inclusionCriteria}}, {{exclusionCriteria}}',
  })
  @IsOptional()
  @IsString()
  llmRerankingPrompt?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(200)
  llmRerankingTopN?: number;
}

export class UpdateSearchProfileDto extends CreateSearchProfileDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  inclusionPrompt: string;
}

export class SmartSearchQueryDto {
  @ApiPropertyOptional({ description: 'Search profile ID to use. If not provided, uses the active profile.' })
  @IsOptional()
  @IsString()
  profileId?: string;

  @ApiPropertyOptional({ description: 'Max results', default: 50 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ description: 'Override: use LLM re-ranking for this query' })
  @IsOptional()
  @IsBoolean()
  useLlmReranking?: boolean;
}
