import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateQualityInspectionDto {
  @IsString()
  inspectionNumber!: string;

  @IsOptional()
  @IsString()
  ownerClientReference?: string;

  @IsOptional()
  @IsString()
  skuReference?: string;

  @IsOptional()
  @IsString()
  lotReference?: string;

  @IsOptional()
  @IsString()
  stockQuantId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  sampleQuantity?: number;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
