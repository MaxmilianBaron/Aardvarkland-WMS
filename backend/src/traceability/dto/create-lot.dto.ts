import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { LotQualityStatus, LotStatus } from '../traceability.types';

export class CreateLotDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @MaxLength(120)
  skuReference!: string;

  @ApiProperty({ example: 'LOT-2026-001' })
  @IsString()
  @MaxLength(120)
  lotCode!: string;

  @ApiPropertyOptional({ example: 'BATCH-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  batch?: string;

  @ApiPropertyOptional({ example: 'SUP-LOT-777' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierLot?: string;

  @ApiPropertyOptional({ example: 'client-id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ownerClientId?: string;

  @ApiPropertyOptional({ enum: LotQualityStatus })
  @IsOptional()
  @IsEnum(LotQualityStatus)
  qualityStatus?: LotQualityStatus;

  @ApiPropertyOptional({ enum: LotStatus })
  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @ApiPropertyOptional({ example: '2026-05-12' })
  @IsOptional()
  @IsDateString()
  manufacturedAt?: string;

  @ApiPropertyOptional({ example: '2027-05-12' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
