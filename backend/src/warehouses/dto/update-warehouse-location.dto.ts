import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { WarehouseLocationType } from '../../generated/prisma/client';
import { WarehouseLocationBinStatus } from '../warehouses.types';

export class UpdateWarehouseLocationDto {
  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ example: 'Aisle A, Rack 01, Shelf 01' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ enum: WarehouseLocationType, example: WarehouseLocationType.STORAGE })
  @IsOptional()
  @IsEnum(WarehouseLocationType)
  type?: WarehouseLocationType;

  @ApiPropertyOptional({ example: 'STORAGE-A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  zone?: string;

  @ApiPropertyOptional({ example: 'LOC-A-01-01', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  barcode?: string | null;

  @ApiPropertyOptional({ example: 'A', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(40)
  aisle?: string | null;

  @ApiPropertyOptional({ example: '01', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(40)
  bay?: string | null;

  @ApiPropertyOptional({ example: '02', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(40)
  level?: string | null;

  @ApiPropertyOptional({ example: 'BIN-01', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  bin?: string | null;

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

  @ApiPropertyOptional({ example: 'PALLET_RACK', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  binType?: string | null;

  @ApiPropertyOptional({ example: 1_000_000, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  capacityWeightGrams?: number | null;

  @ApiPropertyOptional({ example: 120_000, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  capacityVolumeCm3?: number | null;

  @ApiPropertyOptional({ example: 100, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  capacityUnits?: number | null;

  @ApiPropertyOptional({ example: 8, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  capacityHandlingUnits?: number | null;

  @ApiPropertyOptional({ example: 2, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsInt()
  @Min(0)
  capacityPallets?: number | null;

  @ApiPropertyOptional({ description: 'Parent location id or code within the same warehouse. Use null to clear parent.', example: 'A-01', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  parentReference?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
