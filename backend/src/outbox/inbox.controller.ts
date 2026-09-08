import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { ListInboxEventsQueryDto } from './dto/list-inbox-events-query.dto';
import { MarkInboxEventFailedDto } from './dto/mark-inbox-event-failed.dto';
import { MarkInboxEventProcessedDto } from './dto/mark-inbox-event-processed.dto';
import { ReceiveInboxEventDto } from './dto/receive-inbox-event.dto';
import { OutboxService } from './outbox.service';

@ApiTags('integration-inbox')
@ApiBearerAuth()
@Controller('inbox/events')
export class InboxController {
  constructor(private readonly outboxService: OutboxService) {}

  @RequirePermissions('inbox.read')
  @ApiOkResponse({ description: 'Received idempotent integration inbox events.' })
  @Get()
  list(@Query() query: ListInboxEventsQueryDto) {
    return this.outboxService.listInboxEvents(query);
  }

  @RequirePermissions('inbox.manage')
  @ApiOkResponse({ description: 'Receive an idempotent inbound integration event.' })
  @Post()
  receive(@Body() dto: ReceiveInboxEventDto) {
    return this.outboxService.receiveInboxEvent(dto);
  }

  @RequirePermissions('inbox.manage')
  @ApiOkResponse({ description: 'Mark a received inbox event as processed.' })
  @Post(':eventId/processed')
  markProcessed(@Param('eventId') eventId: string, @Body() dto: MarkInboxEventProcessedDto) {
    return this.outboxService.markInboxProcessed(eventId, dto);
  }

  @RequirePermissions('inbox.manage')
  @ApiOkResponse({ description: 'Mark a received inbox event as failed.' })
  @Post(':eventId/failed')
  markFailed(@Param('eventId') eventId: string, @Body() dto: MarkInboxEventFailedDto) {
    return this.outboxService.markInboxFailed(eventId, dto);
  }
}
