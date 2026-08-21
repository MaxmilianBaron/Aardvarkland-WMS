import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { ExceptionSeverity, ExceptionStatus } from '../exceptions.types';

export class ListExceptionsQueryDto {
  @ApiPropertyOptional({ enum: ExceptionStatus })
  @IsOptional()
  @IsEnum(ExceptionStatus)
  status?: ExceptionStatus;

  @ApiPropertyOptional({ enum: ExceptionSeverity })
  @IsOptional()
  @IsEnum(ExceptionSeverity)
  severity?: ExceptionSeverity;

  @ApiPropertyOptional({ example: 'PKG-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  parcelReference?: string;

  @ApiPropertyOptional({ example: 'damaged' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 250 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(250)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0, maximum: 100000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  skip?: number;
}
