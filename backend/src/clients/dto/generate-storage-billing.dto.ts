import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GenerateStorageBillingDto {
  @ApiProperty({ example: '2026-05-01T00:00:00.000Z' })
  @IsDateString()
  periodStart!: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @IsDateString()
  periodEnd!: string;

  @ApiPropertyOptional({ example: 2, description: 'Minor currency units per stock unit per chargeable day. If omitted, the active STORAGE_DAY rate card rate is used.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  unitPriceMinorPerUnitDay?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
