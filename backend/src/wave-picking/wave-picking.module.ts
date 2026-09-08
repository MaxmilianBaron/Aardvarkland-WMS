import { Module } from '@nestjs/common';

import { ClientsModule } from '../clients';
import { DatabaseModule } from '../database';
import { WavePickingController } from './wave-picking.controller';
import { WavePickingService } from './wave-picking.service';

@Module({
  imports: [DatabaseModule, ClientsModule],
  controllers: [WavePickingController],
  providers: [WavePickingService],
  exports: [WavePickingService],
})
export class WavePickingModule {}
