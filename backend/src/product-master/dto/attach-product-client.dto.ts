import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { ProductCategoryStatus } from '../product-master.types';

export class AttachProductClientDto {
  @IsString()
  clientReference!: string;

  @IsOptional()
  @IsString()
  externalArticleNumber?: string;

  @IsOptional()
  @IsIn(Object.values(ProductCategoryStatus))
  status?: ProductCategoryStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
