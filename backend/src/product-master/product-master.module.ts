import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control';
import { DatabaseModule } from '../database';
import { ProductMasterController } from './product-master.controller';
import { ProductMasterService } from './product-master.service';

@Module({
  imports: [DatabaseModule, AccessControlModule],
  controllers: [ProductMasterController],
  providers: [ProductMasterService],
  exports: [ProductMasterService],
})
export class ProductMasterModule {}
