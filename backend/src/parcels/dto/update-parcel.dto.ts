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
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { ParcelStatus } from '../../generated/prisma/client';

export class UpdateParcelDto {
  @ApiPropertyOptional({ example: 'PKG-100001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  trackingNumber?: string;

  @ApiPropertyOptional({ enum: ParcelStatus, example: ParcelStatus.STORED })
  @IsOptional()
  @IsEnum(ParcelStatus)
  status?: ParcelStatus;

  @ApiPropertyOptional({
    description:
      'Location id or code within the same warehouse. Use null to clear current location.',
    example: 'A-01-01',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  currentLocationReference?: string | null;

  @ApiPropertyOptional({ example: 'ERP-ORDER-100001' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  externalReference?: string | null;

  @ApiPropertyOptional({ example: 'CUST-REF-42' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  customerReference?: string | null;

  @ApiPropertyOptional({ example: 'Jane Receiver' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(160)
  recipientName?: string | null;

  @ApiPropertyOptional({ example: 'CARRIER_A' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  carrier?: string | null;

  @ApiPropertyOptional({ example: 'EXPRESS' })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  serviceLevel?: string | null;

  @ApiPropertyOptional({ example: 1250 })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number | null;

  @ApiPropertyOptional({ example: { source: 'manual' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
