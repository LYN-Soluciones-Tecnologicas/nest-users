import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsArray } from 'class-validator';

export class CreateBoardDto {
  @ApiProperty({ example: 'Licitaciones Q1 2026' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateColumnDto {
  @ApiProperty({ example: 'Por revisar' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ description: 'Position after this column ID' })
  @IsOptional()
  @IsUUID()
  afterColumnId?: string;
}

export class CreateCardDto {
  @ApiPropertyOptional({ description: 'Tender ID to link' })
  @IsOptional()
  @IsUUID()
  tenderId?: string;

  @ApiProperty({ example: 'Revisar pliego técnico' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  labels?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class MoveCardDto {
  @ApiProperty({ description: 'Target column ID' })
  @IsUUID()
  targetColumnId: string;

  @ApiPropertyOptional({ description: 'Position of card above (null = first)' })
  @IsOptional()
  @IsString()
  afterPosition?: string;

  @ApiPropertyOptional({
    description: 'Position of card below (null = last)',
  })
  @IsOptional()
  @IsString()
  beforePosition?: string;
}

export class MoveColumnDto {
  @ApiPropertyOptional({ description: 'Position of column to the left' })
  @IsOptional()
  @IsString()
  afterPosition?: string;

  @ApiPropertyOptional({ description: 'Position of column to the right' })
  @IsOptional()
  @IsString()
  beforePosition?: string;
}
