import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class RfOfflineScanDto {
  @ApiProperty({ example: 'rf-01-20260518-0001' })
  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;

  @ApiPropertyOptional({ example: 'session-uuid' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionReference?: string;

  @ApiPropertyOptional({ example: 'task-uuid-or-ref' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taskReference?: string;

  @ApiPropertyOptional({ example: 'SCAN_SOURCE_LOCATION' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stepKey?: string;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  scannedValue?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: '2026-05-18T10:15:00.000Z' })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @ApiPropertyOptional({ example: { deviceBattery: 82 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SyncRfOfflineQueueDto {
  @ApiPropertyOptional({ example: 'RF-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  scannerDeviceReference?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiProperty({ type: [RfOfflineScanDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => RfOfflineScanDto)
  scans!: RfOfflineScanDto[];

  @ApiPropertyOptional({ example: 'storage-rf-sync-warehouse-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
