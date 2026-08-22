import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';

export class SubmitCycleCountDto {
  @ApiPropertyOptional({ example: 47 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity!: number;

  @ApiPropertyOptional({ example: { scannerSessionId: '...' } })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
