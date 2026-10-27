import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsWindowQueryDto {
  @ApiPropertyOptional({
    default: 7,
    description: 'Rolling analytics window in days.',
    maximum: 365,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}
