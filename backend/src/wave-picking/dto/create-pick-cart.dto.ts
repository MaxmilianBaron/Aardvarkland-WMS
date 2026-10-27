import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePickCartDto {
  @ApiPropertyOptional({ example: 'CART-01' })
  @IsString()
  @MaxLength(120)
  code!: string;

  @ApiPropertyOptional({ example: { scanner: 'RF-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
