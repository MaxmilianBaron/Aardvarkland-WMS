import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CompleteQualityInspectionDto } from './dto/complete-quality-inspection.dto';
import { CreateQualityInspectionDto } from './dto/create-quality-inspection.dto';
import { CreateQualitySamplingRuleDto } from './dto/create-quality-sampling-rule.dto';
import { QualityService } from './quality.service';

@ApiTags('quality')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/quality')
export class QualityController {
  constructor(private readonly qualityService: QualityService) {}

  @RequireWarehousePermissions('inventory.read')
  @Get('inspections')
  listInspections(@Param('warehouseId') warehouseId: string) {
    return this.qualityService.listInspections(warehouseId);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('inspections')
  createInspection(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateQualityInspectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.qualityService.createInspection(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('inspections/:inspectionId/complete')
  completeInspection(
    @Param('warehouseId') warehouseId: string,
    @Param('inspectionId') inspectionId: string,
    @Body() dto: CompleteQualityInspectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.qualityService.completeInspection(warehouseId, inspectionId, dto, actor);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('quarantine/:quantId/release')
  releaseQuarantine(
    @Param('warehouseId') warehouseId: string,
    @Param('quantId') quantId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.qualityService.releaseQuarantine(warehouseId, quantId, actor);
  }

  @RequireWarehousePermissions('inventory.read')
  @Get('sampling-rules')
  listSamplingRules(@Param('warehouseId') warehouseId: string) {
    return this.qualityService.listSamplingRules(warehouseId);
  }

  @RequireWarehousePermissions('inventory.adjust')
  @Post('sampling-rules')
  createSamplingRule(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: CreateQualitySamplingRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.qualityService.createSamplingRule(warehouseId, dto, actor);
  }
}
