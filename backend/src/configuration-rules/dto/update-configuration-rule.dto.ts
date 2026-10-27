import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { WmsConfigurationRuleStatus } from '../configuration-rules.types';

export class UpdateConfigurationRuleDto {
  @ApiPropertyOptional({ example: 'Zone first picking' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: WmsConfigurationRuleStatus, example: WmsConfigurationRuleStatus.ACTIVE })
  @IsOptional()
  @IsEnum(WmsConfigurationRuleStatus)
  status?: WmsConfigurationRuleStatus;

  @ApiPropertyOptional({ example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ example: { match: { client: 'CLIENT_A' } } })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { strategy: 'ZONE_FIRST' } })
  @IsOptional()
  @IsObject()
  actions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { changedBy: 'ops' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
