import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class ReleaseCycleCountPlanDto {
  @ApiPropertyOptional({ example: { hideExpectedFromRf: true } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
