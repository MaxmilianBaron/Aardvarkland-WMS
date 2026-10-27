import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { OperationsRuntimeController } from './operations-runtime.controller';
import { OperationsRuntimeService } from './operations-runtime.service';

@Module({
  imports: [DatabaseModule],
  controllers: [OperationsRuntimeController],
  providers: [OperationsRuntimeService],
  exports: [OperationsRuntimeService],
})
export class OperationsRuntimeModule {}
