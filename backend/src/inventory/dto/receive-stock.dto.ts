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

export class ReceiveStockDto {
  @ApiProperty({ description: 'SKU id or code.', example: 'SKU-100001' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  skuReference!: string;

  @ApiProperty({ description: 'Location id or code in the warehouse.', example: 'RECEIVING-01' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  locationReference!: string;

  @ApiProperty({ example: 24 })
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

  @ApiPropertyOptional({ description: '3PL owner client code/id. Explicit value must match inherited quant owner.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: 'ASN-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ example: 'receive-ASN-100001-1' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: { source: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
