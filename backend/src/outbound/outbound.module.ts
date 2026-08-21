import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { OutboundController } from './outbound.controller';
import { OutboundService } from './outbound.service';

@Module({
  imports: [DatabaseModule, ClientsModule],
  controllers: [OutboundController],
  providers: [OutboundService],
})
export class OutboundModule {}
