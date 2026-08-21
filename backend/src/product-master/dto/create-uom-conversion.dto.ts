import { IsBoolean, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateUomConversionDto {
  @IsString()
  fromUom!: string;

  @IsString()
  toUom!: string;

  @IsNumber()
  @Min(0.000001)
  multiplier!: number;

  @IsOptional()
  @IsString()
  productReference?: string;

  @IsOptional()
  @IsString()
  skuReference?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
