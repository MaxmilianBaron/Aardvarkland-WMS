import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, IsInt, Max, Min } from 'class-validator';

import { WarehouseOrderStatus, WarehouseOrderType } from '../warehouse-orders.types';

export class ListWarehouseOrdersQueryDto {
  @ApiPropertyOptional({ enum: WarehouseOrderStatus })
  @IsOptional()
  @IsEnum(WarehouseOrderStatus)
  status?: WarehouseOrderStatus;

  @ApiPropertyOptional({ enum: WarehouseOrderType })
  @IsOptional()
  @IsEnum(WarehouseOrderType)
  orderType?: WarehouseOrderType;

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

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
