import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

import { BillingEventStatus, BillingEventType } from '../clients.types';

export class ListBillingEventsQueryDto {
  @ApiPropertyOptional({ enum: BillingEventStatus })
  @IsOptional()
  @IsIn(Object.values(BillingEventStatus))
  status?: BillingEventStatus;

  @ApiPropertyOptional({ enum: BillingEventType })
  @IsOptional()
  @IsIn(Object.values(BillingEventType))
  eventType?: BillingEventType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredTo?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  take?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
