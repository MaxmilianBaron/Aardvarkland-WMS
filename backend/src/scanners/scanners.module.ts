import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { ScannersController } from './scanners.controller';
import { ScannersService } from './scanners.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ScannersController],
  providers: [ScannersService],
})
export class ScannersModule {}
