import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { WmsClientStatus } from '../clients.types';

export class CreateClientDto {
  @ApiProperty({ example: 'CLIENT_A' })
  @IsString()
  @MinLength(2)
  @MaxLength(48)
  code!: string;

  @ApiProperty({ example: 'CLIENT_A Retail s.r.o.' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ enum: WmsClientStatus, default: WmsClientStatus.ACTIVE })
  @IsOptional()
  @IsIn(Object.values(WmsClientStatus))
  status?: WmsClientStatus;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  billingCurrency?: string;

  @ApiPropertyOptional({ example: 'ERP-CUST-1001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  externalReference?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
