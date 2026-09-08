import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { ReplenishmentStrategy } from '../replenishment.types';

export class CreateReplenishmentRuleDto {
  @ApiPropertyOptional({ example: 'MINMAX-ABC-123-A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @ApiPropertyOptional({ enum: ReplenishmentStrategy, example: ReplenishmentStrategy.MIN_MAX })
  @IsOptional()
  @IsEnum(ReplenishmentStrategy)
  strategy?: ReplenishmentStrategy;

  @ApiPropertyOptional({ example: 'ABC-123' })
  @IsString()
  @MaxLength(120)
  sku!: string;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsString()
  @MaxLength(120)
  pickLocationReference!: string;

  @ApiPropertyOptional({ example: 'BULK' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceZone?: string;

  @ApiPropertyOptional({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQuantity!: number;

  @ApiPropertyOptional({ example: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxQuantity!: number;

  @ApiPropertyOptional({ example: 40 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  targetQuantity!: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority?: number;

  @ApiPropertyOptional({ example: { note: 'fast mover' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
