import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveCycleCountDto {
  @ApiPropertyOptional({ example: 'Cycle count variance approved by supervisor.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: { approvedFrom: 'control-tower' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
