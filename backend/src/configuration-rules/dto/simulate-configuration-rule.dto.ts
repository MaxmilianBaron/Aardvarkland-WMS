import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { WmsConfigurationRuleType } from '../configuration-rules.types';

export class SimulateConfigurationRuleDto {
  @ApiProperty({ enum: WmsConfigurationRuleType, example: WmsConfigurationRuleType.CARRIER_ROUTING })
  @IsEnum(WmsConfigurationRuleType)
  ruleType!: WmsConfigurationRuleType;

  @ApiPropertyOptional({ example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiProperty({ example: { carrier: 'CARRIER_A', country: 'CZ', weightGrams: 1400, serviceLevel: 'NEXT_DAY' } })
  @IsObject()
  context!: Record<string, unknown>;
}
