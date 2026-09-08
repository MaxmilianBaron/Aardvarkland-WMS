import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum ExceptionTriageFocus {
  All = 'ALL',
  HighRisk = 'HIGH_RISK',
  Open = 'OPEN',
}

export class ExceptionTriageDto {
  @ApiPropertyOptional({
    default: 20,
    description: 'Maximum number of exception records to triage.',
    maximum: 50,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    default: ExceptionTriageFocus.Open,
    enum: ExceptionTriageFocus,
  })
  @IsOptional()
  @IsEnum(ExceptionTriageFocus)
  focus?: ExceptionTriageFocus;
}
