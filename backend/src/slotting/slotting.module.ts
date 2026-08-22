import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { SlottingController } from './slotting.controller';
import { SlottingService } from './slotting.service';

@Module({
  imports: [DatabaseModule],
  controllers: [SlottingController],
  providers: [SlottingService],
  exports: [SlottingService],
})
export class SlottingModule {}
