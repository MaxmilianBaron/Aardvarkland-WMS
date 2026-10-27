import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { ExceptionSeverity, ExceptionStatus } from '../exceptions.types';

export class UpdateExceptionDto {
  @ApiPropertyOptional({ enum: ExceptionStatus, example: ExceptionStatus.IN_PROGRESS })
  @IsOptional()
  @IsEnum(ExceptionStatus)
  status?: ExceptionStatus;

  @ApiPropertyOptional({ enum: ExceptionSeverity, example: ExceptionSeverity.CRITICAL })
  @IsOptional()
  @IsEnum(ExceptionSeverity)
  severity?: ExceptionSeverity;

  @ApiPropertyOptional({ example: 'Damaged parcel confirmed' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @ApiPropertyOptional({
    example: 'Manual inspection confirms the parcel needs repacking.',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @ApiPropertyOptional({
    description: 'Location id or code within the same warehouse. Use null to clear location.',
    example: 'QUAR-01',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  locationReference?: string | null;

  @ApiPropertyOptional({ example: { inspectedBy: 'shift-lead' }, nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
