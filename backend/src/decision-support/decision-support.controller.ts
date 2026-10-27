import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { DecisionSupportService } from './decision-support.service';
import { ExceptionTriageDto } from './dto/exception-triage.dto';
import { OpsSummaryDto } from './dto/ops-summary.dto';

@ApiTags('decision-support')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/decision-support')
export class DecisionSupportController {
  constructor(private readonly decisionSupportService: DecisionSupportService) {}

  @RequireWarehousePermissions('decision-support.use')
  @Post('ops-summary')
  opsSummary(@Param('warehouseId') warehouseId: string, @Body() dto: OpsSummaryDto = {}) {
    return this.decisionSupportService.createOpsSummary(warehouseId, dto);
  }

  @RequireWarehousePermissions('decision-support.use')
  @Post('exception-triage')
  exceptionTriage(@Param('warehouseId') warehouseId: string, @Body() dto: ExceptionTriageDto = {}) {
    return this.decisionSupportService.triageExceptions(warehouseId, dto);
  }
}
