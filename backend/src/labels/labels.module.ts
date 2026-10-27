import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import {
  LabelPrintJobsController,
  LabelTemplatesController,
  ParcelLabelPrintJobsController,
  PrintAgentsController,
  PrintAgentRuntimeController,
  PrintersController,
  PrintStationsController,
  RuntimePrintJobsController,
  ScanResolverController,
} from './labels.controller';
import { Gs1SyntaxService } from './gs1-syntax.service';
import { LabelsService } from './labels.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    LabelTemplatesController,
    ParcelLabelPrintJobsController,
    LabelPrintJobsController,
    PrintStationsController,
    PrintersController,
    PrintAgentsController,
    RuntimePrintJobsController,
    PrintAgentRuntimeController,
    ScanResolverController,
  ],
  providers: [Gs1SyntaxService, LabelsService],
})
export class LabelsModule {}
