import { IsEnum, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ExceptionSeverity } from '../exceptions.types';

export class CreateExceptionDto {
  @ApiProperty({ example: 'DAMAGED' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  code!: string;

  @ApiProperty({ example: 'Damaged parcel detected' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @ApiPropertyOptional({ example: 'Outer packaging is torn and needs manual inspection.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ExceptionSeverity, example: ExceptionSeverity.HIGH })
  @IsOptional()
  @IsEnum(ExceptionSeverity)
  severity?: ExceptionSeverity;

  @ApiPropertyOptional({ example: 'QUAR-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  locationReference?: string;

  @ApiPropertyOptional({ example: { photoRequired: true, source: 'scanner' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
