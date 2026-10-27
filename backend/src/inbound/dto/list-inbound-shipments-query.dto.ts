import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

import { InboundStatus } from '../inbound.types';

export class ListInboundShipmentsQueryDto {
  @ApiPropertyOptional({ enum: InboundStatus })
  @IsOptional()
  @IsEnum(InboundStatus)
  status?: InboundStatus;

  @ApiPropertyOptional({ example: 'ASN-100001' })
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
