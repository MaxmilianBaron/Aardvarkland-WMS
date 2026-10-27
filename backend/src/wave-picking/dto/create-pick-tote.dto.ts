import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePickToteDto {
  @ApiPropertyOptional({ example: 'TOTE-01' })
  @IsString()
  @MaxLength(120)
  code!: string;

  @ApiPropertyOptional({ example: 'CART-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  pickCartReference?: string;

  @ApiPropertyOptional({ example: 'WAVE-20260511-AM' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  waveReference?: string;

  @ApiPropertyOptional({ example: 'SO-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  outboundOrderReference?: string;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  capacityUnits?: number;

  @ApiPropertyOptional({ description: '3PL owner client code/id. Explicit value must match inherited wave/order/cart owner.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;


  @ApiPropertyOptional({ example: { color: 'blue' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
