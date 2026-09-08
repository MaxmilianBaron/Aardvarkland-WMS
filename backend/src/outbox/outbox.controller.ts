import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { DispatchOutboxEventsDto } from './dto/dispatch-outbox-events.dto';
import { ListDeadLetterOutboxEventsQueryDto } from './dto/list-dead-letter-outbox-events-query.dto';
import { ListInboxEventsQueryDto } from './dto/list-inbox-events-query.dto';
import { ListPendingOutboxEventsQueryDto } from './dto/list-pending-outbox-events-query.dto';
import { MarkInboxEventFailedDto } from './dto/mark-inbox-event-failed.dto';
import { MarkInboxEventProcessedDto } from './dto/mark-inbox-event-processed.dto';
import { ReceiveInboxEventDto } from './dto/receive-inbox-event.dto';
import { RequeueDeadLetterOutboxEventDto } from './dto/requeue-dead-letter-outbox-event.dto';
import { OutboxService } from './outbox.service';

@ApiTags('outbox')
@ApiBearerAuth()
@Controller('outbox/events')
export class OutboxController {
  constructor(private readonly outboxService: OutboxService) {}

  @RequirePermissions('outbox.read')
  @ApiOkResponse({ description: 'Pending outbox events.' })
  @Get('pending')
  listPending(@Query() query: ListPendingOutboxEventsQueryDto) {
    return this.outboxService.listPending(query);
  }

  @RequirePermissions('outbox.manage')
  @ApiOkResponse({ description: 'Dispatch pending outbox events using the local worker.' })
  @Post('dispatch')
  dispatchPending(@Body() dto: DispatchOutboxEventsDto) {
    return this.outboxService.dispatchPending(dto);
  }

  @RequirePermissions('outbox.read')
  @ApiOkResponse({ description: 'Dead-lettered outbox events waiting for manual review or replay.' })
  @Get('dead-letter')
  listDeadLetters(@Query() query: ListDeadLetterOutboxEventsQueryDto) {
    return this.outboxService.listDeadLetters(query);
  }

  @RequirePermissions('outbox.manage')
  @ApiOkResponse({ description: 'Requeue a dead-letter outbox event after manual review.' })
  @Post('dead-letter/:eventId/requeue')
  requeueDeadLetter(
    @Param('eventId') eventId: string,
    @Body() dto: RequeueDeadLetterOutboxEventDto,
  ) {
    return this.outboxService.requeueDeadLetter(eventId, dto);
  }

  @RequirePermissions('inbox.read')
  @ApiOkResponse({ description: 'Received inbox events.' })
  @Get('inbox')
  listInbox(@Query() query: ListInboxEventsQueryDto) {
    return this.outboxService.listInboxEvents(query);
  }

  @RequirePermissions('inbox.manage')
  @ApiOkResponse({ description: 'Receive an idempotent inbound integration event.' })
  @Post('inbox')
  receiveInbox(@Body() dto: ReceiveInboxEventDto) {
    return this.outboxService.receiveInboxEvent(dto);
  }

  @RequirePermissions('inbox.manage')
  @ApiOkResponse({ description: 'Mark a received inbox event as processed.' })
  @Post('inbox/:eventId/processed')
  markInboxProcessed(
    @Param('eventId') eventId: string,
    @Body() dto: MarkInboxEventProcessedDto,
  ) {
    return this.outboxService.markInboxProcessed(eventId, dto);
  }

  @RequirePermissions('inbox.manage')
  @ApiOkResponse({ description: 'Mark a received inbox event as failed.' })
  @Post('inbox/:eventId/failed')
  markInboxFailed(
    @Param('eventId') eventId: string,
    @Body() dto: MarkInboxEventFailedDto,
  ) {
    return this.outboxService.markInboxFailed(eventId, dto);
  }
}
