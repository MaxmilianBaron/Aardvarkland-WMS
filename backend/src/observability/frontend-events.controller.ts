import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '../access-control';
import { RecordFrontendEventDto } from './dto/record-frontend-event.dto';
import { RuntimeMetricsService } from './runtime-metrics.service';

@ApiTags('observability')
@Controller('observability/frontend-events')
export class FrontendEventsController {
  constructor(private readonly runtimeMetrics: RuntimeMetricsService) {}

  @Public()
  @ApiOkResponse({ description: 'Record a redacted browser-side runtime event.' })
  @Post()
  recordEvent(
    @Body() dto: RecordFrontendEventDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    const event = this.runtimeMetrics.recordFrontendEvent({ ...dto, userAgent });
    return {
      accepted: true,
      eventId: event.id,
      receivedAt: event.receivedAt,
    };
  }
}
