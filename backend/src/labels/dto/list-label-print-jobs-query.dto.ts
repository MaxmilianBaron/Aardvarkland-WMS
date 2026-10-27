import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { LabelJobStatus } from '../labels.types';

export class ListLabelPrintJobsQueryDto {
  @ApiPropertyOptional({ enum: LabelJobStatus })
  @IsOptional()
  @IsEnum(LabelJobStatus)
  status?: LabelJobStatus;
}
