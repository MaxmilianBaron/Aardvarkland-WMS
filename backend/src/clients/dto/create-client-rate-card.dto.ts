import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';

import { BillingEventType } from '../clients.types';

export class ClientRateDto {
  @ApiProperty({ enum: BillingEventType, example: BillingEventType.STORAGE_DAY })
  @IsIn(Object.values(BillingEventType))
  eventType!: BillingEventType;

  @ApiPropertyOptional({ example: 'UNIT_DAY', default: 'EA' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  unitPriceMinor!: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  minChargeMinor?: number;

  @ApiPropertyOptional({ example: 2100, description: 'VAT rate in basis points. 2100 = 21%.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  vatRateBps?: number;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateClientRateCardDto {
  @ApiProperty({ example: 'CLIENT_A Standard 2026' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'CZK' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  validFrom!: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  validTo?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [ClientRateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClientRateDto)
  rates!: ClientRateDto[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
