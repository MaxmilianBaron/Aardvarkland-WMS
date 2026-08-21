import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { MutationRealtimeInterceptor } from './mutation-realtime.interceptor';
import { RealtimeBroadcasterService } from './realtime-broadcaster.service';
import { RealtimeController } from './realtime.controller';

@Module({
  controllers: [RealtimeController],
  providers: [
    RealtimeBroadcasterService,
    {
      provide: APP_INTERCEPTOR,
      useClass: MutationRealtimeInterceptor,
    },
  ],
  exports: [RealtimeBroadcasterService],
})
export class RealtimeModule {}
