import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ControlTowerQueryDto {
  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 72 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(72)
  cutoffWindowHours?: number;

  @ApiPropertyOptional({ example: 90, minimum: 5, maximum: 20160 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(20160)
  staleTaskMinutes?: number;
}
