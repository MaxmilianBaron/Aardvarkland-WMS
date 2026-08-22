import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class OpsSummaryDto {
  @ApiPropertyOptional({
    default: 7,
    description: 'Rolling warehouse window used for the operational summary.',
    maximum: 90,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  lookbackDays?: number;

  @ApiPropertyOptional({
    default: true,
    description: 'Include deterministic recommended actions in the response.',
  })
  @IsOptional()
  @IsBoolean()
  includeRecommendations?: boolean;
}
