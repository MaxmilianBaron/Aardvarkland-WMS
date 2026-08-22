import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class EvaluateReplenishmentDto {
  @ApiPropertyOptional({ example: 'MINMAX-ABC-123-A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ruleReference?: string;

  @ApiPropertyOptional({ example: { source: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
