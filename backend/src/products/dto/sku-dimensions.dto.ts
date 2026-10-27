import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SkuDimensionsDto {
  @ApiPropertyOptional({ description: 'Item length in millimetres.', example: 300 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lengthMm?: number;

  @ApiPropertyOptional({ description: 'Item width in millimetres.', example: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  widthMm?: number;

  @ApiPropertyOptional({ description: 'Item height in millimetres.', example: 120 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  heightMm?: number;

  @ApiPropertyOptional({ description: 'Item volume in cubic centimetres. Auto-derived from length/width/height when omitted.', example: 7200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  volumeCm3?: number;
}
