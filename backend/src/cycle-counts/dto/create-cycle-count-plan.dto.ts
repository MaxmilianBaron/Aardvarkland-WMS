import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { CycleCountScopeType } from '../cycle-counts.types';

export class CreateCycleCountPlanDto {
  @ApiPropertyOptional({ example: 'CC-A-01-2026-05-11' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ enum: CycleCountScopeType, example: CycleCountScopeType.LOCATION })
  @IsOptional()
  @IsEnum(CycleCountScopeType)
  scopeType?: CycleCountScopeType;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  scopeReference?: string;

  @ApiPropertyOptional({ example: { reason: 'weekly cycle count' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
