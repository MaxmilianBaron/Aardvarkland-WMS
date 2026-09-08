import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertSkuVelocityDto {
  @ApiProperty({ example: 'SKU-ABC-123' })
  @IsString()
  @MaxLength(120)
  sku!: string;

  @ApiPropertyOptional({ example: 42 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  picksLast30Days?: number;

  @ApiPropertyOptional({ example: 420 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitsPickedLast30Days?: number;

  @ApiPropertyOptional({ example: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  replenishmentsLast30Days?: number;

  @ApiPropertyOptional({ example: 86, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  velocityScore?: number;

  @ApiPropertyOptional({ example: { source: 'analytics-import' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
