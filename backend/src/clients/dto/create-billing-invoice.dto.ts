import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { BillingEventStatus } from '../clients.types';

export class CreateBillingInvoiceDto {
  @ApiProperty({ example: '2026-05-01T00:00:00.000Z' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ example: 'INV-CLIENT_A-202605' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  invoiceNumber?: string;

  @ApiPropertyOptional({ enum: BillingEventStatus, isArray: true, default: [BillingEventStatus.BILLABLE] })
  @IsOptional()
  @IsArray()
  @IsIn(Object.values(BillingEventStatus), { each: true })
  eventStatuses?: BillingEventStatus[];


  @ApiPropertyOptional({ example: 2100, description: 'VAT rate in basis points. 2100 = 21%.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  vatRateBps?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  finalize?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
