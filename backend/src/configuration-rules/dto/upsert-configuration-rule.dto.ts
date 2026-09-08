import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

import { WmsConfigurationRuleStatus, WmsConfigurationRuleType } from '../configuration-rules.types';

export class UpsertConfigurationRuleDto {
  @ApiProperty({ enum: WmsConfigurationRuleType, example: WmsConfigurationRuleType.PICKING_STRATEGY })
  @IsEnum(WmsConfigurationRuleType)
  ruleType!: WmsConfigurationRuleType;

  @ApiProperty({ example: 'PICK_ZONE_FIRST' })
  @IsString()
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Pick by zone, then shortest path' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ enum: WmsConfigurationRuleStatus, example: WmsConfigurationRuleStatus.ACTIVE })
  @IsOptional()
  @IsEnum(WmsConfigurationRuleStatus)
  status?: WmsConfigurationRuleStatus;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @ApiPropertyOptional({ example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { match: { orderType: 'B2C', zone: ['A', 'B'] } } })
  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { strategy: 'ZONE_FIRST', sortBy: ['priority', 'pickSequence'] } })
  @IsOptional()
  @IsObject()
  actions?: Record<string, unknown>;

  @ApiPropertyOptional({ example: { owner: 'ops', notes: 'Default outbound strategy' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
