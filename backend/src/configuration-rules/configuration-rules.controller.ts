import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { ConfigurationRulesService } from './configuration-rules.service';
import { SimulateConfigurationRuleDto } from './dto/simulate-configuration-rule.dto';
import { UpdateConfigurationRuleDto } from './dto/update-configuration-rule.dto';
import { UpsertConfigurationRuleDto } from './dto/upsert-configuration-rule.dto';

@ApiTags('configuration-rules')
@ApiBearerAuth()
@Controller('warehouses/:warehouseId/configuration')
export class ConfigurationRulesController {
  constructor(private readonly configurationRulesService: ConfigurationRulesService) {}

  @RequireWarehousePermissions('warehouse.read')
  @Get('templates')
  getTemplates() {
    return this.configurationRulesService.getTemplates();
  }

  @RequireWarehousePermissions('warehouse.read')
  @Get('rules')
  listRules(
    @Param('warehouseId') warehouseId: string,
    @Query('ruleType') ruleType?: string,
    @Query('status') status?: string,
    @Query('ownerClientReference') ownerClientReference?: string,
  ) {
    return this.configurationRulesService.listRules({
      warehouseReference: warehouseId,
      ruleType,
      status,
      ownerClientReference,
    });
  }

  @RequireWarehousePermissions('warehouse.read')
  @Get('effective')
  getEffectiveRules(
    @Param('warehouseId') warehouseId: string,
    @Query('ruleType') ruleType?: string,
    @Query('ownerClientReference') ownerClientReference?: string,
  ) {
    return this.configurationRulesService.getEffectiveRules({
      warehouseReference: warehouseId,
      ruleType,
      ownerClientReference,
    });
  }

  @RequireWarehousePermissions('warehouse.manage')
  @Post('rules')
  upsertRule(
    @Param('warehouseId') warehouseId: string,
    @Body() dto: UpsertConfigurationRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.configurationRulesService.upsertRule(warehouseId, dto, actor);
  }

  @RequireWarehousePermissions('warehouse.manage')
  @Patch('rules/:ruleId')
  updateRule(
    @Param('warehouseId') warehouseId: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateConfigurationRuleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.configurationRulesService.updateRule(warehouseId, ruleId, dto, actor);
  }

  @RequireWarehousePermissions('warehouse.read')
  @Post('simulate')
  simulateRule(@Param('warehouseId') warehouseId: string, @Body() dto: SimulateConfigurationRuleDto) {
    return this.configurationRulesService.simulateRule(warehouseId, dto);
  }
}
