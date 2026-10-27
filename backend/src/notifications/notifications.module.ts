import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { RealtimeModule } from '../realtime';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [DatabaseModule, RealtimeModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
