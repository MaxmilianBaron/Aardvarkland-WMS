import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

import { RfWorkflowType } from '../rf-workflows.types';

export class StartRfSessionDto {
  @ApiPropertyOptional({ example: 'SCAN-01' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  scannerDeviceReference?: string;

  @ApiPropertyOptional({ example: 'task-id-or-code' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  taskReference?: string;

  @ApiPropertyOptional({ enum: RfWorkflowType, example: RfWorkflowType.PICK })
  @IsOptional()
  @IsEnum(RfWorkflowType)
  workflow?: RfWorkflowType;

  @ApiPropertyOptional({ example: { appVersion: '0.2.0' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-rf-start-task-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
