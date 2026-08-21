import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class ValidateWorkflowTransitionDto {
  @ApiProperty({ example: 'OUTBOUND_ORDER' })
  @IsString()
  @MaxLength(80)
  entity!: string;

  @ApiProperty({ example: 'ALLOCATED' })
  @IsString()
  @MaxLength(80)
  currentStatus!: string;

  @ApiPropertyOptional({ example: 'RELEASE_PICKING' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ example: 'PICKING' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetStatus?: string;

  @ApiPropertyOptional({ example: 'SHORT_PICK_RECOVERY' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reasonCode?: string;

  @ApiPropertyOptional({ example: ['fulfillment.manage'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actorPermissions?: string[];
}
