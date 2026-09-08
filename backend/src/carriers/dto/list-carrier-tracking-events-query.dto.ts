import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListCarrierTrackingEventsQueryDto {
  @ApiPropertyOptional({ example: 'CARRIER_A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @ApiPropertyOptional({ example: 'IN_TRANSIT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

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

  @ApiPropertyOptional({ example: '2026-05-11T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-05-12T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
