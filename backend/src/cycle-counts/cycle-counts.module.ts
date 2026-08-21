import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { CycleCountsController } from './cycle-counts.controller';
import { CycleCountsService } from './cycle-counts.service';

@Module({
  imports: [DatabaseModule],
  controllers: [CycleCountsController],
  providers: [CycleCountsService],
})
export class CycleCountsModule {}
