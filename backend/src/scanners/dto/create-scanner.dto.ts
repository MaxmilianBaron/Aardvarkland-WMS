import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { ScannerStatus } from '../scanners.types';

export class CreateScannerDto {
  @ApiProperty({ example: 'SCAN-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Receiving handheld 01' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ enum: ScannerStatus, example: ScannerStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ScannerStatus)
  status?: ScannerStatus;

  @ApiPropertyOptional({ example: 'RECEIVING' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  assignedZone?: string;

  @ApiPropertyOptional({ description: 'Last reported device battery level in percent.', example: 84 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({ description: 'Last reported wireless signal strength in percent.', example: 72 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  signalStrength?: number;

  @ApiPropertyOptional({ description: 'User assigned to the device for the current shift.', example: 'user-uuid-or-worker-code' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  assignedWorkerId?: string;

  @ApiPropertyOptional({ example: { platform: 'android', appVersion: '0.1.0' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
