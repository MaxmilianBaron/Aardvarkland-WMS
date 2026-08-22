import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class RuntimePrintJobActionDto {
  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  printerCode?: string;

  @ApiPropertyOptional({ example: 'PACK-PC-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  agentCode?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  copies?: number;

  @ApiPropertyOptional({ example: { reason: 'Operator retry from print console' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'runtime-reprint-job-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
