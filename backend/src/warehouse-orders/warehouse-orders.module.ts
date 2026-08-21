import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { WarehouseOrdersController } from './warehouse-orders.controller';
import { WarehouseOrdersService } from './warehouse-orders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WarehouseOrdersController],
  providers: [WarehouseOrdersService],
  exports: [WarehouseOrdersService],
})
export class WarehouseOrdersModule {}
