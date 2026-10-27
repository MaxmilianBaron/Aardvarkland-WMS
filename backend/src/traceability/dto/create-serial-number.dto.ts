import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { SerialNumberStatus } from '../traceability.types';

export class CreateSerialNumberDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @MaxLength(120)
  skuReference!: string;

  @ApiProperty({ example: 'SN-000001' })
  @IsString()
  @MaxLength(180)
  serialNumber!: string;

  @ApiPropertyOptional({ example: 'LOT-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lotReference?: string;

  @ApiPropertyOptional({ example: 'stock-quant-id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stockQuantId?: string;

  @ApiPropertyOptional({ example: 'location-id-or-code' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastSeenLocationReference?: string;

  @ApiPropertyOptional({ example: 'client-id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ownerClientId?: string;

  @ApiPropertyOptional({ enum: SerialNumberStatus })
  @IsOptional()
  @IsEnum(SerialNumberStatus)
  status?: SerialNumberStatus;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
