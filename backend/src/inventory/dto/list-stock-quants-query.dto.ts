import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

import { StockQuantStatus } from '../inventory.types';

export class ListStockQuantsQueryDto {
  @ApiPropertyOptional({ description: 'SKU id or code.', example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({ description: 'Location id or code in the warehouse.', example: 'A-01-01' })
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
  expiringBefore?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  includeZero?: boolean;

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

function toOptionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes'].includes(value.toLowerCase());
  }

  return Boolean(value);
}
