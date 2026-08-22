import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { SkuStatus } from '../products.types';
import { SkuDimensionsDto } from './sku-dimensions.dto';

export class CreateSkuDto {
  @ApiProperty({ description: 'Product id or code.', example: 'PROD-100001' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  productReference!: string;

  @ApiProperty({ example: 'SKU-100001-BLK-L' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  code!: string;

  @ApiProperty({ example: 'Black hoodie L' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ example: '8591234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  barcode?: string;

  @ApiPropertyOptional({ example: 'EA' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  uom?: string;

  @ApiPropertyOptional({ example: 650 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number;


  @ApiPropertyOptional({ type: () => SkuDimensionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SkuDimensionsDto)
  dimensions?: SkuDimensionsDto;

  @ApiPropertyOptional({ enum: SkuStatus, example: SkuStatus.ACTIVE })
  @IsOptional()
  @IsEnum(SkuStatus)
  status?: SkuStatus;

  @ApiPropertyOptional({ example: { size: 'L', color: 'black' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
