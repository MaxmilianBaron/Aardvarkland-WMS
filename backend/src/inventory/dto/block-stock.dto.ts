import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { StockQuantStatus } from '../inventory.types';

export class BlockStockDto {
  @ApiPropertyOptional({ description: 'Quantity to block. Defaults to the full quant quantity.', example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ enum: StockQuantStatus, example: StockQuantStatus.BLOCKED })
  @IsOptional()
  @IsEnum(StockQuantStatus)
  targetStatus?: StockQuantStatus;

  @ApiPropertyOptional({ example: 'damaged packaging' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @ApiPropertyOptional({ example: 'QC-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ example: 'block-QC-100001-SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: { source: 'quality-control' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
