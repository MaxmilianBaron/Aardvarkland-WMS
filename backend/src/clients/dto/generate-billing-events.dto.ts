import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

import { BillingEventType } from '../clients.types';

export class BillingCounterDto {
  @ApiProperty({ enum: BillingEventType })
  @IsIn(Object.values(BillingEventType))
  eventType!: BillingEventType;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  quantity!: number;

  @ApiProperty({ description: 'Unit price in minor currency units.' })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitPriceMinor!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string;

  @ApiPropertyOptional({ example: 'WAVE' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceType?: string;

  @ApiPropertyOptional({ example: 'wave-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  resourceId?: string;

  @ApiPropertyOptional({ example: 'WAVE-0001' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  referenceSuffix?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class GenerateBillingEventsDto {
  @ApiProperty({ type: [BillingCounterDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillingCounterDto)
  counters!: BillingCounterDto[];

  @ApiPropertyOptional({ example: '2026-05-11T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  dryRun?: boolean;
}
