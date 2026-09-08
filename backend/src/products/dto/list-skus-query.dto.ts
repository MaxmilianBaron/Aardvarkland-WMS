import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, IsInt, Max, Min } from 'class-validator';

import { SkuStatus } from '../products.types';

export class ListSkusQueryDto {
  @ApiPropertyOptional({ enum: SkuStatus })
  @IsOptional()
  @IsEnum(SkuStatus)
  status?: SkuStatus;

  @ApiPropertyOptional({ description: 'Product id or code.', example: 'PROD-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  productReference?: string;

  @ApiPropertyOptional({ example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
