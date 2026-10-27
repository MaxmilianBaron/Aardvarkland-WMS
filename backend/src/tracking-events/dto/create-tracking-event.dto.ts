import { IsDateString, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TrackingEventType } from '../tracking-events.types';

export class CreateTrackingEventDto {
  @ApiProperty({ enum: TrackingEventType, example: TrackingEventType.SCANNED })
  @IsEnum(TrackingEventType)
  type!: TrackingEventType;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  locationReference?: string;

  @ApiPropertyOptional({ example: 'Parcel scanned into picking location' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({ example: '2026-05-09T15:45:00.000Z' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ example: { scannerId: 'SCN-01', source: 'handheld' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
