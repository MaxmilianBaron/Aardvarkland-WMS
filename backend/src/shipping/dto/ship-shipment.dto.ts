import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ShipShipmentDto {
  @ApiPropertyOptional({ example: '2026-05-11T16:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @ApiPropertyOptional({ example: 'TRK-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingReference?: string;

  @ApiPropertyOptional({ example: false, description: 'Operational override for manual/no-carrier shipments.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowShipWithoutLabel?: boolean;

  @ApiPropertyOptional({ example: { manifest: 'MNF-1' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-ship-shipment-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
