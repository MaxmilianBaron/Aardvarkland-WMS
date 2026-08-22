import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { ExternalSystemStatus } from '../integration-enterprise.types';

export class CreateExternalSystemDto {
  @IsString()
  code!: string;

  @IsString()
  name!: string;

  @IsString()
  systemType!: string;

  @IsOptional()
  @IsIn(Object.values(ExternalSystemStatus))
  status?: ExternalSystemStatus;

  @IsOptional()
  @IsString()
  ownerClientReference?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
