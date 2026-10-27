import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { Public } from '../access-control/decorators/public.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { CarriersService } from './carriers.service';
import { CarrierTrackingWebhookDto } from './dto/carrier-tracking-webhook.dto';
import { CloseCarrierManifestDto } from './dto/close-carrier-manifest.dto';
import { CreateCarrierLabelDto } from './dto/create-carrier-label.dto';
import { ListCarrierTrackingEventsQueryDto } from './dto/list-carrier-tracking-events-query.dto';
import { SyncCarrierTrackingDto } from './dto/sync-carrier-tracking.dto';
import { UpsertCarrierCredentialDto } from './dto/upsert-carrier-credential.dto';
import { VoidCarrierLabelDto } from './dto/void-carrier-label.dto';

@ApiTags('carriers')
@ApiBearerAuth()
@Controller()
export class CarriersController {
  constructor(private readonly carriersService: CarriersService) {}

  @RequirePermissions('carrier.read')
  @ApiOkResponse({ description: 'Supported carrier adapter profiles.' })
  @Get('carriers')
  listCarriers() {
    return this.carriersService.listCarriers();
  }

  @RequireWarehousePermissions('carrier.read')
  @ApiOkResponse({ description: 'List masked encrypted carrier credentials for a warehouse.' })
  @Get('warehouses/:warehouseId/carriers/credentials')
  listCredentials(@Param('warehouseId') warehouseId: string, @Query('carrier') carrier?: string) {
    return this.carriersService.listCredentials(warehouseId, carrier);
  }

  @RequireWarehousePermissions('carrier.manage')
  @ApiOkResponse({ description: 'Create, rotate, or deactivate encrypted carrier adapter credentials.' })
  @Post('warehouses/:warehouseId/carriers/:carrier/credentials')
  upsertCredential(
    @Param('warehouseId') warehouseId: string,
    @Param('carrier') carrier: string,
    @Body() dto: UpsertCarrierCredentialDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.carriersService.upsertCredential(warehouseId, carrier, dto, actor);
  }

  @RequireWarehousePermissions('carrier.read')
  @ApiOkResponse({ description: 'Carrier tracking events received by webhook or local sync.' })
  @Get('warehouses/:warehouseId/carriers/tracking-events')
  listTrackingEvents(@Param('warehouseId') warehouseId: string, @Query() query: ListCarrierTrackingEventsQueryDto) {
    return this.carriersService.listTrackingEvents(warehouseId, query);
  }

  @RequireWarehousePermissions('carrier.manage')
  @ApiOkResponse({ description: 'Create an idempotent carrier label through the adapter framework.' })
  @Post('warehouses/:warehouseId/carriers/:carrier/labels')
  createLabel(@Param('warehouseId') warehouseId: string, @Param('carrier') carrier: string, @Body() dto: CreateCarrierLabelDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.carriersService.createLabel(warehouseId, carrier, dto, actor);
  }

  @RequireWarehousePermissions('carrier.manage')
  @ApiOkResponse({ description: 'Void/cancel a generated carrier label.' })
  @Post('warehouses/:warehouseId/carriers/:carrier/labels/:labelReference/void')
  voidLabel(@Param('warehouseId') warehouseId: string, @Param('carrier') carrier: string, @Param('labelReference') labelReference: string, @Body() dto: VoidCarrierLabelDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.carriersService.voidLabel(warehouseId, carrier, labelReference, dto, actor);
  }

  @RequireWarehousePermissions('carrier.manage')
  @ApiOkResponse({ description: 'Close a carrier manifest for staged/shipped packages.' })
  @Post('warehouses/:warehouseId/carriers/:carrier/manifests/close')
  closeManifest(@Param('warehouseId') warehouseId: string, @Param('carrier') carrier: string, @Body() dto: CloseCarrierManifestDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.carriersService.closeManifest(warehouseId, carrier, dto, actor);
  }

  @RequireWarehousePermissions('carrier.manage')
  @ApiOkResponse({ description: 'Run a deterministic local tracking sync for generated labels.' })
  @Post('warehouses/:warehouseId/carriers/:carrier/tracking-sync')
  syncTracking(@Param('warehouseId') warehouseId: string, @Param('carrier') carrier: string, @Body() dto: SyncCarrierTrackingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.carriersService.syncTracking(warehouseId, carrier, dto, actor);
  }

  @Public()
  @ApiOkResponse({ description: 'Receive a carrier tracking webhook. Secured by WEBHOOK_SHARED_SECRET when configured.' })
  @Post('warehouses/:warehouseId/carriers/:carrier/webhooks/tracking')
  receiveTrackingWebhook(
    @Param('warehouseId') warehouseId: string,
    @Param('carrier') carrier: string,
    @Body() dto: CarrierTrackingWebhookDto,
    @Headers('x-webhook-secret') webhookSecret: string | undefined,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.carriersService.receiveTrackingWebhook(warehouseId, carrier, dto, webhookSecret, headers);
  }
}
