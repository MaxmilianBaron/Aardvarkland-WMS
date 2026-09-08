import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../access-control/decorators/current-user.decorator';
import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { RequireWarehousePermissions } from '../access-control/decorators/require-warehouse-permissions.decorator';
import { AuthenticatedUser } from '../access-control/types';
import { AttachClientWarehouseDto } from './dto/attach-client-warehouse.dto';
import { ListBillingCreditNotesQueryDto } from './dto/list-billing-credit-notes-query.dto';
import { FinalizeBillingCreditNoteDto } from './dto/finalize-billing-credit-note.dto';
import { CreateBillingCreditNoteDto } from './dto/create-billing-credit-note.dto';
import { CreateBillingInvoiceDto } from './dto/create-billing-invoice.dto';
import { CreateBillingEventDto } from './dto/create-billing-event.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { CreateClientRateCardDto } from './dto/create-client-rate-card.dto';
import { CreateClientSkuAliasDto } from './dto/create-client-sku-alias.dto';
import { GenerateBillingEventsDto } from './dto/generate-billing-events.dto';
import { GenerateStorageBillingDto } from './dto/generate-storage-billing.dto';
import { GrantUserClientAccessDto } from './dto/grant-user-client-access.dto';
import { LinkClientResourceDto } from './dto/link-client-resource.dto';
import { ListBillingEventsQueryDto } from './dto/list-billing-events-query.dto';
import { ListBillingInvoicesQueryDto } from './dto/list-billing-invoices-query.dto';
import { ListClientsQueryDto } from './dto/list-clients-query.dto';
import { FinalizeBillingInvoiceDto } from './dto/finalize-billing-invoice.dto';
import { VoidBillingEventDto } from './dto/void-billing-event.dto';
import { VoidBillingInvoiceDto } from './dto/void-billing-invoice.dto';
import { ClientsService } from './clients.service';

@ApiTags('clients-3pl')
@ApiBearerAuth()
@Controller()
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @RequirePermissions('client.read')
  @ApiOkResponse({ description: 'List 3PL clients / inventory owners.' })
  @Get('clients')
  listClients(@Query() query: ListClientsQueryDto) {
    return this.clientsService.listClients(query);
  }

  @RequirePermissions('client.manage')
  @ApiOkResponse({ description: 'Create or update a 3PL client / inventory owner.' })
  @Post('clients')
  createClient(@Body() dto: CreateClientDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.clientsService.createClient(dto, actor);
  }

  @RequireWarehousePermissions('client.read')
  @ApiOkResponse({ description: 'List active clients attached to a warehouse.' })
  @Get('warehouses/:warehouseId/clients')
  listWarehouseClients(@Param('warehouseId') warehouseId: string) {
    return this.clientsService.listWarehouseClients(warehouseId);
  }

  @RequireWarehousePermissions('client.manage')
  @ApiOkResponse({ description: 'Attach or update a client in a warehouse.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/attach')
  attachWarehouse(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: AttachClientWarehouseDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.attachWarehouse(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('client.manage')
  @ApiOkResponse({ description: 'Create/update a client-specific SKU alias.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/sku-aliases')
  createSkuAlias(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: CreateClientSkuAliasDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.createSkuAlias(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'List client rate cards / contractual billing rates.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/rate-cards')
  listRateCards(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
  ) {
    return this.clientsService.listRateCards(warehouseId, clientReference);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Create a client rate card with event-type rates.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/rate-cards')
  createRateCard(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: CreateClientRateCardDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.createRateCard(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('client.manage')
  @ApiOkResponse({ description: 'Grant a user access to a specific 3PL client in this warehouse.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/user-access')
  grantUserClientAccess(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: GrantUserClientAccessDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.grantUserClientAccess(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('client.manage')
  @ApiOkResponse({ description: 'Link an existing operational resource to a client owner.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/resource-links')
  linkResource(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: LinkClientResourceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.linkResource(warehouseId, clientReference, dto, actor);
  }


  @RequireWarehousePermissions('client.read')
  @ApiOkResponse({ description: 'List resource ownership links for a 3PL client.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/resource-links')
  listResourceLinks(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Query('resourceType') resourceType?: string,
  ) {
    return this.clientsService.listResourceLinks(warehouseId, clientReference, resourceType);
  }

  @RequireWarehousePermissions('client.read')
  @ApiOkResponse({ description: 'Summarize resource ownership links for a 3PL client.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/ownership/snapshot')
  getOwnershipSnapshot(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
  ) {
    return this.clientsService.getOwnershipSnapshot(warehouseId, clientReference);
  }

  @RequireWarehousePermissions('client.read')
  @ApiOkResponse({ description: 'Check warehouse-wide 3PL ownership link integrity.' })
  @Get('warehouses/:warehouseId/ownership/integrity')
  checkOwnershipIntegrity(@Param('warehouseId') warehouseId: string) {
    return this.clientsService.checkOwnershipIntegrity(warehouseId);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Generate storage-day billing events from client-owned stock quants.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-events/storage-days/generate')
  generateStorageDayBilling(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: GenerateStorageBillingDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.generateStorageDayBilling(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'List client billing invoices.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-invoices')
  listBillingInvoices(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Query() query: ListBillingInvoicesQueryDto,
  ) {
    return this.clientsService.listBillingInvoices(warehouseId, clientReference, query);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Create a draft or finalized client invoice from billable events.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-invoices')
  createBillingInvoice(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: CreateBillingInvoiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.createBillingInvoice(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'Get a client billing invoice with lines.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-invoices/:invoiceReference')
  getBillingInvoice(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('invoiceReference') invoiceReference: string,
  ) {
    return this.clientsService.getBillingInvoice(warehouseId, clientReference, invoiceReference);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'Export a client billing invoice as CSV text.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-invoices/:invoiceReference/export')
  exportBillingInvoice(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('invoiceReference') invoiceReference: string,
  ) {
    return this.clientsService.exportBillingInvoice(warehouseId, clientReference, invoiceReference);
  }


  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'Export a client billing invoice as compact PDF base64.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-invoices/:invoiceReference/export.pdf')
  exportBillingInvoicePdf(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('invoiceReference') invoiceReference: string,
  ) {
    return this.clientsService.exportBillingInvoicePdf(warehouseId, clientReference, invoiceReference);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'List accounting credit notes for a client.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-credit-notes')
  listBillingCreditNotes(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Query() query: ListBillingCreditNotesQueryDto,
  ) {
    return this.clientsService.listBillingCreditNotes(warehouseId, clientReference, query);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Create an accounting credit note from a finalized invoice without releasing invoice events.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-invoices/:invoiceReference/credit-notes')
  createBillingCreditNote(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('invoiceReference') invoiceReference: string,
    @Body() dto: CreateBillingCreditNoteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.createBillingCreditNote(warehouseId, clientReference, invoiceReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'Get an accounting credit note with lines.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-credit-notes/:creditNoteReference')
  getBillingCreditNote(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('creditNoteReference') creditNoteReference: string,
  ) {
    return this.clientsService.getBillingCreditNote(warehouseId, clientReference, creditNoteReference);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'Export an accounting credit note as CSV text.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-credit-notes/:creditNoteReference/export')
  exportBillingCreditNote(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('creditNoteReference') creditNoteReference: string,
  ) {
    return this.clientsService.exportBillingCreditNote(warehouseId, clientReference, creditNoteReference);
  }


  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'Export an accounting credit note as compact PDF base64.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-credit-notes/:creditNoteReference/export.pdf')
  exportBillingCreditNotePdf(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('creditNoteReference') creditNoteReference: string,
  ) {
    return this.clientsService.exportBillingCreditNotePdf(warehouseId, clientReference, creditNoteReference);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Finalize a draft accounting credit note.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-credit-notes/:creditNoteReference/finalize')
  finalizeBillingCreditNote(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('creditNoteReference') creditNoteReference: string,
    @Body() dto: FinalizeBillingCreditNoteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.finalizeBillingCreditNote(warehouseId, clientReference, creditNoteReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Finalize a draft client billing invoice and mark its events invoiced.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-invoices/:invoiceReference/finalize')
  finalizeBillingInvoice(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('invoiceReference') invoiceReference: string,
    @Body() dto: FinalizeBillingInvoiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.finalizeBillingInvoice(warehouseId, clientReference, invoiceReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Void a client billing invoice and return invoiced events to billable.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-invoices/:invoiceReference/void')
  voidBillingInvoice(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Param('invoiceReference') invoiceReference: string,
    @Body() dto: VoidBillingInvoiceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.voidBillingInvoice(warehouseId, clientReference, invoiceReference, dto, actor);
  }


  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'List client billing ledger events.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-events')
  listBillingEvents(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Query() query: ListBillingEventsQueryDto,
  ) {
    return this.clientsService.listBillingEvents(warehouseId, clientReference, query);
  }

  @RequireWarehousePermissions('billing.read')
  @ApiOkResponse({ description: 'Summarize client billing ledger events by status and event type.' })
  @Get('warehouses/:warehouseId/clients/:clientReference/billing-summary')
  getBillingSummary(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Query() query: ListBillingEventsQueryDto,
  ) {
    return this.clientsService.getBillingSummary(warehouseId, clientReference, query);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Create or update a client billing ledger event.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-events')
  createBillingEvent(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: CreateBillingEventDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.createBillingEvent(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Generate billing events from operational counters.' })
  @Post('warehouses/:warehouseId/clients/:clientReference/billing-events/generate')
  generateBillingEvents(
    @Param('warehouseId') warehouseId: string,
    @Param('clientReference') clientReference: string,
    @Body() dto: GenerateBillingEventsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.generateBillingEvents(warehouseId, clientReference, dto, actor);
  }

  @RequireWarehousePermissions('billing.manage')
  @ApiOkResponse({ description: 'Void a pending/billable billing event.' })
  @Post('warehouses/:warehouseId/billing-events/:eventReference/void')
  voidBillingEvent(
    @Param('warehouseId') warehouseId: string,
    @Param('eventReference') eventReference: string,
    @Body() dto: VoidBillingEventDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.clientsService.voidBillingEvent(warehouseId, eventReference, dto, actor);
  }
}
