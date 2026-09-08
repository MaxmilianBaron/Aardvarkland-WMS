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
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { StockQuantStatus } from '../inventory.types';
import { StockAdjustmentReasonCode } from '../stock-adjustment-reason-codes';

export class MoveStockDto {
  @ApiPropertyOptional({
    description: 'Stock quant id. If omitted, skuReference and fromLocationReference are required.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  quantReference?: string;

  @ApiPropertyOptional({
    description: 'Backward-compatible alias for quantReference used by API E2E/helpers.',
    example: 'd2fd8f3c-780a-4fd5-bc6f-64f83aa49556',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromStockQuantId?: string;

  @ApiPropertyOptional({
    description: 'SKU id or code used when quantReference is omitted.',
    example: 'SKU-100001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({
    description: 'Source location id or code used when quantReference is omitted.',
    example: 'RECEIVING-01',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromLocationReference?: string;

  @ApiProperty({
    description: 'Destination location id or code in the warehouse.',
    example: 'A-01-01',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  toLocationReference!: string;

  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

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

  @ApiPropertyOptional({
    description: '3PL owner client code/id. Explicit value must match inherited quant owner.',
    example: 'CLIENT_A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: 'PUTAWAY-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ example: 'move-PUTAWAY-100001-1' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    enum: StockAdjustmentReasonCode,
    example: StockAdjustmentReasonCode.MANUAL_CORRECTION,
  })
  @IsOptional()
  @IsEnum(StockAdjustmentReasonCode)
  reasonCode?: StockAdjustmentReasonCode;

  @ApiPropertyOptional({ example: 'manual RF putaway correction' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @ApiPropertyOptional({ example: { scanner: 'RF-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
