import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { StockMovementType } from '../inventory.types';

export class ListStockMovementsQueryDto {
  @ApiPropertyOptional({ enum: StockMovementType, example: StockMovementType.RECEIVE })
  @IsOptional()
  @IsEnum(StockMovementType)
  type?: StockMovementType;

  @ApiPropertyOptional({ description: 'SKU id or code.', example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({ description: 'Stock quant id.', example: '6fd30737-cb4e-4a85-a9f7-7f0bb06d5e4b' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  quantReference?: string;

  @ApiPropertyOptional({ description: 'Location id or code used as source or destination.', example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationReference?: string;

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

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @ApiPropertyOptional({ example: '2026-05-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  @ApiPropertyOptional({ description: '3PL owner client id/code used to scope the list.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  skip?: number;
}
