import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { InboundController } from './inbound.controller';
import { InboundService } from './inbound.service';

@Module({
  imports: [DatabaseModule, ClientsModule],
  controllers: [InboundController],
  providers: [InboundService],
})
export class InboundModule {}
