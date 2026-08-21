import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { WarehouseTaskType } from '../warehouse-tasks.types';

export class ClaimNextWarehouseTaskDto {
  @ApiPropertyOptional({ enum: Object.values(WarehouseTaskType), example: 'PICK' })
  @IsOptional()
  @IsIn(Object.values(WarehouseTaskType))
  type?: WarehouseTaskType;

  @ApiPropertyOptional({ example: 'A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  zone?: string;

  @ApiPropertyOptional({ example: 'operator@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  assignedUserReference?: string;

  @ApiPropertyOptional({ example: { device: 'scanner-01' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-claim-next-1716200000000' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
