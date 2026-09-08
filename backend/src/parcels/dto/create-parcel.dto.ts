import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ParcelStatus } from '../../generated/prisma/client';

export class CreateParcelDto {
  @ApiProperty({ example: 'PKG-100001' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  trackingNumber!: string;

  @ApiPropertyOptional({ enum: ParcelStatus, example: ParcelStatus.RECEIVED })
  @IsOptional()
  @IsEnum(ParcelStatus)
  status?: ParcelStatus;

  @ApiPropertyOptional({ example: 'RCV-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  currentLocationReference?: string;

  @ApiPropertyOptional({ example: 'ERP-ORDER-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;

  @ApiPropertyOptional({ example: 'CUST-REF-42' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerReference?: string;

  @ApiPropertyOptional({ example: 'Jane Receiver' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  recipientName?: string;

  @ApiPropertyOptional({ example: 'CARRIER_A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @ApiPropertyOptional({ example: 'EXPRESS' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceLevel?: string;

  @ApiPropertyOptional({ example: 1250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @ApiPropertyOptional({ example: { source: 'manual' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
