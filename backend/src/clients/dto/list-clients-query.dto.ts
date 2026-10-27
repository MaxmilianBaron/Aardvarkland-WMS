import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsInt, Max, Min } from 'class-validator';

import { WmsClientStatus } from '../clients.types';

export class ListClientsQueryDto {
  @ApiPropertyOptional({ enum: WmsClientStatus })
  @IsOptional()
  @IsIn(Object.values(WmsClientStatus))
  status?: WmsClientStatus;

  @ApiPropertyOptional({ example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
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
