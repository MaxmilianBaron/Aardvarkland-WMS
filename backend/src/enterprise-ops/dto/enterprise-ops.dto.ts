import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterAutomationDeviceDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  deviceType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  capabilities?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AutomationHeartbeatDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  telemetry?: Record<string, unknown>;
}

export class EnqueueAutomationCommandDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty()
  @IsString()
  commandType!: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  notBeforeAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class CompleteAutomationCommandDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class CreateDockDoorDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doorType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ScheduleDockAppointmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiProperty()
  @IsString()
  appointmentNumber!: string;

  @ApiProperty({ enum: ['INBOUND', 'OUTBOUND', 'TRANSFER'] })
  @IsIn(['INBOUND', 'OUTBOUND', 'TRANSFER'])
  direction!: 'INBOUND' | 'OUTBOUND' | 'TRANSFER';

  @ApiProperty()
  @IsDateString()
  plannedStartAt!: string;

  @ApiProperty()
  @IsDateString()
  plannedEndAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dockDoorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class YardTrailerCheckInDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiProperty()
  @IsString()
  trailerNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  carrier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dockDoorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AssignDockDoorDto {
  @ApiProperty()
  @IsString()
  dockDoorId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trailerId?: string;
}

export class CreateCrossDockPlanLineDto {
  @ApiProperty()
  @IsString()
  skuId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lotId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  toLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateCrossDockPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  inboundShipmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  outboundOrderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reasonCode?: string;

  @ApiProperty({ type: [CreateCrossDockPlanLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateCrossDockPlanLineDto)
  lines!: CreateCrossDockPlanLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateVasServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  serviceType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  defaultDurationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateKitBomLineDto {
  @ApiProperty()
  @IsString()
  componentSkuId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantityPerKit!: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  scrapPercent?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateKitBomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiProperty()
  @IsString()
  kitSkuId!: string;

  @ApiProperty()
  @IsString()
  code!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiProperty({ type: [CreateKitBomLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateKitBomLineDto)
  lines!: CreateKitBomLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateVasTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warehouseTaskId?: string;

  @ApiProperty()
  @IsString()
  targetResourceType!: string;

  @ApiProperty()
  @IsString()
  targetResourceId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ConfirmVasTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;
}

export class RecordDomainEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiProperty()
  @IsString()
  eventType!: string;

  @ApiProperty()
  @IsString()
  resourceType!: string;

  @ApiProperty()
  @IsString()
  resourceId!: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  schemaVersion?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateWebhookSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerClientId?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsUrl({ require_tld: false })
  targetUrl!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  eventTypes!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secretRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
