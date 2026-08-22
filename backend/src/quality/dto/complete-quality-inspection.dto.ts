import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { QualityInspectionResult } from '../quality.types';

export class CompleteQualityInspectionDto {
  @IsIn(Object.values(QualityInspectionResult))
  result!: QualityInspectionResult;

  @IsOptional()
  @IsObject()
  checklist?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
