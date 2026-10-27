import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { INTEGRATION_STATUSES, IntegrationStatus } from '../integrations.types';

export class UpdateIntegrationEndpointDto {
  @ApiPropertyOptional({ example: 'ERP_MAIN' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ example: 'Main ERP' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'ERP' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  type?: string;

  @ApiPropertyOptional({ example: 'https://erp.example.com/api' })
  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(500)
  baseUrl?: string;

  @ApiPropertyOptional({ example: 'API_KEY' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  authType?: string;

  @ApiPropertyOptional({ enum: INTEGRATION_STATUSES, example: 'ACTIVE' })
  @IsOptional()
  @IsIn(INTEGRATION_STATUSES)
  status?: IntegrationStatus;

  @ApiPropertyOptional({ example: { timeoutMs: 5000, owner: 'ops' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  config?: Record<string, unknown> | null;
}
