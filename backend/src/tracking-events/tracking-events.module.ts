import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { TrackingEventsController } from './tracking-events.controller';
import { TrackingEventsService } from './tracking-events.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TrackingEventsController],
  providers: [TrackingEventsService],
})
export class TrackingEventsModule {}
