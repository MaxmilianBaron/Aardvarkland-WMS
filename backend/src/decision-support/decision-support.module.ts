import { Module } from '@nestjs/common';

import { AnalyticsModule } from '../analytics';
import { DatabaseModule } from '../database';
import { DecisionSupportController } from './decision-support.controller';
import { DecisionSupportService } from './decision-support.service';

@Module({
  imports: [AnalyticsModule, DatabaseModule],
  controllers: [DecisionSupportController],
  providers: [DecisionSupportService],
})
export class DecisionSupportModule {}
