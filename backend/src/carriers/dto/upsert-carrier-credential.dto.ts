import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { CarrierCredentialStatus } from '../carriers.types';

export class UpsertCarrierCredentialDto {
  @ApiPropertyOptional({ example: 'TEST' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  environment?: string;

  @ApiPropertyOptional({ enum: CarrierCredentialStatus })
  @IsOptional()
  @IsEnum(CarrierCredentialStatus)
  status?: CarrierCredentialStatus;

  @ApiPropertyOptional({ example: 'ACC-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountNumber?: string;

  @ApiPropertyOptional({ example: { apiKey: 'secret-api-key', password: 'secret-password' }, description: 'Encrypted at rest with CARRIER_CREDENTIAL_ENCRYPTION_KEY.' })
  @IsOptional()
  @IsObject()
  secrets?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'v2' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  keyVersion?: string;

  @ApiPropertyOptional({ example: { contract: '2026-standard-rates' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
