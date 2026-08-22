import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class StageShipmentDto {
  @ApiPropertyOptional({ example: 'SHIP-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  stagedLocationReference?: string;

  @ApiPropertyOptional({ example: { lane: 'CARRIER_A' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-stage-shipment-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
