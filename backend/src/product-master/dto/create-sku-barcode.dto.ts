import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { ProductCategoryStatus, SkuBarcodeType } from '../product-master.types';

export class CreateSkuBarcodeDto {
  @IsString()
  barcode!: string;

  @IsOptional()
  @IsString()
  warehouseReference?: string;

  @IsOptional()
  @IsIn(Object.values(SkuBarcodeType))
  barcodeType?: SkuBarcodeType;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsIn(Object.values(ProductCategoryStatus))
  status?: ProductCategoryStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
