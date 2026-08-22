import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CancelWarehouseOrderDto {
  @ApiProperty({ example: 'Customer cancelled' })
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  reason!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
