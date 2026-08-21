import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { WarehouseOrderType } from '../warehouse-orders.types';

export class CreateWarehouseOrderLineDto {
  @ApiProperty({ example: '1' })
  @IsString()
  @MaxLength(40)
  lineNumber!: string;

  @ApiPropertyOptional({ example: 'SKU-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({ example: 'LOT-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotReference?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  requestedQuantity?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  serialRequired?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateWarehouseOrderDto {
  @ApiPropertyOptional({ example: 'WO-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  orderNumber?: string;

  @ApiProperty({ enum: WarehouseOrderType, example: WarehouseOrderType.MOVE })
  @IsEnum(WarehouseOrderType)
  orderType!: WarehouseOrderType;

  @ApiPropertyOptional({ example: 'client-id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ownerClientId?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;

  @ApiPropertyOptional({ example: 'OUTBOUND_ORDER' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceType?: string;

  @ApiPropertyOptional({ example: 'source-id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceId?: string;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromLocationReference?: string;

  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  toLocationReference?: string;

  @ApiPropertyOptional({ example: '2026-05-12T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiProperty({ type: [CreateWarehouseOrderLineDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateWarehouseOrderLineDto)
  lines!: CreateWarehouseOrderLineDto[];
}
