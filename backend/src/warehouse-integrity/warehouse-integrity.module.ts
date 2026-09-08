import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { WarehouseIntegrityController } from './warehouse-integrity.controller';
import { WarehouseIntegrityService } from './warehouse-integrity.service';

@Module({
  imports: [DatabaseModule],
  controllers: [WarehouseIntegrityController],
  providers: [WarehouseIntegrityService],
  exports: [WarehouseIntegrityService],
})
export class WarehouseIntegrityModule {}
