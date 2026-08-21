import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

import { WarehouseLocationType } from '../../generated/prisma/client';
import { WarehouseLocationBinStatus } from '../warehouses.types';

export class CreateWarehouseLocationDto {
  @ApiProperty({ example: 'A-01-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Aisle A, Rack 01, Shelf 01' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ enum: WarehouseLocationType, example: WarehouseLocationType.STORAGE })
  @IsEnum(WarehouseLocationType)
  type!: WarehouseLocationType;

  @ApiPropertyOptional({ example: 'STORAGE-A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  zone?: string;

  @ApiPropertyOptional({ example: 'LOC-A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  barcode?: string;

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  aisle?: string;

  @ApiPropertyOptional({ example: '01' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  bay?: string;

  @ApiPropertyOptional({ example: '02' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  level?: string;

  @ApiPropertyOptional({ example: 'BIN-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  bin?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  pickSequence?: number;

  @ApiPropertyOptional({ enum: WarehouseLocationBinStatus, example: WarehouseLocationBinStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(WarehouseLocationBinStatus)
  binStatus?: WarehouseLocationBinStatus;

  @ApiPropertyOptional({ example: 'PALLET_RACK' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  binType?: string;

  @ApiPropertyOptional({ example: 1_000_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacityWeightGrams?: number;

  @ApiPropertyOptional({ example: 120_000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacityVolumeCm3?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacityUnits?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacityHandlingUnits?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacityPallets?: number;

  @ApiPropertyOptional({ description: 'Parent location id or code within the same warehouse.', example: 'A-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  parentReference?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
