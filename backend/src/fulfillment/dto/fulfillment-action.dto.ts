import {
  IsArray,
  IsDateString,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReleasePickingDto {
  @ApiPropertyOptional({
    description: '3PL owner client id/code used to enforce restricted client access.',
    example: 'CLIENT_A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { wave: 'WAVE-1' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-release-picking-order-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class PackOrderDto {
  @ApiPropertyOptional({
    description: '3PL owner client id/code used to enforce restricted client access.',
    example: 'CLIENT_A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: 'PACK-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  packageReference?: string;

  @ApiPropertyOptional({
    example: ['SN-0001'],
    description: 'Serials packed for this order. If omitted, previously picked serials are packed automatically for serial-tracked SKUs.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional({ example: { station: 'PACK-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-pack-order-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class ShipOrderDto {
  @ApiPropertyOptional({
    description: '3PL owner client id/code used to enforce restricted client access.',
    example: 'CLIENT_A',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

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

  @ApiPropertyOptional({ example: 'PKG-100001', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  trackingReference?: string | null;

  @ApiPropertyOptional({ example: '2026-05-09T18:30:00.000Z', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  shippedAt?: string | null;

  @ApiPropertyOptional({
    example: ['SN-0001'],
    description: 'Serials shipped for this order. If omitted, previously packed serials are shipped automatically for serial-tracked SKUs.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  serialNumbers?: string[];

  @ApiPropertyOptional({ example: { dock: 'SHIP-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-ship-order-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
