import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmPutawayTaskDto {
  @ApiPropertyOptional({
    description:
      'Scanned source StockQuant id. If omitted, the task metadata stockQuantId is used.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  stockQuantReference?: string;

  @ApiPropertyOptional({ description: 'Scanned source location id or code.', example: 'RCV-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromLocationReference?: string;

  @ApiPropertyOptional({
    description: 'Scanned target location id or code. If omitted, the task target is used.',
    example: 'A-01-01',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toLocationReference?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: 'putaway-task-100001-confirm' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: { scanner: 'RF-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
