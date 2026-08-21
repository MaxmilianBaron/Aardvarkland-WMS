import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReleaseReservationDto {
  @ApiPropertyOptional({ example: 'Customer cancelled order line' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  reason?: string;

  @ApiPropertyOptional({ type: Object, example: { source: 'operator' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
