import { Type } from 'class-transformer';
import {
  IsDateString,
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
import { StockAdjustmentReasonCode } from '../stock-adjustment-reason-codes';

export class AdjustStockDto {
  @ApiPropertyOptional({ description: 'Stock quant id. If omitted, skuReference and locationReference are required.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  quantReference?: string;

  @ApiPropertyOptional({ description: 'SKU id or code used when quantReference is omitted.', example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({ description: 'Location id or code used when quantReference is omitted.', example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationReference?: string;

  @ApiPropertyOptional({ enum: StockQuantStatus, example: StockQuantStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(StockQuantStatus)
  status?: StockQuantStatus;

  @ApiPropertyOptional({ example: 'LOT-42' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  batch?: string;

  @ApiPropertyOptional({ example: '2026-08-31T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiry?: string;

  @ApiPropertyOptional({ description: 'Absolute resulting quantity.', example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Signed delta applied to current quantity.', example: -2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quantityDelta?: number;

  @ApiPropertyOptional({ description: '3PL owner client code/id. Explicit value must match inherited quant owner.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;


  @ApiPropertyOptional({
    enum: StockAdjustmentReasonCode,
    example: StockAdjustmentReasonCode.CYCLE_COUNT_VARIANCE,
    description: 'Controlled stock correction reason code stored on the immutable ADJUST movement.',
  })
  @IsOptional()
  @IsEnum(StockAdjustmentReasonCode)
  reasonCode?: StockAdjustmentReasonCode;

  @ApiPropertyOptional({
    description: 'Human-readable explanation for the correction.',
    example: 'Cycle count found two extra units in A-01-01.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @ApiPropertyOptional({ example: 'COUNT-2026-05-09' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ example: 'adjust-COUNT-2026-05-09-SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: { reason: 'cycle-count' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
