import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CarrierTrackingWebhookDto {
  @ApiPropertyOptional({ example: 'CARRIER_A-EVT-987654321' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  externalEventId?: string;

  @ApiPropertyOptional({ example: 'CARRIER_A-9C7A4D2B' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  labelReference?: string;

  @ApiPropertyOptional({ example: 'CARRIER_A-TRACK-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  trackingNumber?: string;

  @ApiPropertyOptional({ example: 'SHP-202605110001' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  shipmentReference?: string;

  @ApiPropertyOptional({ example: 'SHP-202605110001-PKG-001' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  packageReference?: string;

  @ApiPropertyOptional({ example: 'IN_TRANSIT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  @ApiPropertyOptional({ example: 'DEPARTED_SORT_CENTER' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventCode?: string;

  @ApiPropertyOptional({ example: 'Package left carrier sort center.' })
  @IsOptional()
  @IsString()
  @MaxLength(800)
  message?: string;

  @ApiPropertyOptional({ example: '2026-05-11T14:15:00.000Z' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ example: { carrierDepot: 'PRG-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { rawStatus: 'Departed terminal' } })
  @IsOptional()
  @IsObject()
  rawPayload?: Record<string, unknown>;
}
