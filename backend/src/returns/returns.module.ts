import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control';
import { DatabaseModule } from '../database';
import { ReturnsController } from './returns.controller';
import { ReturnsService } from './returns.service';

@Module({
  imports: [DatabaseModule, AccessControlModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
