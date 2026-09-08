import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListSlottingRecommendationsQueryDto {
  @ApiPropertyOptional({ example: 'OPEN' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ example: 'HIGH_VELOCITY_TO_PICK_FACE' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reason?: string;

  @ApiPropertyOptional({ example: 'SKU-ABC-123' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
