import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateSlottingRuleDto {
  @ApiPropertyOptional({ example: 'FAST-MOVERS-ZONE-A' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  code?: string;

  @ApiPropertyOptional({ example: 'ZONE-A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  zone?: string;

  @ApiPropertyOptional({ example: 60, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minVelocityScore?: number;

  @ApiPropertyOptional({ example: 100, minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  maxVelocityScore?: number;

  @ApiPropertyOptional({ example: 'PICK' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  targetLocationType?: string;

  @ApiPropertyOptional({ example: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPickSequence?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPickFaceQuantity?: number;

  @ApiPropertyOptional({ example: { note: 'Premium fast-pick zone.' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
