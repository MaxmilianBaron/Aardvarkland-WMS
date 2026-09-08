import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { SkusController } from './skus.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ProductsController, SkusController],
  providers: [ProductsService],
})
export class ProductsModule {}
