import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control';
import { DatabaseModule } from '../database';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

@Module({
  imports: [DatabaseModule, AccessControlModule],
  controllers: [QualityController],
  providers: [QualityService],
  exports: [QualityService],
})
export class QualityModule {}
