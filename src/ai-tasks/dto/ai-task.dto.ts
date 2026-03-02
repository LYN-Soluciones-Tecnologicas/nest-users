import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsUUID,
  Min,
  Max,
} from 'class-validator';

export class CreateAiTaskDto {
  @ApiProperty({ example: 'Resumen ejecutivo' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'Genera un resumen de la licitación en 3-5 frases',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example:
      'Eres un analista experto en licitaciones públicas españolas. Responde de forma concisa y profesional.',
  })
  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @ApiProperty({
    example:
      'Genera un resumen ejecutivo de esta licitación:\n\nTÍTULO: {{tenderTitle}}\nORGANISMO: {{contractingAuthority}}\nPRESUPUESTO: {{budgetAmount}}€\nDESCRIPCIÓN: {{tenderDescription}}\n\nIncluye: objetivo, alcance, presupuesto y plazo.',
  })
  @IsString()
  promptTemplate: string;

  @ApiPropertyOptional({
    description: 'Model override (e.g. gpt-4o for complex tasks)',
  })
  @IsOptional()
  @IsString()
  modelOverride?: string;

  @ApiPropertyOptional({ default: 2000 })
  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(8000)
  maxTokens?: number;

  @ApiPropertyOptional({ default: 0.3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateAiTaskDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  promptTemplate?: string;

  @IsOptional()
  @IsString()
  modelOverride?: string;

  @IsOptional()
  @IsNumber()
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateAiTaskGroupDto {
  @ApiProperty({ example: 'Análisis rápido' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    example: 'Resumen + criterios de adjudicación para evaluación inicial',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Task IDs to include in the group',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  taskIds: string[];
}

export class UpdateAiTaskGroupDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  taskIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ExecuteTasksDto {
  @ApiProperty({
    description: 'Tender IDs to process',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  tenderIds: string[];

  @ApiPropertyOptional({
    description: 'Specific task IDs to run. If omitted, uses groupId.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  taskIds?: string[];

  @ApiPropertyOptional({
    description: 'Task group ID. All tasks in the group will be executed.',
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
