import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

import { RfExceptionCode } from '../rf-workflows.types';

export class ReportRfExceptionDto {
  @ApiPropertyOptional({ enum: RfExceptionCode, example: RfExceptionCode.SHORT_PICK })
  @IsOptional()
  @IsEnum(RfExceptionCode)
  code?: RfExceptionCode;

  @ApiPropertyOptional({ example: 'Zboží není v lokaci' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({ example: 'V lokaci A-01-01 byly jen 2 ks místo 5 ks.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  shortQuantity?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  releaseReservation?: boolean;

  @ApiPropertyOptional({ example: 'FAILED' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  taskStatus?: 'BLOCKED' | 'FAILED';

  @ApiPropertyOptional({ example: { scanned: 'WRONG-SKU' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'storage-rf-exception-task-id' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;
}
