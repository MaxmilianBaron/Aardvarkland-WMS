import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class ConfirmWarehouseTaskDto {
  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  fromLocationReference?: string;

  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  toLocationReference?: string;

  @ApiPropertyOptional({ example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 'HU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  handlingUnitReference?: string;

  @ApiPropertyOptional({ example: { source: 'scanner' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-confirm-task-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
