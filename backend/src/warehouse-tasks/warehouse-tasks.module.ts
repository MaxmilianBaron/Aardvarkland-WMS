import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { WarehouseTasksController } from './warehouse-tasks.controller';
import { WarehouseTasksService } from './warehouse-tasks.service';

@Module({
  imports: [DatabaseModule, ClientsModule],
  controllers: [WarehouseTasksController],
  providers: [WarehouseTasksService],
})
export class WarehouseTasksModule {}
