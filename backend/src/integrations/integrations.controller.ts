import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CreateIntegrationEndpointDto } from './dto/create-integration-endpoint.dto';
import { TestIntegrationEndpointDto } from './dto/test-integration-endpoint.dto';
import { UpdateIntegrationEndpointDto } from './dto/update-integration-endpoint.dto';
import { IntegrationDispatchService } from './integration-dispatch.service';
import { IntegrationsService } from './integrations.service';

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations/endpoints')
export class IntegrationsController {
  constructor(
    private readonly integrationsService: IntegrationsService,
    private readonly integrationDispatchService: IntegrationDispatchService,
  ) {}

  @RequirePermissions('integration.read')
  @Get()
  findMany() {
    return this.integrationsService.findMany();
  }

  @RequirePermissions('integration.manage')
  @Post()
  create(@Body() dto: CreateIntegrationEndpointDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.integrationsService.create(dto, actor);
  }

  @RequirePermissions('integration.manage')
  @Patch(':endpointId')
  update(
    @Param('endpointId') endpointId: string,
    @Body() dto: UpdateIntegrationEndpointDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.integrationsService.update(endpointId, dto, actor);
  }

  @RequirePermissions('integration.manage')
  @Post(':endpointId/test')
  testEndpoint(
    @Param('endpointId') endpointId: string,
    @Body() dto: TestIntegrationEndpointDto,
  ) {
    return this.integrationDispatchService.pingEndpoint(endpointId, dto);
  }
}
