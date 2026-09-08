import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ScannerStatus } from '../scanners.types';

export class UpdateScannerDto {
  @ApiPropertyOptional({ example: 'SCAN-01' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ example: 'Receiving handheld 01' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: ScannerStatus, example: ScannerStatus.MAINTENANCE })
  @IsOptional()
  @IsEnum(ScannerStatus)
  status?: ScannerStatus;

  @ApiPropertyOptional({
    description: 'Scanner warehouse zone. Use null to clear the zone assignment.',
    example: 'PICKING-A',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  assignedZone?: string | null;

  @ApiPropertyOptional({ description: 'Last reported device battery level in percent.', example: 84, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number | null;

  @ApiPropertyOptional({ description: 'Last reported wireless signal strength in percent.', example: 72, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  @Max(100)
  signalStrength?: number | null;

  @ApiPropertyOptional({ description: 'User assigned to the device for the current shift.', example: 'user-uuid-or-worker-code', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  assignedWorkerId?: string | null;

  @ApiPropertyOptional({ example: { appVersion: '0.1.1' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
