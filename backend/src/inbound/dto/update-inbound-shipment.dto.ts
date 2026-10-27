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

import { InboundStatus } from '../inbound.types';

export class UpdateInboundShipmentLineDto {
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

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedQuantity?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity?: number;

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

  @ApiPropertyOptional({ example: { lot: 'LOT-42' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}

export class UpdateInboundShipmentDto {
  @ApiPropertyOptional({ example: 'ASN-100001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shipmentNumber?: string;

  @ApiPropertyOptional({ enum: InboundStatus, example: InboundStatus.RECEIVING })
  @IsOptional()
  @IsEnum(InboundStatus)
  status?: InboundStatus;

  @ApiPropertyOptional({ example: 'Supplier CZ s.r.o.', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(160)
  supplierName?: string | null;

  @ApiPropertyOptional({ example: 'SUP-CZ-001', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  supplierReference?: string | null;

  @ApiPropertyOptional({ example: 'PO-2026-00042', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  purchaseOrderReference?: string | null;

  @ApiPropertyOptional({ example: 'ERP-IN-100001', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  externalReference?: string | null;

  @ApiPropertyOptional({
    description: 'Receiving dock/location code or id for the scheduled inbound appointment.',
    example: 'RCV-01',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  dockLocationReference?: string | null;

  @ApiPropertyOptional({ example: '2026-05-10T08:00:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  expectedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-05-10T07:45:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  appointmentStartAt?: string | null;

  @ApiPropertyOptional({ example: '2026-05-10T08:30:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  appointmentEndAt?: string | null;

  @ApiPropertyOptional({ example: '2026-05-10T10:30:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  receivedAt?: string | null;

  @ApiPropertyOptional({ example: { source: 'manual' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ type: [UpdateInboundShipmentLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateInboundShipmentLineDto)
  lines?: UpdateInboundShipmentLineDto[];
}
