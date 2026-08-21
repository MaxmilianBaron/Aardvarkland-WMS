import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { SerialNumberStatus } from '../traceability.types';

export class UpdateSerialNumberDto {
  @ApiPropertyOptional({ enum: SerialNumberStatus })
  @IsOptional()
  @IsEnum(SerialNumberStatus)
  status?: SerialNumberStatus;

  @ApiPropertyOptional({ example: 'location-id-or-code', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(120)
  lastSeenLocationReference?: string | null;

  @ApiPropertyOptional({ example: 'stock-quant-id', nullable: true })
  @IsOptional()
  @ValidateIf((_, value: unknown) => value !== null)
  @IsString()
  @MaxLength(80)
  stockQuantId?: string | null;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
