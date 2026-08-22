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
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { InboundStatus } from '../inbound.types';

export class CreateInboundShipmentLineDto {
  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  lineNumber?: string;

  @ApiProperty({ example: 'SKU-100001' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sku!: string;

  @ApiPropertyOptional({ example: 'Black hoodie L' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiProperty({ example: 24 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedQuantity!: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity?: number;

  @ApiPropertyOptional({
    description: 'Existing parcel id or tracking number in the same warehouse.',
    example: 'PKG-100001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  parcelReference?: string;

  @ApiPropertyOptional({ example: { lot: 'LOT-42' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateInboundShipmentDto {
  @ApiProperty({ example: 'ASN-100001' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shipmentNumber!: string;

  @ApiPropertyOptional({ enum: InboundStatus, example: InboundStatus.EXPECTED })
  @IsOptional()
  @IsEnum(InboundStatus)
  status?: InboundStatus;

  @ApiPropertyOptional({ example: 'Supplier CZ s.r.o.' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supplierName?: string;

  @ApiPropertyOptional({ example: 'SUP-CZ-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierReference?: string;

  @ApiPropertyOptional({ example: 'PO-2026-00042' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  purchaseOrderReference?: string;

  @ApiPropertyOptional({ example: 'ERP-IN-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;

  @ApiPropertyOptional({
    description: 'Receiving dock/location code or id for the scheduled inbound appointment.',
    example: 'RCV-01',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  dockLocationReference?: string;

  @ApiPropertyOptional({ example: '2026-05-10T08:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @ApiPropertyOptional({ example: '2026-05-10T07:45:00.000Z' })
  @IsOptional()
  @IsDateString()
  appointmentStartAt?: string;

  @ApiPropertyOptional({ example: '2026-05-10T08:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  appointmentEndAt?: string;

  @ApiPropertyOptional({ example: '2026-05-10T10:30:00.000Z' })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;


  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { source: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [CreateInboundShipmentLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInboundShipmentLineDto)
  lines?: CreateInboundShipmentLineDto[];
}
