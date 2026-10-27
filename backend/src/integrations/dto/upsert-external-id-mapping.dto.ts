import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertExternalIdMappingDto {
  @IsString()
  externalSystemReference!: string;

  @IsOptional()
  @IsString()
  warehouseReference?: string;

  @IsOptional()
  @IsString()
  ownerClientReference?: string;

  @IsString()
  resourceType!: string;

  @IsString()
  resourceId!: string;

  @IsString()
  externalId!: string;

  @IsOptional()
  @IsString()
  externalType?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
