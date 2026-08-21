import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { ProductStatus } from '../products.types';

export class CreateProductDto {
  @ApiProperty({ example: 'PROD-100001' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Black hoodie' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: 'Warm cotton hoodie for retail orders.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ProductStatus, example: ProductStatus.ACTIVE })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiPropertyOptional({ example: { category: 'apparel' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
