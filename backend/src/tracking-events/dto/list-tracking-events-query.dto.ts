import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsOptional, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { TrackingEventType } from '../tracking-events.types';

export class ListTrackingEventsQueryDto {
  @ApiPropertyOptional({ enum: TrackingEventType })
  @IsOptional()
  @IsEnum(TrackingEventType)
  type?: TrackingEventType;

  @ApiPropertyOptional({ example: 'PKG-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  parcelReference?: string;

  @ApiPropertyOptional({ example: 'scan' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: '2026-05-09T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-10T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  skip?: number;
}
