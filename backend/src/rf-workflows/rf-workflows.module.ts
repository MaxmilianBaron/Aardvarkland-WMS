import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { RfWorkflowsController } from './rf-workflows.controller';
import { RfWorkflowsService } from './rf-workflows.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RfWorkflowsController],
  providers: [RfWorkflowsService],
})
export class RfWorkflowsModule {}
