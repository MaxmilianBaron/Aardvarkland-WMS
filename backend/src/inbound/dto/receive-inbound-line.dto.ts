import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceiveInboundLineDto {
  @ApiPropertyOptional({
    description: 'Inbound line id or line number. Omit for an unexpected SKU receive.',
    example: '1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lineReference?: string;

  @ApiPropertyOptional({
    description: 'Existing SKU code/barcode. Required when receiving an unexpected SKU.',
    example: 'ABC-123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @ApiPropertyOptional({ example: 'Unexpected black hoodie L' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiProperty({ description: 'Good/available quantity being received.', example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Damaged quantity received into non-available stock.',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  damagedQuantity?: number;

  @ApiPropertyOptional({ enum: ['DAMAGED', 'QUARANTINE'], example: 'DAMAGED' })
  @IsOptional()
  @IsIn(['DAMAGED', 'QUARANTINE'])
  damagedStockStatus?: 'DAMAGED' | 'QUARANTINE';

  @ApiPropertyOptional({ example: 'Broken packaging found during receiving.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  damageReason?: string;

  @ApiPropertyOptional({
    description:
      'Receiving quality check result. HOLD and FAILED receive stock into quarantine and create an exception.',
    enum: ['PASSED', 'HOLD', 'FAILED'],
    example: 'PASSED',
  })
  @IsOptional()
  @IsIn(['PASSED', 'HOLD', 'FAILED'])
  qualityStatus?: 'PASSED' | 'HOLD' | 'FAILED';

  @ApiPropertyOptional({ example: 'QC-2026-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  qualityReference?: string;

  @ApiPropertyOptional({ example: 'Packaging checked during receiving.' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  qualityNotes?: string;

  @ApiPropertyOptional({ description: 'Receiving or staging location.', example: 'RCV-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationReference?: string;

  @ApiPropertyOptional({ description: 'Override target putaway location.', example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  putawayLocationReference?: string;

  @ApiPropertyOptional({ example: 'LOT-2026-05' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  batch?: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiry?: string;

  @ApiPropertyOptional({ example: 'LOT-2026-05', description: 'Lot code/reference. Required when SKU metadata traceability.lotRequired is true.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotReference?: string;

  @ApiPropertyOptional({
    example: ['SN-0001', 'SN-0002'],
    description: 'Good-unit serial numbers captured at receiving. Required per unit when SKU metadata traceability.serialRequired is true.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional({
    example: ['SN-DMG-0001'],
    description: 'Damaged/quarantined-unit serial numbers captured at receiving.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  damagedSerialNumbers?: string[];

  @ApiPropertyOptional({ example: 'receive-ASN-100001-1' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  createPutawayTask?: boolean;

  @ApiPropertyOptional({
    description: 'Allow receiving a SKU that is not on the ASN.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  allowUnexpectedSku?: boolean;

  @ApiPropertyOptional({
    description: 'Allow receiving more than expected and create an exception.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  allowOverReceive?: boolean;

  @ApiPropertyOptional({
    description: 'Close the line as short if received quantity is below expected.',
    example: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toOptionalBoolean(value))
  @IsBoolean()
  completeLine?: boolean;


  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { scanner: 'RF-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
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
