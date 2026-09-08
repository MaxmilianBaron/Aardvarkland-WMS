import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { BillingEventStatus, BillingEventType } from '../clients.types';

export class CreateBillingEventDto {
  @ApiProperty({ enum: BillingEventType, example: BillingEventType.PICK })
  @IsIn(Object.values(BillingEventType))
  eventType!: BillingEventType;

  @ApiPropertyOptional({ enum: BillingEventStatus, default: BillingEventStatus.PENDING })
  @IsOptional()
  @IsIn(Object.values(BillingEventStatus))
  status?: BillingEventStatus;

  @ApiPropertyOptional({ example: 'BILL-CLIENT_A-20260511-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ example: 'OUTBOUND_ORDER' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;

  @ApiPropertyOptional({ example: 'order-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  resourceId?: string;

  @ApiPropertyOptional({ example: 'Pick fee for order 10001' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity?: number;

  @ApiPropertyOptional({ description: 'Unit price in minor currency units, e.g. cents.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitPriceMinor?: number;

  @ApiPropertyOptional({ description: 'Explicit amount in minor currency units. Overrides quantity × unitPriceMinor.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  amountMinor?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ example: '2026-05-11T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
