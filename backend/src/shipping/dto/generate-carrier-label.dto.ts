import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class GenerateCarrierLabelDto {
  @ApiPropertyOptional({ example: 'SHP-100001-PKG-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  packageReference?: string;

  @ApiPropertyOptional({ example: 'ZPL' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  labelFormat?: string;

  @ApiPropertyOptional({ example: 'CARRIER_A-123456' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string;


  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { dryRun: true } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-label-shipment-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
