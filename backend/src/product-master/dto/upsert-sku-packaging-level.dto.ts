import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpsertSkuPackagingLevelDto {
  @IsString()
  levelCode!: string;

  @IsString()
  uom!: string;

  @IsInt()
  @Min(1)
  unitsPerLevel!: number;

  @IsOptional()
  @IsString()
  parentLevelCode?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lengthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  heightMm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  volumeCm3?: number;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
