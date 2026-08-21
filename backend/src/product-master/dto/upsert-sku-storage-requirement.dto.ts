import { IsBoolean, IsNumber, IsObject, IsOptional } from 'class-validator';

export class UpsertSkuStorageRequirementDto {
  @IsOptional()
  @IsNumber()
  temperatureMinCelsius?: number;

  @IsOptional()
  @IsNumber()
  temperatureMaxCelsius?: number;

  @IsOptional()
  @IsBoolean()
  fragile?: boolean;

  @IsOptional()
  @IsBoolean()
  hazardous?: boolean;

  @IsOptional()
  @IsBoolean()
  oversized?: boolean;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @IsOptional()
  @IsObject()
  requirements?: Record<string, unknown>;
}
