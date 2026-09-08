import { IsIn, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

import { ReturnDisposition } from '../returns.types';

export class InspectReturnLineDto {
  @IsIn(Object.values(ReturnDisposition))
  disposition!: ReturnDisposition;

  @IsInt()
  @Min(1)
  inspectedQuantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  acceptedQuantity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  rejectedQuantity?: number;

  @IsOptional()
  @IsString()
  locationReference?: string;

  @IsOptional()
  @IsString()
  lotReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
