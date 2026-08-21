import { IsBoolean, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateQualitySamplingRuleDto {
  @IsOptional()
  @IsString()
  clientReference?: string;

  @IsOptional()
  @IsString()
  skuReference?: string;

  @IsOptional()
  @IsString()
  lotStatus?: string;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsNumber()
  @Min(0.01)
  @Max(100)
  samplePercent!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minSampleQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSampleQuantity?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
