import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

import { ProductUomKind } from '../product-master.types';

export class CreateProductUomDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsIn(Object.values(ProductUomKind))
  kind?: ProductUomKind;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  decimals?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
