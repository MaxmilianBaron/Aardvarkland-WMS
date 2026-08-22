import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { RuntimeMetricsService } from './runtime-metrics.service';

@ApiTags('observability')
@ApiBearerAuth()
@Controller('observability')
export class PrometheusMetricsController {
  constructor(private readonly runtimeMetrics: RuntimeMetricsService) {}

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Runtime metrics snapshot for dashboards and operations consoles.' })
  @Get('runtime')
  getRuntimeSnapshot() {
    return this.runtimeMetrics.getRuntimeSnapshot();
  }

  @RequirePermissions('metrics.read')
  @ApiOkResponse({ description: 'Prometheus-compatible runtime metrics.' })
  @Header('Content-Type', 'text/plain; version=0.0.4')
  @Get('metrics')
  getPrometheusMetrics(): string {
    return this.runtimeMetrics.renderPrometheusMetrics();
  }
}
