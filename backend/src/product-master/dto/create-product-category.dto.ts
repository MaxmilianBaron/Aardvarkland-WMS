import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { ProductCategoryStatus } from '../product-master.types';

export class CreateProductCategoryDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  parentReference?: string;

  @IsOptional()
  @IsIn(Object.values(ProductCategoryStatus))
  status?: ProductCategoryStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
