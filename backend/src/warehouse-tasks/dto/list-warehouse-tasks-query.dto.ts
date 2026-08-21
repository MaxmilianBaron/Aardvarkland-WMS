import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { WarehouseTaskStatus, WarehouseTaskType } from '../warehouse-tasks.types';

export class ListWarehouseTasksQueryDto {
  @ApiPropertyOptional({ enum: WarehouseTaskType })
  @IsOptional()
  @IsEnum(WarehouseTaskType)
  type?: WarehouseTaskType;

  @ApiPropertyOptional({ enum: WarehouseTaskStatus })
  @IsOptional()
  @IsEnum(WarehouseTaskStatus)
  status?: WarehouseTaskStatus;

  @ApiPropertyOptional({ example: 'SKU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sku?: string;

  @ApiPropertyOptional({ example: 'operator@example.com' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  assignedUserReference?: string;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  fromLocationReference?: string;

  @ApiPropertyOptional({ example: 'PACK-01' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  toLocationReference?: string;

  @ApiPropertyOptional({ example: 'HU-100001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @ApiPropertyOptional({ description: '3PL owner client id/code used to scope the list.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

  @ApiPropertyOptional({ example: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
