import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database';
import { FrontendEventsController } from './frontend-events.controller';
import { MetricsController } from './metrics.controller';
import { PrometheusMetricsController } from './prometheus-metrics.controller';
import { RuntimeMetricsService } from './runtime-metrics.service';
import { MetricsService } from './metrics.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FrontendEventsController, MetricsController, PrometheusMetricsController],
  providers: [MetricsService, RuntimeMetricsService],
  exports: [RuntimeMetricsService],
})
export class ObservabilityModule {}
