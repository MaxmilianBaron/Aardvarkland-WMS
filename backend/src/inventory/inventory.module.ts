import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [DatabaseModule, ClientsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
