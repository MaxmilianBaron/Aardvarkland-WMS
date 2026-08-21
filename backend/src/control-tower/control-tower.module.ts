import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { ControlTowerController } from './control-tower.controller';
import { ControlTowerService } from './control-tower.service';

@Module({
  imports: [DatabaseModule],
  controllers: [ControlTowerController],
  providers: [ControlTowerService],
  exports: [ControlTowerService],
})
export class ControlTowerModule {}
