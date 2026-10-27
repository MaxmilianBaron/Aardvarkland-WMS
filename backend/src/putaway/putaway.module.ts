import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { PutawayController } from './putaway.controller';
import { PutawayService } from './putaway.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PutawayController],
  providers: [PutawayService],
})
export class PutawayModule {}
