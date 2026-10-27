import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { IdempotencyController } from './idempotency.controller';
import { IdempotencyService } from './idempotency.service';

@Module({
  imports: [DatabaseModule],
  controllers: [IdempotencyController],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
