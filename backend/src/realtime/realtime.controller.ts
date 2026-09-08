import { Controller, MessageEvent, Param, Sse } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { RealtimeBroadcasterService } from './realtime-broadcaster.service';

@ApiTags('realtime')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/realtime')
export class RealtimeController {
  constructor(private readonly realtimeBroadcaster: RealtimeBroadcasterService) {}

  @RequireWarehousePermissions('realtime.read')
  @ApiOperation({ summary: 'Subscribe to warehouse realtime events' })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Server-Sent Events stream for this warehouse.' })
  @Sse('events')
  events(@Param('warehouseId') warehouseId: string): Observable<MessageEvent> {
    return this.realtimeBroadcaster.stream(warehouseId);
  }
}
