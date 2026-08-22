import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';

@Module({
  imports: [DatabaseModule],
  controllers: [TraceabilityController],
  providers: [TraceabilityService],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}
