import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { SkuStatus } from '../products.types';
import { SkuDimensionsDto } from './sku-dimensions.dto';

export class UpdateSkuDto {
  @ApiPropertyOptional({ description: 'Product id or code.', example: 'PROD-100001' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  productReference?: string;

  @ApiPropertyOptional({ example: 'SKU-100001-BLK-L' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  code?: string;

  @ApiPropertyOptional({ example: 'Black hoodie L' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({ example: '8591234567890', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(160)
  barcode?: string | null;

  @ApiPropertyOptional({ example: 'EA' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  uom?: string;

  @ApiPropertyOptional({ example: 650, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  weightGrams?: number | null;


  @ApiPropertyOptional({ type: () => SkuDimensionsDto, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @ValidateNested()
  @Type(() => SkuDimensionsDto)
  dimensions?: SkuDimensionsDto | null;

  @ApiPropertyOptional({ enum: SkuStatus, example: SkuStatus.INACTIVE })
  @IsOptional()
  @IsEnum(SkuStatus)
  status?: SkuStatus;

  @ApiPropertyOptional({ example: { size: 'L', color: 'black' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
