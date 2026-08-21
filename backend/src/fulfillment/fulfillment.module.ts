import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentPermissionsGuard } from './fulfillment-permissions.guard';
import { FulfillmentService } from './fulfillment.service';

@Module({
  imports: [DatabaseModule, ClientsModule],
  controllers: [FulfillmentController],
  providers: [FulfillmentService, FulfillmentPermissionsGuard],
})
export class FulfillmentModule {}
