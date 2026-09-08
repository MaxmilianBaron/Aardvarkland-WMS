import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

import { INTEGRATION_STATUSES, IntegrationStatus } from '../integrations.types';

export class CreateIntegrationEndpointDto {
  @ApiProperty({ example: 'ERP_MAIN' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Main ERP' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ example: 'ERP' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  type!: string;

  @ApiProperty({ example: 'https://erp.example.com/api' })
  @IsString()
  @IsUrl({ require_protocol: true, require_tld: false })
  @MaxLength(500)
  baseUrl!: string;

  @ApiPropertyOptional({ example: 'API_KEY' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  authType?: string;

  @ApiPropertyOptional({ enum: INTEGRATION_STATUSES, example: 'INACTIVE' })
  @IsOptional()
  @IsIn(INTEGRATION_STATUSES)
  status?: IntegrationStatus;

  @ApiPropertyOptional({ example: { timeoutMs: 5000, owner: 'ops' } })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
