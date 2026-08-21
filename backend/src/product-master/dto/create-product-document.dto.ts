import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { ProductDocumentType } from '../product-master.types';

export class CreateProductDocumentDto {
  @IsIn(Object.values(ProductDocumentType))
  documentType!: ProductDocumentType;

  @IsString()
  title!: string;

  @IsString()
  uri!: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  checksumSha256?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
