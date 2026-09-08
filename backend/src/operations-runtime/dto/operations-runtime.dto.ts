import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { RuntimeRuleType } from '../operations-runtime.types';

export class StartRuntimeRfSessionDto {
  @ApiProperty({ example: 'RF-HANDHELD-01' })
  @IsString()
  @MaxLength(120)
  deviceCode!: string;

  @ApiProperty({ example: 'PICKER-042' })
  @IsString()
  @MaxLength(120)
  workerCode!: string;

  @ApiPropertyOptional({ example: 'WAVE_PICK' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  flow?: string;

  @ApiPropertyOptional({ example: 'ops-rf-session-warehouse-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class RuntimeRfScanDto {
  @ApiPropertyOptional({ example: 'session-id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @ApiProperty({ example: 'RF-HANDHELD-01' })
  @IsString()
  @MaxLength(120)
  deviceCode!: string;

  @ApiPropertyOptional({ example: 'TASK-PICK-1001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  taskReference?: string;

  @ApiProperty({ example: 'SCAN_LOCATION' })
  @IsString()
  @MaxLength(80)
  stepKey!: string;

  @ApiProperty({ example: 'A-01-02' })
  @IsString()
  @MaxLength(240)
  scannedValue!: string;

  @ApiPropertyOptional({ example: 'A-01-02' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  expectedValue?: string;

  @ApiPropertyOptional({ example: 'offline-rf-001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  offlineId?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: { battery: 87 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'ops-rf-scan-device-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class RuntimeOfflineActionDto {
  @ApiPropertyOptional({ example: 'session-id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @ApiPropertyOptional({ example: 'RF-HANDHELD-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceCode?: string;

  @ApiPropertyOptional({ example: 'TASK-PICK-1001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  taskReference?: string;

  @ApiProperty({ example: 'SCAN_LOCATION' })
  @IsString()
  @MaxLength(80)
  stepKey!: string;

  @ApiProperty({ example: 'A-01-02' })
  @IsString()
  @MaxLength(240)
  scannedValue!: string;

  @ApiPropertyOptional({ example: 'A-01-02' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  expectedValue?: string;

  @ApiPropertyOptional({ example: 'offline-rf-001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  offlineId?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: { battery: 87 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'ops-rf-action-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class RuntimeRfOfflineReplayDto {
  @ApiProperty({ example: 'RF-HANDHELD-01' })
  @IsString()
  @MaxLength(120)
  deviceCode!: string;

  @ApiProperty({ type: [RuntimeOfflineActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuntimeOfflineActionDto)
  actions!: RuntimeOfflineActionDto[];

  @ApiPropertyOptional({ example: 'ops-rf-replay-warehouse-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class RuntimeRfExceptionDto {
  @ApiPropertyOptional({ example: 'session-id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @ApiProperty({ example: 'RF-HANDHELD-01' })
  @IsString()
  @MaxLength(120)
  deviceCode!: string;

  @ApiPropertyOptional({ example: 'TASK-PICK-1001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  taskReference?: string;

  @ApiProperty({ example: 'SHORT_PICK' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiPropertyOptional({ example: 'Lokace je prázdná' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @ApiPropertyOptional({ example: 'HIGH' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  severity?: string;

  @ApiPropertyOptional({ example: '1234' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  supervisorPin?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  releaseReservation?: boolean;

  @ApiPropertyOptional({ example: { scanned: 'SKU-X' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'ops-rf-exception-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}

export class RuntimeReconciliationRunDto {
  @ApiPropertyOptional({ example: 'SHOP' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  connectorCode?: string;

  @ApiPropertyOptional({ example: 'order.import' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  flow?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}



export class RuntimeIntegrationEventIngestDto {
  @ApiProperty({ example: 'SHOP' })
  @IsString()
  @MaxLength(80)
  connectorCode!: string;

  @ApiProperty({ example: 'order.import' })
  @IsString()
  @MaxLength(120)
  flow!: string;

  @ApiProperty({ example: 'SHOP-10517' })
  @IsString()
  @MaxLength(180)
  externalId!: string;

  @ApiPropertyOptional({ example: 'WAITING' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  state?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional({ example: { orderId: 'SO-10517' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class RuntimeIntegrationEventApplyDto {
  @ApiPropertyOptional({ example: { wmsOrderId: 'SO-10517' } })
  @IsOptional()
  @IsObject()
  mapping?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Applied after SKU alias mapping was fixed.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RuntimePrintLabelTestDto {
  @ApiPropertyOptional({ example: 'PRINT' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  connectorCode?: string;

  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stationCode?: string;

  @ApiPropertyOptional({ example: 'SHIP-10517' })
  @IsOptional()
  @IsString()
  @MaxLength(180)
  reference?: string;

  @ApiPropertyOptional({ example: 'SAMPLE_ZPL' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  templateCode?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class RuntimeRuleUpsertDto {
  @ApiProperty({ example: 'PICK_ZONE_BATCH_A' })
  @IsString()
  @MaxLength(120)
  code!: string;

  @ApiProperty({ example: 'Batch pick fast movers in zone A' })
  @IsString()
  @MaxLength(180)
  name!: string;

  @ApiProperty({ enum: RuntimeRuleType, example: RuntimeRuleType.PICKING_STRATEGY })
  @IsEnum(RuntimeRuleType)
  type!: RuntimeRuleType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ example: { client: 'CLIENT_A' } })
  @IsOptional()
  @IsObject()
  scope?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { orderPriority: ['HIGH', 'RUSH'] } })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { strategy: 'ZONE_BATCH', maxOrders: 24 } })
  @IsOptional()
  @IsObject()
  actions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Used by wave release.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RuntimeRuleEvaluationDto {
  @ApiPropertyOptional({ enum: RuntimeRuleType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(RuntimeRuleType, { each: true })
  ruleTypes?: RuntimeRuleType[];

  @ApiProperty({ example: { orderPriority: 'RUSH', destinationCountry: 'CZ', skuVelocity: 'A' } })
  @IsObject()
  context!: Record<string, unknown>;
}
