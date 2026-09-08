import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListShipmentsQueryDto {
  @ApiPropertyOptional({ example: 'PACKING' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  status?: string;

  @ApiPropertyOptional({ example: 'CARRIER_A' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  carrier?: string;

  @ApiPropertyOptional({ example: 'ORDER-1001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  outboundOrderReference?: string;

  @ApiPropertyOptional({ example: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
  @ApiPropertyOptional({ description: '3PL owner client id/code used to scope the list.', example: 'CLIENT_A' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerClientReference?: string;

}
