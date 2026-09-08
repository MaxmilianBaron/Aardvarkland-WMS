import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class RunRetentionCleanupDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({ minimum: 10, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(10000)
  batchSize?: number;
}
