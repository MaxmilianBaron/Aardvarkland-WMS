import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { IntegrationsModule } from '../integrations';
import { InboxController } from './inbox.controller';
import { OutboxController } from './outbox.controller';
import { OutboxService } from './outbox.service';

@Module({
  imports: [DatabaseModule, IntegrationsModule],
  controllers: [OutboxController, InboxController],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
