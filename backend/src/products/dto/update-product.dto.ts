import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { ProductStatus } from '../products.types';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'PROD-100001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code?: string;

  @ApiPropertyOptional({ example: 'Black hoodie' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: 'Warm cotton hoodie for retail orders.', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({ enum: ProductStatus, example: ProductStatus.DISCONTINUED })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: { category: 'apparel' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
