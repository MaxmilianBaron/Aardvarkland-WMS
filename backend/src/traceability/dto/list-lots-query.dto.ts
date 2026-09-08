import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

import { LotStatus } from '../traceability.types';

export class ListLotsQueryDto {
  @ApiPropertyOptional({ example: 'SKU-001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  skuReference?: string;

  @ApiPropertyOptional({ enum: LotStatus })
  @IsOptional()
  @IsEnum(LotStatus)
  status?: LotStatus;

  @ApiPropertyOptional({ example: 'client-id' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  ownerClientId?: string;

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
