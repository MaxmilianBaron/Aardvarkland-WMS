import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateExternalSystemDto } from './dto/create-external-system.dto';
import { ReplayDeadLetterDto } from './dto/replay-dead-letter.dto';
import { ResolveDeadLetterDto } from './dto/resolve-dead-letter.dto';
import { RunReconciliationDto } from './dto/run-reconciliation.dto';
import { UpsertExternalIdMappingDto } from './dto/upsert-external-id-mapping.dto';
import { IntegrationEnterpriseService } from './integration-enterprise.service';

@ApiTags('integrations-enterprise')
@ApiBearerAuth()
@Controller('integrations/enterprise')
export class IntegrationEnterpriseController {
  constructor(private readonly integrationEnterpriseService: IntegrationEnterpriseService) {}


  @RequirePermissions('integration.read')
  @Get('operations/summary')
  getOperationsSummary() {
    return this.integrationEnterpriseService.getOperationsSummary();
  }

  @RequirePermissions('integration.read')
  @Get('reconciliation/report')
  getReconciliationReport() {
    return this.integrationEnterpriseService.getLastReconciliationReport();
  }

  @RequirePermissions('integration.manage')
  @Post('reconciliation/run')
  runReconciliation(@Body() dto: RunReconciliationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.integrationEnterpriseService.runReconciliation(dto, actor);
  }

  @RequirePermissions('integration.read')
  @Get('external-systems')
  listExternalSystems() {
    return this.integrationEnterpriseService.listExternalSystems();
  }

  @RequirePermissions('integration.manage')
  @Post('external-systems')
  createExternalSystem(@Body() dto: CreateExternalSystemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.integrationEnterpriseService.createExternalSystem(dto, actor);
  }

  @RequirePermissions('integration.manage')
  @Post('external-id-mappings')
  upsertExternalIdMapping(@Body() dto: UpsertExternalIdMappingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.integrationEnterpriseService.upsertExternalIdMapping(dto, actor);
  }

  @RequirePermissions('integration.read')
  @Get('external-id-mappings/resolve')
  resolveExternalIdMapping(
    @Query('externalSystemReference') externalSystemReference: string,
    @Query('resourceType') resourceType: string,
    @Query('externalId') externalId: string,
  ) {
    return this.integrationEnterpriseService.resolveExternalIdMapping({ externalSystemReference, resourceType, externalId });
  }

  @RequirePermissions('integration.read')
  @Get('dead-letters/dashboard')
  getDeadLetterDashboard() {
    return this.integrationEnterpriseService.getDeadLetterDashboard();
  }

  @RequirePermissions('integration.read')
  @Get('dead-letters')
  listDeadLetters(@Query('status') status?: string) {
    return this.integrationEnterpriseService.listDeadLetters(status);
  }


  @RequirePermissions('integration.manage')
  @Post('dead-letters/:deadLetterId/replay')
  replayDeadLetter(
    @Param('deadLetterId') deadLetterId: string,
    @Body() dto: ReplayDeadLetterDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.integrationEnterpriseService.replayDeadLetter(deadLetterId, dto, actor);
  }

  @RequirePermissions('integration.manage')
  @Patch('dead-letters/:deadLetterId')
  resolveDeadLetter(
    @Param('deadLetterId') deadLetterId: string,
    @Body() dto: ResolveDeadLetterDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.integrationEnterpriseService.resolveDeadLetter(deadLetterId, dto, actor);
  }
}
