import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [DatabaseModule, ClientsModule],
  controllers: [ShippingController],
  providers: [ShippingService],
})
export class ShippingModule {}
