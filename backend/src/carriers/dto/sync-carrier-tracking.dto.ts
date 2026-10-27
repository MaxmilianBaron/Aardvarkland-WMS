import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class SyncCarrierTrackingDto {
  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  maxEvents?: number;

  @ApiPropertyOptional({ example: 'IN_TRANSIT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  @ApiPropertyOptional({ example: 'LOCAL_SYNC' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  eventCode?: string;

  @ApiPropertyOptional({ example: { source: 'manual-sync' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
