import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { LotQualityStatus, LotStatus } from '../traceability.types';

export class UpdateLotDto {
  @ApiPropertyOptional({ example: 'BATCH-01', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  batch?: string | null;

  @ApiPropertyOptional({ example: 'SUP-LOT-777', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  supplierLot?: string | null;

  @ApiPropertyOptional({ enum: LotQualityStatus })
  @IsOptional()
  @IsEnum(LotQualityStatus)
  qualityStatus?: LotQualityStatus;

  @ApiPropertyOptional({ enum: LotStatus })
  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @ApiPropertyOptional({ example: '2026-05-12', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  manufacturedAt?: string | null;

  @ApiPropertyOptional({ example: '2027-05-12', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsDateString()
  expiryDate?: string | null;

  @ApiPropertyOptional({ example: 'QA hold', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(240)
  quarantineReason?: string | null;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
