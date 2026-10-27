import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const frontendEventTypes = [
  'app_loaded',
  'js_error',
  'error_boundary',
  'api_failure',
  'blank_screen',
  'pwa_update',
  'service_worker',
  'offline_state',
] as const;

export const frontendEventSeverities = ['info', 'warning', 'error', 'critical'] as const;

export class RecordFrontendEventDto {
  @ApiProperty({ enum: frontendEventTypes, example: 'api_failure' })
  @IsIn(frontendEventTypes)
  type!: string;

  @ApiProperty({ enum: frontendEventSeverities, example: 'error' })
  @IsIn(frontendEventSeverities)
  severity!: string;

  @ApiPropertyOptional({ example: '/rf' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  route?: string;

  @ApiPropertyOptional({ example: 'cs' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  language?: string;

  @ApiPropertyOptional({ example: 'WAREHOUSE_WORKER' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  roleId?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  appVersion?: string;

  @ApiPropertyOptional({ example: '2026-05-25T22:00:00.000Z' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  occurredAt?: string;

  @ApiPropertyOptional({ example: 'Fetch failed' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  @ApiPropertyOptional({ example: '/api/warehouses/MAIN/rf/queue' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  source?: string;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(599)
  statusCode?: number;

  @ApiPropertyOptional({ example: 12000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120000)
  durationMs?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  browserOnline?: boolean;

  @ApiPropertyOptional({ example: { component: 'RfPage' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
