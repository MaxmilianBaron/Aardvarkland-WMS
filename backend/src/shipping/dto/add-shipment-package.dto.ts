import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class PackageContentInputDto {
  @ApiPropertyOptional({ example: 'line-id' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  outboundOrderLineReference?: string;

  @ApiPropertyOptional({ example: 'ABC-123' })
  @IsString()
  @MaxLength(120)
  sku!: string;

  @ApiPropertyOptional({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiPropertyOptional({ example: { serials: [] } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class AddShipmentPackageDto {
  @ApiPropertyOptional({ example: 'SHP-100001-PKG-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  packageCode?: string;

  @ApiPropertyOptional({ example: 'CARTON' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  packageType?: string;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @ApiPropertyOptional({ example: 40 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lengthCm?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  widthCm?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  heightCm?: number;

  @ApiPropertyOptional({ type: [PackageContentInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PackageContentInputDto)
  contents?: PackageContentInputDto[];


  @ApiPropertyOptional({ description: '3PL owner client code/id. When set, created resources are owned by this client.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: { stationScaleWeight: 1200 } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-package-shipment-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
