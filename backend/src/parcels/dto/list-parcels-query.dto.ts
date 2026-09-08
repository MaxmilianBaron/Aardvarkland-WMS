import { Type } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength, IsInt, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { ParcelStatus } from '../../generated/prisma/client';

export class ListParcelsQueryDto {
  @ApiPropertyOptional({ enum: ParcelStatus })
  @IsOptional()
  @IsEnum(ParcelStatus)
  status?: ParcelStatus;

  @ApiPropertyOptional({ example: 'PKG-100001' })
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

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
