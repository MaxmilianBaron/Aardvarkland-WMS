import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RunQueueWorkerDto {
  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxAttempts?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  retryDelaySeconds?: number;

  @ApiPropertyOptional({ example: 'BILLING_INVOICE_FINALIZED' })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
