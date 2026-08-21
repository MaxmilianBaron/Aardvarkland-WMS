import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { OutboundStatus } from '../outbound.types';

export class UpdateOutboundOrderLineDto {
  @ApiProperty({ description: 'Line id or line number.', example: '1' })
  @IsString()
  @MaxLength(80)
  lineReference!: string;

  @ApiPropertyOptional({ example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sku?: string;

  @ApiPropertyOptional({ example: 'Black hoodie L', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(240)
  description?: string | null;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  orderedQuantity?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pickedQuantity?: number;

  @ApiPropertyOptional({
    description: 'Existing parcel id or tracking number in the same warehouse. Use null to clear.',
    example: 'PKG-100001',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  parcelReference?: string | null;

  @ApiPropertyOptional({ example: { wave: 'WAVE-1' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateOutboundOrderDto {
  @ApiPropertyOptional({ example: 'SO-100001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  orderNumber?: string;

  @ApiPropertyOptional({ enum: OutboundStatus, example: OutboundStatus.PICKING })
  @IsOptional()
  @IsEnum(OutboundStatus)
  status?: OutboundStatus;

  @ApiPropertyOptional({ example: 'CUST-REF-42', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  customerReference?: string | null;

  @ApiPropertyOptional({ example: 'Jane Receiver', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(160)
  recipientName?: string | null;

  @ApiPropertyOptional({ example: 'CARRIER_A', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  carrier?: string | null;

  @ApiPropertyOptional({ example: 'EXPRESS', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  serviceLevel?: string | null;

  @ApiPropertyOptional({ example: '2026-05-11T14:00:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  shipBy?: string | null;

  @ApiPropertyOptional({ example: '2026-05-11T16:30:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  shippedAt?: string | null;

  @ApiPropertyOptional({ example: { source: 'manual' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: [UpdateOutboundOrderLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOutboundOrderLineDto)
  lines?: UpdateOutboundOrderLineDto[];
}
