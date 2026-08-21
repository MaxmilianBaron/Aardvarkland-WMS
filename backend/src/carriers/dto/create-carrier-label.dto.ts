import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateCarrierLabelDto {
  @ApiPropertyOptional({ example: 'SHP-202605110001' })
  @IsString()
  @MaxLength(120)
  shipmentReference!: string;

  @ApiPropertyOptional({ example: 'SHP-202605110001-PKG-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  packageReference?: string;

  @ApiPropertyOptional({ example: 'STANDARD' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  serviceLevel?: string;

  @ApiPropertyOptional({ example: 'label-order-123-package-1' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'TEST', description: 'Carrier credential environment. Defaults to TEST/sandbox unless CARRIER_ADAPTER_MODE selects production.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  environment?: string;

  @ApiPropertyOptional({ example: 1250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weightGrams?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  lengthCm?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  widthCm?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  heightCm?: number;


  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { station: 'PACK-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
