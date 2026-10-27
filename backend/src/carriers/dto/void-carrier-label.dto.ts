import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class VoidCarrierLabelDto {
  @ApiPropertyOptional({ example: 'WRONG_SERVICE_LEVEL' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reasonCode?: string;

  @ApiPropertyOptional({ example: { operator: 'pack-station-1' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
