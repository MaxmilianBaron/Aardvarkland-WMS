import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { makePageEnvelope, normalizeOffsetPagination, PageEnvelope } from '../common';
import { PrismaService, withTransactionRetry } from '../database';
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
import {
  BillingCreditNoteLineDraft,
  BillingCreditNoteStatus,
  BillingInvoiceStatus,
  buildCreditNoteLines,
  buildInvoiceLines,
  buildInvoiceVoidReinvoicePlan,
  buildStorageDayBillingEvents,
  exportCreditNoteCsv,
  exportInvoiceCsv,
  invoiceEventStatusFilter,
  makeCreditNoteNumber,
  makeSequentialInvoiceNumber,
  normalizeBillingPeriod,
  summarizeCreditNoteLines,
  summarizeInvoiceLines,
} from './billing-invoice.helpers';
import { buildBillingPdfBase64 } from './billing-pdf.helpers';
import { OwnerScopeService } from './owner-scope.service';
import { evaluateOwnershipIntegrity, OwnershipIntegritySummary } from './ownership-integrity.helpers';
import {
  buildBillingEventsFromCounters,
  normalizeBillingEventInput,
  normalizeBillingStatus,
  normalizeBillingEventType,
  normalizeClientCode,
  normalizeCurrency,
  normalizeOptionalResourceCode,
  summarizeBillingEvents,
} from './clients.helpers';
import {
  BillingEventResponse,
  BillingEventStatus,
  BillingEventType,
  BillingCreditNoteExportResponse,
  BillingCreditNotePdfExportResponse,
  BillingCreditNoteLineResponse,
  BillingCreditNoteResponse,
  BillingInvoiceExportResponse,
  BillingInvoicePdfExportResponse,
  BillingInvoiceLineResponse,
  BillingInvoiceResponse,
  BillingSummaryResponse,
  ClientRateCardResponse,
  ClientRateResponse,
  ClientResourceLinkResponse,
  ClientSkuAliasResponse,
  ClientWarehouseResponse,
  GenerateBillingEventsResponse,
  WmsClientResponse,
  UserClientAccessResponse,
  WmsClientStatus,
} from './clients.types';

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async listClients(query: ListClientsQueryDto = {}): Promise<WmsClientResponse[]> {
    const search = query.search?.trim();
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });
    const clients = await this.client.wmsClient.findMany({
      where: compactRecord({
        status: query.status,
        ...(search
          ? {
              OR: [
                { code: { contains: normalizeClientCode(search), mode: 'insensitive' } },
                { name: { contains: search, mode: 'insensitive' } },
                { externalReference: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      }),
      orderBy: [{ status: 'asc' }, { code: 'asc' }],
      take: page.take,
      skip: page.skip,
    });
    return clients.map(toClientResponse);
  }

  async createClient(dto: CreateClientDto, actor: AuthenticatedUser): Promise<WmsClientResponse> {
    const code = normalizeClientCode(dto.code);
    if (!code) throw new ConflictException('Client code is required.');

    const client = await this.client.wmsClient.upsert({
      where: { code },
      update: {
        name: dto.name.trim(),
        status: dto.status ?? WmsClientStatus.ACTIVE,
        billingCurrency: normalizeCurrency(dto.billingCurrency),
        externalReference: normalizeOptionalString(dto.externalReference),
        metadata: dto.metadata ?? null,
      },
      create: {
        code,
        name: dto.name.trim(),
        status: dto.status ?? WmsClientStatus.ACTIVE,
        billingCurrency: normalizeCurrency(dto.billingCurrency),
        externalReference: normalizeOptionalString(dto.externalReference),
        metadata: dto.metadata ?? null,
      },
    });

    await this.writeAudit(actor.id, null, 'client.upserted', 'wms_client', client.id, { code });
    await this.writeOutbox('CLIENT_UPSERTED', 'wms_client', client.id, { clientId: client.id, code });
    return toClientResponse(client);
  }

  async listWarehouseClients(warehouseReference: string): Promise<WmsClientResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const links = await this.client.clientWarehouse.findMany({
      where: { warehouseId: warehouse.id, isActive: true },
      include: { client: true },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((link) => toClientResponse(link.client));
  }

  async attachWarehouse(
    warehouseReference: string,
    clientReference: string,
    dto: AttachClientWarehouseDto,
    actor: AuthenticatedUser,
  ): Promise<ClientWarehouseResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const link = await this.client.clientWarehouse.upsert({
      where: { clientId_warehouseId: { clientId: client.id, warehouseId: warehouse.id } },
      update: {
        isActive: dto.isActive ?? true,
        defaultBillingProfile: normalizeOptionalString(dto.defaultBillingProfile),
        externalReference: normalizeOptionalString(dto.externalReference),
        metadata: dto.metadata ?? null,
      },
      create: {
        clientId: client.id,
        warehouseId: warehouse.id,
        isActive: dto.isActive ?? true,
        defaultBillingProfile: normalizeOptionalString(dto.defaultBillingProfile),
        externalReference: normalizeOptionalString(dto.externalReference),
        metadata: dto.metadata ?? null,
      },
    });

    await this.writeAudit(actor.id, warehouse.id, 'client.warehouse_attached', 'wms_client', client.id, {
      clientCode: client.code,
      warehouseCode: warehouse.code,
    });
    await this.writeOutbox('CLIENT_WAREHOUSE_ATTACHED', 'wms_client', client.id, {
      clientId: client.id,
      warehouseId: warehouse.id,
    });
    return toClientWarehouseResponse(link);
  }

  async createSkuAlias(
    warehouseReference: string,
    clientReference: string,
    dto: CreateClientSkuAliasDto,
    actor: AuthenticatedUser,
  ): Promise<ClientSkuAliasResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const sku = dto.skuReference ? await this.resolveSku(dto.skuReference) : null;
    const clientSku = dto.clientSku.trim().toUpperCase();

    const alias = await this.client.clientSkuAlias.upsert({
      where: { clientId_clientSku: { clientId: client.id, clientSku } },
      update: {
        warehouseId: warehouse.id,
        skuId: sku?.id ?? null,
        clientBarcode: normalizeOptionalString(dto.clientBarcode),
        description: normalizeOptionalString(dto.description),
        metadata: dto.metadata ?? null,
      },
      create: {
        clientId: client.id,
        warehouseId: warehouse.id,
        skuId: sku?.id ?? null,
        clientSku,
        clientBarcode: normalizeOptionalString(dto.clientBarcode),
        description: normalizeOptionalString(dto.description),
        metadata: dto.metadata ?? null,
      },
    });

    await this.writeAudit(actor.id, warehouse.id, 'client.sku_alias_upserted', 'client_sku_alias', alias.id, {
      clientCode: client.code,
      clientSku,
      skuId: sku?.id ?? null,
    });
    return toClientSkuAliasResponse(alias);
  }

  async listRateCards(
    warehouseReference: string,
    clientReference: string,
  ): Promise<ClientRateCardResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const cards = await this.client.clientRateCard.findMany({
      where: { warehouseId: warehouse.id, clientId: client.id },
      include: { rates: { orderBy: [{ eventType: 'asc' }, { unit: 'asc' }] } },
      orderBy: [{ isActive: 'desc' }, { validFrom: 'desc' }, { name: 'asc' }],
    });
    return cards.map(toRateCardResponse);
  }

  async createRateCard(
    warehouseReference: string,
    clientReference: string,
    dto: CreateClientRateCardDto,
    actor: AuthenticatedUser,
  ): Promise<ClientRateCardResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const validFrom = new Date(dto.validFrom);
    const validTo = dto.validTo ? new Date(dto.validTo) : null;
    if (Number.isNaN(validFrom.getTime()) || (validTo && Number.isNaN(validTo.getTime()))) {
      throw new ConflictException('Rate card validity dates must be valid dates.');
    }
    if (validTo && validTo <= validFrom) {
      throw new ConflictException('validTo must be after validFrom.');
    }
    if (!dto.rates?.length) {
      throw new ConflictException('Rate card must contain at least one rate.');
    }

    const card = await this.transaction(async (tx) => {
      const created = await tx.clientRateCard.create({
        data: {
          warehouseId: warehouse.id,
          clientId: client.id,
          name: dto.name.trim(),
          currency: normalizeCurrency(dto.currency, client.billingCurrency),
          validFrom,
          validTo,
          isActive: dto.isActive ?? true,
          metadata: dto.metadata ?? null,
          rates: {
            create: dto.rates.map((rate) => ({
              eventType: normalizeBillingEventType(rate.eventType),
              unit: normalizeOptionalResourceCode(rate.unit ?? 'EA') ?? 'EA',
              unitPriceMinor: Math.max(0, Math.trunc(rate.unitPriceMinor)),
              minChargeMinor: rate.minChargeMinor === undefined ? null : Math.max(0, Math.trunc(rate.minChargeMinor)),
              vatRateBps: rate.vatRateBps === undefined ? null : Math.min(10_000, Math.max(0, Math.trunc(rate.vatRateBps))),
              metadata: rate.metadata ?? null,
            })),
          },
        },
        include: { rates: { orderBy: [{ eventType: 'asc' }, { unit: 'asc' }] } },
      });
      await tx.auditLog.create({ data: { actorUserId: actor.id, warehouseId: warehouse.id, action: 'client.rate_card_created', resourceType: 'client_rate_card', resourceId: created.id, metadata: { clientCode: client.code, rateCount: dto.rates.length } } });
      await tx.outboxEvent.create({ data: { type: 'CLIENT_RATE_CARD_CREATED', aggregateType: 'client_rate_card', aggregateId: created.id, payload: { warehouseId: warehouse.id, clientId: client.id, rateCount: dto.rates.length }, status: 'PENDING', availableAt: new Date() } });
      return created;
    });
    return toRateCardResponse(card);
  }

  async grantUserClientAccess(
    warehouseReference: string,
    clientReference: string,
    dto: GrantUserClientAccessDto,
    actor: AuthenticatedUser,
  ): Promise<UserClientAccessResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const userReference = dto.userReference?.trim() || actor.id;
    const user = await this.client.user.findFirst({
      where: isUuid(userReference) ? { OR: [{ id: userReference }, { email: userReference.toLowerCase() }] } : { email: userReference.toLowerCase() },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User was not found.');

    const access = await this.client.userClientAccess.upsert({
      where: { userId_clientId_warehouseId: { userId: user.id, clientId: client.id, warehouseId: warehouse.id } },
      update: { isActive: dto.isActive ?? true, metadata: dto.metadata ?? null },
      create: { userId: user.id, clientId: client.id, warehouseId: warehouse.id, isActive: dto.isActive ?? true, metadata: dto.metadata ?? null },
    });
    await this.writeAudit(actor.id, warehouse.id, 'client.user_access_granted', 'user_client_access', access.id, { userId: user.id, userEmail: user.email, clientCode: client.code });
    await this.writeOutbox('CLIENT_USER_ACCESS_GRANTED', 'user_client_access', access.id, { warehouseId: warehouse.id, clientId: client.id, userId: user.id });
    return toUserClientAccessResponse(access);
  }

  async linkResource(
    warehouseReference: string,
    clientReference: string,
    dto: LinkClientResourceDto,
    actor: AuthenticatedUser,
  ): Promise<ClientResourceLinkResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const resourceType = normalizeOptionalResourceCode(dto.resourceType);
    if (!resourceType) throw new ConflictException('Resource type is required.');
    const resourceId = dto.resourceId.trim();

    const link = await this.ownerScope.linkResourceToClient({
      warehouseId: warehouse.id,
      clientReference: client.code,
      resourceType,
      resourceId,
      externalReference: dto.externalReference,
      metadata: dto.metadata ?? null,
      allowOwnerTransfer: dto.allowOwnerTransfer === true,
    });

    if (!link) throw new ConflictException('Resource id is required.');

    await this.writeAudit(actor.id, warehouse.id, 'client.resource_linked', 'client_resource_link', link.id, {
      clientCode: client.code,
      resourceType,
      resourceId,
      allowOwnerTransfer: dto.allowOwnerTransfer === true,
    });
    return toClientResourceLinkResponse(link);
  }

  async listBillingEvents(
    warehouseReference: string,
    clientReference: string,
    query: ListBillingEventsQueryDto = {},
  ): Promise<PageEnvelope<BillingEventResponse>> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 500 });
    const where = compactRecord({
      warehouseId: warehouse.id,
      clientId: client.id,
      status: query.status ? normalizeBillingStatus(query.status) : undefined,
      eventType: query.eventType ? normalizeBillingEventType(query.eventType) : undefined,
      resourceType: query.resourceType ? normalizeOptionalResourceCode(query.resourceType) : undefined,
      occurredAt: compactRecord({
        gte: query.occurredFrom ? new Date(query.occurredFrom) : undefined,
        lte: query.occurredTo ? new Date(query.occurredTo) : undefined,
      }),
    });
    const [events, total] = await Promise.all([
      this.client.billingEvent.findMany({
        where,
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
        take: pagination.take,
        skip: pagination.skip,
      }),
      this.client.billingEvent.count({ where }),
    ]);
    return makePageEnvelope({ items: events.map(toBillingEventResponse), take: pagination.take, skip: pagination.skip, total });
  }

  async createBillingEvent(
    warehouseReference: string,
    clientReference: string,
    dto: CreateBillingEventDto,
    actor: AuthenticatedUser,
  ): Promise<BillingEventResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const normalized = normalizeBillingEventInput(client.code, warehouse.id, client.billingCurrency, dto);
    const event = await this.client.billingEvent.upsert({
      where: { clientId_reference: { clientId: client.id, reference: normalized.reference } },
      update: {
        eventType: normalized.eventType,
        status: dto.status ?? BillingEventStatus.PENDING,
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        description: normalized.description,
        quantity: normalized.quantity,
        unitPriceMinor: normalized.unitPriceMinor,
        amountMinor: normalized.amountMinor,
        currency: normalized.currency,
        occurredAt: normalized.occurredAt,
        metadata: normalized.metadata,
      },
      create: {
        clientId: client.id,
        warehouseId: warehouse.id,
        eventType: normalized.eventType,
        status: dto.status ?? BillingEventStatus.PENDING,
        reference: normalized.reference,
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
        description: normalized.description,
        quantity: normalized.quantity,
        unitPriceMinor: normalized.unitPriceMinor,
        amountMinor: normalized.amountMinor,
        currency: normalized.currency,
        occurredAt: normalized.occurredAt,
        metadata: normalized.metadata,
      },
    });

    await this.writeAudit(actor.id, warehouse.id, 'billing.event_upserted', 'billing_event', event.id, {
      clientCode: client.code,
      eventType: event.eventType,
      reference: event.reference,
      amountMinor: event.amountMinor,
    });
    await this.writeOutbox('BILLING_EVENT_UPSERTED', 'billing_event', event.id, {
      warehouseId: warehouse.id,
      clientId: client.id,
      reference: event.reference,
      eventType: event.eventType,
      amountMinor: event.amountMinor,
    });
    return toBillingEventResponse(event);
  }

  async generateBillingEvents(
    warehouseReference: string,
    clientReference: string,
    dto: GenerateBillingEventsDto,
    actor: AuthenticatedUser,
  ): Promise<GenerateBillingEventsResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const normalizedEvents = buildBillingEventsFromCounters({
      clientCode: client.code,
      warehouseId: warehouse.id,
      currency: normalizeCurrency(dto.currency, client.billingCurrency),
      occurredAt: dto.occurredAt ?? null,
      counters: dto.counters,
    });

    if (dto.dryRun) {
      return {
        created: 0,
        skippedZeroQuantity: dto.counters.length - normalizedEvents.length,
        events: normalizedEvents.map((event, index): BillingEventResponse => ({
          id: `dry-run-${index + 1}`,
          clientId: client.id,
          warehouseId: warehouse.id,
          eventType: String(event.eventType),
          status: BillingEventStatus.PENDING,
          reference: event.reference ?? `DRY-RUN-${index + 1}`,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          description: event.description,
          quantity: event.quantity ?? 0,
          unitPriceMinor: event.unitPriceMinor ?? 0,
          amountMinor: event.amountMinor ?? 0,
          currency: event.currency ?? client.billingCurrency,
          occurredAt: event.occurredAt ?? new Date(),
          invoicedAt: null,
          voidedAt: null,
          metadata: event.metadata,
        })),
      };
    }

    const events = await this.transaction(async (tx) => {
      const created: BillingEventRecord[] = [];
      for (const normalized of normalizedEvents) {
        const event = await tx.billingEvent.upsert({
          where: { clientId_reference: { clientId: client.id, reference: normalized.reference } },
          update: {
            eventType: normalized.eventType,
            quantity: normalized.quantity,
            unitPriceMinor: normalized.unitPriceMinor,
            amountMinor: normalized.amountMinor,
            currency: normalized.currency,
            description: normalized.description,
            resourceType: normalized.resourceType,
            resourceId: normalized.resourceId,
            occurredAt: normalized.occurredAt,
            metadata: normalized.metadata,
          },
          create: {
            clientId: client.id,
            warehouseId: warehouse.id,
            eventType: normalized.eventType,
            status: BillingEventStatus.PENDING,
            reference: normalized.reference,
            resourceType: normalized.resourceType,
            resourceId: normalized.resourceId,
            description: normalized.description,
            quantity: normalized.quantity,
            unitPriceMinor: normalized.unitPriceMinor,
            amountMinor: normalized.amountMinor,
            currency: normalized.currency,
            occurredAt: normalized.occurredAt,
            metadata: normalized.metadata,
          },
        });
        created.push(event);
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'billing.events_generated',
          resourceType: 'wms_client',
          resourceId: client.id,
          metadata: { clientCode: client.code, created: created.length },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'BILLING_EVENTS_GENERATED',
          aggregateType: 'wms_client',
          aggregateId: client.id,
          payload: { warehouseId: warehouse.id, clientId: client.id, created: created.length },
          status: 'PENDING',
          availableAt: new Date(),
        },
      });
      return created;
    });

    return {
      created: events.length,
      skippedZeroQuantity: dto.counters.length - normalizedEvents.length,
      events: events.map(toBillingEventResponse),
    };
  }

  async voidBillingEvent(
    warehouseReference: string,
    eventReference: string,
    dto: VoidBillingEventDto,
    actor: AuthenticatedUser,
  ): Promise<BillingEventResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const event = await this.client.billingEvent.findFirst({
      where: { warehouseId: warehouse.id, OR: [{ id: eventReference }, { reference: eventReference }] },
    });
    if (!event) throw new NotFoundException('Billing event was not found.');
    if (event.status === BillingEventStatus.INVOICED) throw new ConflictException('Invoiced billing events cannot be voided.');

    const updated = await this.client.billingEvent.update({
      where: { id: event.id },
      data: {
        status: BillingEventStatus.VOIDED,
        voidedAt: new Date(),
        metadata: { ...toRecord(event.metadata), voidReason: dto.reason ?? null, voidMetadata: dto.metadata ?? null },
      },
    });
    await this.writeAudit(actor.id, warehouse.id, 'billing.event_voided', 'billing_event', event.id, {
      reason: dto.reason ?? null,
      reference: event.reference,
    });
    await this.writeOutbox('BILLING_EVENT_VOIDED', 'billing_event', event.id, {
      warehouseId: warehouse.id,
      clientId: event.clientId,
      reference: event.reference,
    });
    return toBillingEventResponse(updated);
  }

  async listResourceLinks(
    warehouseReference: string,
    clientReference: string,
    resourceType?: string,
  ): Promise<ClientResourceLinkResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const links = await this.client.clientResourceLink.findMany({
      where: compactRecord({
        warehouseId: warehouse.id,
        clientId: client.id,
        resourceType: resourceType ? normalizeOptionalResourceCode(resourceType) : undefined,
      }),
      orderBy: [{ resourceType: 'asc' }, { createdAt: 'desc' }],
    });
    return links.map(toClientResourceLinkResponse);
  }

  async getOwnershipSnapshot(
    warehouseReference: string,
    clientReference: string,
  ): Promise<{ clientId: string; warehouseId: string; resourceCounts: Array<{ resourceType: string; count: number }> }> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const links = await this.client.clientResourceLink.findMany({
      where: { warehouseId: warehouse.id, clientId: client.id },
      orderBy: [{ resourceType: 'asc' }],
    });
    const counts = new Map<string, number>();
    for (const link of links) counts.set(link.resourceType, (counts.get(link.resourceType) ?? 0) + 1);
    return {
      clientId: client.id,
      warehouseId: warehouse.id,
      resourceCounts: Array.from(counts.entries()).map(([resourceType, count]) => ({ resourceType, count })),
    };
  }

  async checkOwnershipIntegrity(
    warehouseReference: string,
  ): Promise<OwnershipIntegritySummary & { warehouseId: string; checkedAt: string }> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const links = await this.client.clientResourceLink.findMany({
      where: { warehouseId: warehouse.id },
      orderBy: [{ resourceType: 'asc' }, { resourceId: 'asc' }, { createdAt: 'asc' }],
    });
    const summary = evaluateOwnershipIntegrity(
      links.map((link) => ({
        id: link.id,
        clientId: link.clientId,
        warehouseId: link.warehouseId,
        resourceType: link.resourceType,
        resourceId: link.resourceId,
        metadata: link.metadata,
      })),
    );
    return { warehouseId: warehouse.id, checkedAt: new Date().toISOString(), ...summary };
  }

  async generateStorageDayBilling(
    warehouseReference: string,
    clientReference: string,
    dto: GenerateStorageBillingDto,
    actor: AuthenticatedUser,
  ): Promise<GenerateBillingEventsResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const period = normalizeBillingPeriod({ periodStart: dto.periodStart, periodEnd: dto.periodEnd });
    const stockLinks = await this.client.clientResourceLink.findMany({
      where: { warehouseId: warehouse.id, clientId: client.id, resourceType: 'STOCK_QUANT' },
      orderBy: [{ createdAt: 'asc' }],
    });
    const stockQuantIds = Array.from(new Set(stockLinks.map((link) => link.resourceId)));
    if (stockQuantIds.length === 0) return { created: 0, skippedZeroQuantity: 0, events: [] };

    const quants = await this.client.stockQuant.findMany({
      where: { warehouseId: warehouse.id, id: { in: stockQuantIds }, quantity: { gt: 0 } },
      include: { sku: true, location: true },
      orderBy: [{ createdAt: 'asc' }],
    });
    const activeStorageRate = dto.unitPriceMinorPerUnitDay === undefined
      ? await this.resolveActiveClientRate(warehouse.id, client.id, 'STORAGE_DAY', period.periodStart)
      : null;
    const unitPriceMinorPerUnitDay = dto.unitPriceMinorPerUnitDay ?? activeStorageRate?.unitPriceMinor;
    if (unitPriceMinorPerUnitDay === undefined) {
      throw new ConflictException('unitPriceMinorPerUnitDay is required when no active STORAGE_DAY rate card exists.');
    }
    const drafts = buildStorageDayBillingEvents({
      clientCode: client.code,
      warehouseId: warehouse.id,
      currency: normalizeCurrency(dto.currency, activeStorageRate?.currency ?? client.billingCurrency),
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      unitPriceMinorPerUnitDay,
      snapshots: quants.map((quant) => ({
        stockQuantId: quant.id,
        skuCode: quant.sku?.code ?? quant.skuId,
        locationCode: quant.location?.code ?? null,
        quantity: quant.quantity,
        ownedFrom: quant.createdAt,
      })),
    });

    if (dto.dryRun) {
      return {
        created: 0,
        skippedZeroQuantity: quants.length - drafts.length,
        events: drafts.map((event, index): BillingEventResponse => ({
          id: `dry-run-storage-${index + 1}`,
          clientId: client.id,
          warehouseId: warehouse.id,
          eventType: event.eventType,
          status: BillingEventStatus.BILLABLE,
          reference: event.reference,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          description: event.description,
          quantity: event.quantity,
          unitPriceMinor: event.unitPriceMinor,
          amountMinor: event.amountMinor,
          currency: event.currency,
          occurredAt: event.occurredAt,
          invoicedAt: null,
          voidedAt: null,
          metadata: event.metadata,
        })),
      };
    }

    const events = await this.transaction(async (tx) => {
      const created: BillingEventRecord[] = [];
      for (const draft of drafts) {
        const event = await tx.billingEvent.upsert({
          where: { clientId_reference: { clientId: client.id, reference: draft.reference } },
          update: {
            status: BillingEventStatus.BILLABLE,
            quantity: draft.quantity,
            unitPriceMinor: draft.unitPriceMinor,
            amountMinor: draft.amountMinor,
            currency: draft.currency,
            description: draft.description,
            occurredAt: draft.occurredAt,
            metadata: draft.metadata,
          },
          create: {
            clientId: client.id,
            warehouseId: warehouse.id,
            eventType: BillingEventType.STORAGE_DAY,
            status: BillingEventStatus.BILLABLE,
            reference: draft.reference,
            resourceType: draft.resourceType,
            resourceId: draft.resourceId,
            description: draft.description,
            quantity: draft.quantity,
            unitPriceMinor: draft.unitPriceMinor,
            amountMinor: draft.amountMinor,
            currency: draft.currency,
            occurredAt: draft.occurredAt,
            metadata: draft.metadata,
          },
        });
        created.push(event);
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: 'billing.storage_days_generated',
          resourceType: 'wms_client',
          resourceId: client.id,
          metadata: { created: created.length, periodStart: period.periodStart, periodEnd: period.periodEnd },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'STORAGE_DAY_BILLING_GENERATED',
          aggregateType: 'wms_client',
          aggregateId: client.id,
          payload: { warehouseId: warehouse.id, clientId: client.id, created: created.length },
          status: 'PENDING',
          availableAt: new Date(),
        },
      });
      return created;
    });

    return { created: events.length, skippedZeroQuantity: quants.length - drafts.length, events: events.map(toBillingEventResponse) };
  }

  async listBillingInvoices(
    warehouseReference: string,
    clientReference: string,
    query: ListBillingInvoicesQueryDto = {},
  ): Promise<PageEnvelope<BillingInvoiceResponse>> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 500 });
    const where = compactRecord({
      warehouseId: warehouse.id,
      clientId: client.id,
      status: query.status,
      periodStart: query.periodStart ? { gte: new Date(query.periodStart) } : undefined,
      periodEnd: query.periodEnd ? { lte: new Date(query.periodEnd) } : undefined,
    });
    const [invoices, total] = await Promise.all([
      this.client.billingInvoice.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }],
        take: pagination.take,
        skip: pagination.skip,
      }),
      this.client.billingInvoice.count({ where }),
    ]);
    return makePageEnvelope({ items: invoices.map(toBillingInvoiceResponse), take: pagination.take, skip: pagination.skip, total });
  }

  async createBillingInvoice(
    warehouseReference: string,
    clientReference: string,
    dto: CreateBillingInvoiceDto,
    actor: AuthenticatedUser,
  ): Promise<BillingInvoiceResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const period = normalizeBillingPeriod({ periodStart: dto.periodStart, periodEnd: dto.periodEnd });
    const eventStatuses = invoiceEventStatusFilter(dto.eventStatuses);
    const events = await this.client.billingEvent.findMany({
      where: {
        warehouseId: warehouse.id,
        clientId: client.id,
        status: { in: eventStatuses },
        occurredAt: { gte: period.periodStart, lt: period.periodEnd },
        invoiceLine: null,
      },
      orderBy: [{ occurredAt: 'asc' }, { reference: 'asc' }],
    });
    if (events.length === 0) throw new ConflictException('No billable events were found for this invoice period.');

    const lines = buildInvoiceLines(events.map((event) => ({ ...event, vatRateBps: dto.vatRateBps ?? null })));
    const summary = summarizeInvoiceLines(lines);
    const requestedInvoiceNumber = dto.invoiceNumber?.trim().toUpperCase() || null;
    const now = new Date();
    const invoice = await this.transaction(async (tx) => {
      const invoiceNumber = requestedInvoiceNumber ?? (await this.allocateInvoiceNumber(tx, warehouse.id, client.id, client.code, period.periodStart));
      const created = await tx.billingInvoice.create({
        data: {
          clientId: client.id,
          warehouseId: warehouse.id,
          invoiceNumber,
          status: dto.finalize ? BillingInvoiceStatus.FINALIZED : BillingInvoiceStatus.DRAFT,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
          currency: summary.currency,
          subtotalMinor: summary.subtotalMinor,
          taxTotalMinor: summary.taxTotalMinor,
          totalAmountMinor: summary.totalAmountMinor,
          finalizedAt: dto.finalize ? now : null,
          metadata: dto.metadata ?? null,
          lines: {
            create: lines.map((line) => ({
              billingEventId: line.billingEventId,
              lineNumber: line.lineNumber,
              eventType: line.eventType,
              description: line.description,
              quantity: line.quantity,
              amountMinor: line.amountMinor,
              vatRateBps: line.vatRateBps,
              netAmountMinor: line.netAmountMinor,
              taxAmountMinor: line.taxAmountMinor,
              grossAmountMinor: line.grossAmountMinor,
              currency: line.currency,
              metadata: line.metadata,
            })),
          },
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } }, _count: { select: { lines: true } } },
      });
      if (dto.finalize) {
        await tx.billingEvent.updateMany({
          where: { id: { in: events.map((event) => event.id) } },
          data: { status: BillingEventStatus.INVOICED, invoicedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: dto.finalize ? 'billing.invoice_created_finalized' : 'billing.invoice_created',
          resourceType: 'billing_invoice',
          resourceId: created.id,
          metadata: { invoiceNumber, lineCount: lines.length, totalAmountMinor: summary.totalAmountMinor },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: dto.finalize ? 'BILLING_INVOICE_FINALIZED' : 'BILLING_INVOICE_CREATED',
          aggregateType: 'billing_invoice',
          aggregateId: created.id,
          payload: { warehouseId: warehouse.id, clientId: client.id, invoiceNumber },
          status: 'PENDING',
          availableAt: new Date(),
        },
      });
      return created;
    });
    return toBillingInvoiceResponse(invoice);
  }

  async getBillingInvoice(
    warehouseReference: string,
    clientReference: string,
    invoiceReference: string,
  ): Promise<BillingInvoiceResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const invoice = await this.resolveInvoice(warehouse.id, client.id, invoiceReference);
    return toBillingInvoiceResponse(invoice);
  }

  async finalizeBillingInvoice(
    warehouseReference: string,
    clientReference: string,
    invoiceReference: string,
    dto: FinalizeBillingInvoiceDto,
    actor: AuthenticatedUser,
  ): Promise<BillingInvoiceResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const invoice = await this.resolveInvoice(warehouse.id, client.id, invoiceReference);
    if (invoice.status !== BillingInvoiceStatus.DRAFT) throw new ConflictException('Only draft invoices can be finalized.');
    const voidPlan = buildInvoiceVoidReinvoicePlan(invoice.lines ?? []);
    const eventIds = voidPlan.billingEventIds;
    const now = new Date();
    const updated = await this.transaction(async (tx) => {
      const result = await tx.billingInvoice.update({
        where: { id: invoice.id },
        data: { status: BillingInvoiceStatus.FINALIZED, finalizedAt: now, metadata: mergeMetadata(invoice.metadata, dto.metadata ?? {}) },
        include: { lines: { orderBy: { lineNumber: 'asc' } }, _count: { select: { lines: true } } },
      });
      if (eventIds.length) {
        await tx.billingEvent.updateMany({ where: { id: { in: eventIds } }, data: { status: BillingEventStatus.INVOICED, invoicedAt: now } });
      }
      await tx.auditLog.create({ data: { actorUserId: actor.id, warehouseId: warehouse.id, action: 'billing.invoice_finalized', resourceType: 'billing_invoice', resourceId: invoice.id, metadata: { invoiceNumber: invoice.invoiceNumber } } });
      await tx.outboxEvent.create({ data: { type: 'BILLING_INVOICE_FINALIZED', aggregateType: 'billing_invoice', aggregateId: invoice.id, payload: { warehouseId: warehouse.id, clientId: client.id, invoiceNumber: invoice.invoiceNumber }, status: 'PENDING', availableAt: new Date() } });
      return result;
    });
    return toBillingInvoiceResponse(updated);
  }

  async voidBillingInvoice(
    warehouseReference: string,
    clientReference: string,
    invoiceReference: string,
    dto: VoidBillingInvoiceDto,
    actor: AuthenticatedUser,
  ): Promise<BillingInvoiceResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const invoice = await this.resolveInvoice(warehouse.id, client.id, invoiceReference);
    if (invoice.status === BillingInvoiceStatus.VOIDED) return toBillingInvoiceResponse(invoice);
    const voidPlan = buildInvoiceVoidReinvoicePlan(invoice.lines ?? []);
    const eventIds = voidPlan.billingEventIds;
    const now = new Date();
    const updated = await this.transaction(async (tx) => {
      if (eventIds.length) {
        await tx.billingEvent.updateMany({
          where: { id: { in: eventIds }, status: BillingEventStatus.INVOICED },
          data: { status: BillingEventStatus.BILLABLE, invoicedAt: null },
        });
        await tx.billingInvoiceLine.updateMany({
          where: { invoiceId: invoice.id, billingEventId: { in: eventIds } },
          data: { billingEventId: null },
        });
      }
      const result = await tx.billingInvoice.update({
        where: { id: invoice.id },
        data: {
          status: BillingInvoiceStatus.VOIDED,
          voidedAt: now,
          metadata: mergeMetadata(invoice.metadata, {
            voidReason: dto.reason ?? null,
            voidMetadata: dto.metadata ?? null,
            releasedBillingEventIds: eventIds,
          }),
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } }, _count: { select: { lines: true } } },
      });
      await tx.auditLog.create({ data: { actorUserId: actor.id, warehouseId: warehouse.id, action: 'billing.invoice_voided', resourceType: 'billing_invoice', resourceId: invoice.id, metadata: { invoiceNumber: invoice.invoiceNumber, reason: dto.reason ?? null, releasedBillingEventIds: eventIds } } });
      await tx.outboxEvent.create({ data: { type: 'BILLING_INVOICE_VOIDED', aggregateType: 'billing_invoice', aggregateId: invoice.id, payload: { warehouseId: warehouse.id, clientId: client.id, invoiceNumber: invoice.invoiceNumber, releasedBillingEventIds: eventIds }, status: 'PENDING', availableAt: new Date() } });
      return result;
    });
    return toBillingInvoiceResponse(updated);
  }

  async exportBillingInvoice(
    warehouseReference: string,
    clientReference: string,
    invoiceReference: string,
  ): Promise<BillingInvoiceExportResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const invoice = await this.resolveInvoice(warehouse.id, client.id, invoiceReference);
    const csv = exportInvoiceCsv({
      invoiceNumber: invoice.invoiceNumber,
      clientCode: client.code,
      warehouseCode: warehouse.code,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      lines: (invoice.lines ?? []).map((line) => ({
        lineNumber: line.lineNumber,
        eventType: line.eventType,
        description: line.description,
        quantity: line.quantity,
        amountMinor: line.amountMinor,
        vatRateBps: line.vatRateBps ?? null,
        netAmountMinor: line.netAmountMinor ?? line.amountMinor,
        taxAmountMinor: line.taxAmountMinor ?? 0,
        grossAmountMinor: line.grossAmountMinor ?? line.amountMinor,
        currency: line.currency,
      })),
    });
    return { invoiceNumber: invoice.invoiceNumber, contentType: 'text/csv', filename: `${invoice.invoiceNumber}.csv`, csv };
  }


  async exportBillingInvoicePdf(
    warehouseReference: string,
    clientReference: string,
    invoiceReference: string,
  ): Promise<BillingInvoicePdfExportResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const invoice = await this.resolveInvoice(warehouse.id, client.id, invoiceReference);
    const pdfBase64 = buildBillingPdfBase64({
      documentType: 'INVOICE',
      documentNumber: invoice.invoiceNumber,
      clientCode: client.code,
      warehouseCode: warehouse.code,
      currency: invoice.currency,
      subtotalMinor: invoice.subtotalMinor ?? 0,
      taxTotalMinor: invoice.taxTotalMinor ?? 0,
      totalAmountMinor: invoice.totalAmountMinor ?? 0,
      periodStart: invoice.periodStart,
      periodEnd: invoice.periodEnd,
      status: invoice.status,
      lines: (invoice.lines ?? []).map((line) => ({
        lineNumber: line.lineNumber,
        eventType: line.eventType,
        description: line.description,
        quantity: line.quantity,
        netAmountMinor: line.netAmountMinor ?? line.amountMinor,
        taxAmountMinor: line.taxAmountMinor ?? 0,
        grossAmountMinor: line.grossAmountMinor ?? line.amountMinor,
        currency: line.currency,
      })),
    });
    return { invoiceNumber: invoice.invoiceNumber, contentType: 'application/pdf', filename: `${invoice.invoiceNumber}.pdf`, pdfBase64 };
  }

  async listBillingCreditNotes(
    warehouseReference: string,
    clientReference: string,
    query: ListBillingCreditNotesQueryDto = {},
  ): Promise<PageEnvelope<BillingCreditNoteResponse>> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const invoice = query.invoiceReference ? await this.resolveInvoice(warehouse.id, client.id, query.invoiceReference) : null;
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 500 });
    const where = compactRecord({
      warehouseId: warehouse.id,
      clientId: client.id,
      invoiceId: invoice?.id,
      status: query.status,
    });
    const [creditNotes, total] = await Promise.all([
      this.client.billingCreditNote.findMany({
        where,
        include: { _count: { select: { lines: true } } },
        orderBy: [{ createdAt: 'desc' }, { creditNoteNumber: 'desc' }],
        take: pagination.take,
        skip: pagination.skip,
      }),
      this.client.billingCreditNote.count({ where }),
    ]);
    return makePageEnvelope({ items: creditNotes.map(toBillingCreditNoteResponse), take: pagination.take, skip: pagination.skip, total });
  }

  async createBillingCreditNote(
    warehouseReference: string,
    clientReference: string,
    invoiceReference: string,
    dto: CreateBillingCreditNoteDto,
    actor: AuthenticatedUser,
  ): Promise<BillingCreditNoteResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const invoice = await this.resolveInvoice(warehouse.id, client.id, invoiceReference);
    if (invoice.status !== BillingInvoiceStatus.FINALIZED) {
      throw new ConflictException('Credit notes can only be created for finalized invoices.');
    }

    let lines: BillingCreditNoteLineDraft[];
    try {
      lines = buildCreditNoteLines(invoice.lines ?? [], dto.invoiceLineNumbers);
    } catch (error) {
      throw new ConflictException(error instanceof Error ? error.message : 'Credit note must reference at least one invoice line.');
    }

    const summary = summarizeCreditNoteLines(lines);
    const requestedCreditNoteNumber = dto.creditNoteNumber?.trim().toUpperCase() || null;
    const now = new Date();
    const creditNote = await this.transaction(async (tx) => {
      const sequence = (await tx.billingCreditNote.count({ where: { invoiceId: invoice.id } })) + 1;
      const creditNoteNumber = requestedCreditNoteNumber ?? makeCreditNoteNumber({ invoiceNumber: invoice.invoiceNumber, sequence });
      const created = await tx.billingCreditNote.create({
        data: {
          clientId: client.id,
          warehouseId: warehouse.id,
          invoiceId: invoice.id,
          creditNoteNumber,
          status: dto.finalize ? BillingCreditNoteStatus.FINALIZED : BillingCreditNoteStatus.DRAFT,
          reasonCode: normalizeOptionalString(dto.reasonCode),
          reason: normalizeOptionalString(dto.reason),
          currency: summary.currency,
          subtotalMinor: summary.subtotalMinor,
          taxTotalMinor: summary.taxTotalMinor,
          totalAmountMinor: summary.totalAmountMinor,
          finalizedAt: dto.finalize ? now : null,
          metadata: mergeMetadata(dto.metadata ?? null, {
            sourceInvoiceId: invoice.id,
            sourceInvoiceNumber: invoice.invoiceNumber,
            sourceInvoiceLineNumbers: lines.map((line) => line.metadata['sourceInvoiceLineNumber']),
          }),
          lines: {
            create: lines.map((line) => ({
              invoiceLineId: line.invoiceLineId,
              lineNumber: line.lineNumber,
              eventType: line.eventType,
              description: line.description,
              quantity: line.quantity,
              amountMinor: line.amountMinor,
              vatRateBps: line.vatRateBps,
              netAmountMinor: line.netAmountMinor,
              taxAmountMinor: line.taxAmountMinor,
              grossAmountMinor: line.grossAmountMinor,
              currency: line.currency,
              metadata: line.metadata,
            })),
          },
        },
        include: { lines: { orderBy: { lineNumber: 'asc' } }, _count: { select: { lines: true } } },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.id,
          warehouseId: warehouse.id,
          action: dto.finalize ? 'billing.credit_note_created_finalized' : 'billing.credit_note_created',
          resourceType: 'billing_credit_note',
          resourceId: created.id,
          metadata: { creditNoteNumber, invoiceNumber: invoice.invoiceNumber, lineCount: lines.length, totalAmountMinor: summary.totalAmountMinor },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: dto.finalize ? 'BILLING_CREDIT_NOTE_FINALIZED' : 'BILLING_CREDIT_NOTE_CREATED',
          aggregateType: 'billing_credit_note',
          aggregateId: created.id,
          payload: { warehouseId: warehouse.id, clientId: client.id, invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, creditNoteNumber },
          status: 'PENDING',
          availableAt: new Date(),
        },
      });
      return created;
    });
    return toBillingCreditNoteResponse(creditNote);
  }

  async getBillingCreditNote(
    warehouseReference: string,
    clientReference: string,
    creditNoteReference: string,
  ): Promise<BillingCreditNoteResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const creditNote = await this.resolveCreditNote(warehouse.id, client.id, creditNoteReference);
    return toBillingCreditNoteResponse(creditNote);
  }

  async finalizeBillingCreditNote(
    warehouseReference: string,
    clientReference: string,
    creditNoteReference: string,
    dto: FinalizeBillingCreditNoteDto,
    actor: AuthenticatedUser,
  ): Promise<BillingCreditNoteResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const creditNote = await this.resolveCreditNote(warehouse.id, client.id, creditNoteReference);
    if (creditNote.status !== BillingCreditNoteStatus.DRAFT) {
      throw new ConflictException('Only draft credit notes can be finalized.');
    }

    const now = new Date();
    const updated = await this.transaction(async (tx) => {
      const result = await tx.billingCreditNote.update({
        where: { id: creditNote.id },
        data: { status: BillingCreditNoteStatus.FINALIZED, finalizedAt: now, metadata: mergeMetadata(creditNote.metadata, dto.metadata ?? {}) },
        include: { lines: { orderBy: { lineNumber: 'asc' } }, _count: { select: { lines: true } } },
      });
      await tx.auditLog.create({ data: { actorUserId: actor.id, warehouseId: warehouse.id, action: 'billing.credit_note_finalized', resourceType: 'billing_credit_note', resourceId: creditNote.id, metadata: { creditNoteNumber: creditNote.creditNoteNumber, invoiceId: creditNote.invoiceId } } });
      await tx.outboxEvent.create({ data: { type: 'BILLING_CREDIT_NOTE_FINALIZED', aggregateType: 'billing_credit_note', aggregateId: creditNote.id, payload: { warehouseId: warehouse.id, clientId: client.id, invoiceId: creditNote.invoiceId, creditNoteNumber: creditNote.creditNoteNumber }, status: 'PENDING', availableAt: new Date() } });
      return result;
    });
    return toBillingCreditNoteResponse(updated);
  }

  async exportBillingCreditNote(
    warehouseReference: string,
    clientReference: string,
    creditNoteReference: string,
  ): Promise<BillingCreditNoteExportResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const creditNote = await this.resolveCreditNote(warehouse.id, client.id, creditNoteReference);
    const invoice = await this.client.billingInvoice.findFirst({ where: { id: creditNote.invoiceId } });
    if (!invoice) throw new NotFoundException('Source billing invoice was not found.');
    const csv = exportCreditNoteCsv({
      creditNoteNumber: creditNote.creditNoteNumber,
      invoiceNumber: invoice.invoiceNumber,
      clientCode: client.code,
      warehouseCode: warehouse.code,
      lines: (creditNote.lines ?? []).map((line) => ({
        lineNumber: line.lineNumber,
        eventType: line.eventType,
        description: line.description,
        quantity: line.quantity,
        amountMinor: line.amountMinor,
        vatRateBps: line.vatRateBps ?? null,
        netAmountMinor: line.netAmountMinor ?? line.amountMinor,
        taxAmountMinor: line.taxAmountMinor ?? 0,
        grossAmountMinor: line.grossAmountMinor ?? line.amountMinor,
        currency: line.currency,
      })),
    });
    return { creditNoteNumber: creditNote.creditNoteNumber, contentType: 'text/csv', filename: `${creditNote.creditNoteNumber}.csv`, csv };
  }


  async exportBillingCreditNotePdf(
    warehouseReference: string,
    clientReference: string,
    creditNoteReference: string,
  ): Promise<BillingCreditNotePdfExportResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const creditNote = await this.resolveCreditNote(warehouse.id, client.id, creditNoteReference);
    const invoice = await this.client.billingInvoice.findFirst({ where: { id: creditNote.invoiceId } });
    if (!invoice) throw new NotFoundException('Source billing invoice was not found.');
    const pdfBase64 = buildBillingPdfBase64({
      documentType: 'CREDIT_NOTE',
      documentNumber: creditNote.creditNoteNumber,
      sourceDocumentNumber: invoice.invoiceNumber,
      clientCode: client.code,
      warehouseCode: warehouse.code,
      currency: creditNote.currency,
      subtotalMinor: creditNote.subtotalMinor ?? 0,
      taxTotalMinor: creditNote.taxTotalMinor ?? 0,
      totalAmountMinor: creditNote.totalAmountMinor ?? 0,
      status: creditNote.status,
      lines: (creditNote.lines ?? []).map((line) => ({
        lineNumber: line.lineNumber,
        eventType: line.eventType,
        description: line.description,
        quantity: line.quantity,
        netAmountMinor: line.netAmountMinor ?? line.amountMinor,
        taxAmountMinor: line.taxAmountMinor ?? 0,
        grossAmountMinor: line.grossAmountMinor ?? line.amountMinor,
        currency: line.currency,
      })),
    });
    return { creditNoteNumber: creditNote.creditNoteNumber, contentType: 'application/pdf', filename: `${creditNote.creditNoteNumber}.pdf`, pdfBase64 };
  }

  async getBillingSummary(
    warehouseReference: string,
    clientReference: string,
    query: ListBillingEventsQueryDto = {},
  ): Promise<BillingSummaryResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = await this.resolveClient(clientReference);
    const where = compactRecord({
      warehouseId: warehouse.id,
      clientId: client.id,
      status: query.status ? normalizeBillingStatus(query.status) : undefined,
      eventType: query.eventType ? normalizeBillingEventType(query.eventType) : undefined,
      occurredAt: compactRecord({
        gte: query.occurredFrom ? new Date(query.occurredFrom) : undefined,
        lte: query.occurredTo ? new Date(query.occurredTo) : undefined,
      }),
    });
    const events = await this.client.billingEvent.findMany({ where, select: { eventType: true, status: true, amountMinor: true } });
    return summarizeBillingEvents({ clientId: client.id, warehouseId: warehouse.id, currency: client.billingCurrency, events });
  }

  private async resolveWarehouse(reference: string): Promise<WarehouseRecord> {
    const warehouse = await this.client.warehouse.findFirst({ where: warehouseWhere(reference) });
    if (!warehouse) throw new NotFoundException('Warehouse was not found.');
    return warehouse;
  }

  private async resolveClient(reference: string): Promise<WmsClientRecord> {
    const normalized = normalizeClientCode(reference);
    const client = await this.client.wmsClient.findFirst({ where: isUuid(reference) ? { OR: [{ id: reference }, { code: normalized }] } : { code: normalized } });
    if (!client) throw new NotFoundException('Client was not found.');
    return client;
  }

  private async resolveSku(reference: string): Promise<{ id: string } | null> {
    return this.client.sku.findFirst({ where: isUuid(reference) ? { OR: [{ id: reference }, { code: reference.trim().toUpperCase() }] } : { code: reference.trim().toUpperCase() } });
  }


  private async resolveInvoice(
    warehouseId: string,
    clientId: string,
    reference: string,
  ): Promise<BillingInvoiceRecord & { lines?: BillingInvoiceLineRecord[]; _count?: { lines: number } }> {
    const invoice = await this.client.billingInvoice.findFirst({
      where: isUuid(reference)
        ? { warehouseId, clientId, OR: [{ id: reference }, { invoiceNumber: reference.trim().toUpperCase() }] }
        : { warehouseId, clientId, invoiceNumber: reference.trim().toUpperCase() },
      include: { lines: { orderBy: { lineNumber: 'asc' } }, _count: { select: { lines: true } } },
    });
    if (!invoice) throw new NotFoundException('Billing invoice was not found.');
    return invoice;
  }

  private async resolveCreditNote(
    warehouseId: string,
    clientId: string,
    reference: string,
  ): Promise<BillingCreditNoteRecord & { lines?: BillingCreditNoteLineRecord[]; _count?: { lines: number } }> {
    const creditNote = await this.client.billingCreditNote.findFirst({
      where: isUuid(reference)
        ? { warehouseId, clientId, OR: [{ id: reference }, { creditNoteNumber: reference.trim().toUpperCase() }] }
        : { warehouseId, clientId, creditNoteNumber: reference.trim().toUpperCase() },
      include: { lines: { orderBy: { lineNumber: 'asc' } }, _count: { select: { lines: true } } },
    });
    if (!creditNote) throw new NotFoundException('Billing credit note was not found.');
    return creditNote;
  }

  private async resolveActiveClientRate(
    warehouseId: string,
    clientId: string,
    eventType: string,
    at: Date,
  ): Promise<(ClientRateRecord & { currency: string }) | null> {
    const card = await this.client.clientRateCard.findFirst({
      where: {
        warehouseId,
        clientId,
        isActive: true,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
        rates: { some: { eventType } },
      },
      include: { rates: { where: { eventType }, orderBy: [{ unit: 'asc' }] } },
      orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }],
    });
    const rate = card?.rates?.[0];
    return rate ? { ...rate, currency: card.currency } : null;
  }

  private async allocateInvoiceNumber(
    tx: ClientsTransactionClient,
    warehouseId: string,
    clientId: string,
    clientCode: string,
    periodStart: Date,
  ): Promise<string> {
    const year = periodStart.getUTCFullYear();
    const prefix = clientCode.trim().toUpperCase();
    const existing = await tx.invoiceNumberSequence.findFirst({
      where: { warehouseId, clientId, year, prefix },
      select: { id: true, nextNumber: true, prefix: true, year: true },
    });

    if (!existing) {
      await tx.invoiceNumberSequence.create({
        data: { warehouseId, clientId, year, prefix, nextNumber: 2 },
      });
      return makeSequentialInvoiceNumber({ prefix, year, nextNumber: 1 });
    }

    await tx.invoiceNumberSequence.update({
      where: { id: existing.id },
      data: { nextNumber: { increment: 1 } },
    });
    return makeSequentialInvoiceNumber({ prefix: existing.prefix, year: existing.year, nextNumber: existing.nextNumber });
  }

  private async writeAudit(
    actorUserId: string | null,
    warehouseId: string | null,
    action: string,
    resourceType: string,
    resourceId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.client.auditLog.create({ data: { actorUserId, warehouseId, action, resourceType, resourceId, metadata } });
  }

  private async writeOutbox(type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
    await this.client.outboxEvent.create({ data: { type, aggregateType, aggregateId, payload, status: 'PENDING', availableAt: new Date() } });
  }

  private transaction<T>(fn: (client: ClientsTransactionClient) => Promise<T>): Promise<T> {
    return withTransactionRetry(() => this.client.$transaction(fn));
  }

  private get client(): ClientsPrismaClient {
    return this.prisma as unknown as ClientsPrismaClient;
  }
}

function toClientResponse(client: WmsClientRecord): WmsClientResponse {
  return {
    id: client.id,
    code: client.code,
    name: client.name,
    status: client.status,
    billingCurrency: client.billingCurrency,
    externalReference: client.externalReference ?? null,
    metadata: client.metadata ?? null,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

function toClientWarehouseResponse(link: ClientWarehouseRecord): ClientWarehouseResponse {
  return {
    id: link.id,
    clientId: link.clientId,
    warehouseId: link.warehouseId,
    isActive: link.isActive,
    defaultBillingProfile: link.defaultBillingProfile ?? null,
    externalReference: link.externalReference ?? null,
    metadata: link.metadata ?? null,
  };
}

function toClientSkuAliasResponse(alias: ClientSkuAliasRecord): ClientSkuAliasResponse {
  return {
    id: alias.id,
    clientId: alias.clientId,
    warehouseId: alias.warehouseId ?? null,
    skuId: alias.skuId ?? null,
    clientSku: alias.clientSku,
    clientBarcode: alias.clientBarcode ?? null,
    description: alias.description ?? null,
    metadata: alias.metadata ?? null,
  };
}

function toRateCardResponse(card: ClientRateCardRecord & { rates?: ClientRateRecord[] }): ClientRateCardResponse {
  return {
    id: card.id,
    clientId: card.clientId,
    warehouseId: card.warehouseId,
    name: card.name,
    currency: card.currency,
    validFrom: card.validFrom,
    validTo: card.validTo ?? null,
    isActive: card.isActive,
    metadata: card.metadata ?? null,
    rates: card.rates?.map(toRateResponse),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

function toRateResponse(rate: ClientRateRecord): ClientRateResponse {
  return {
    id: rate.id,
    rateCardId: rate.rateCardId,
    eventType: rate.eventType,
    unit: rate.unit,
    unitPriceMinor: rate.unitPriceMinor,
    minChargeMinor: rate.minChargeMinor ?? null,
    vatRateBps: rate.vatRateBps ?? null,
    metadata: rate.metadata ?? null,
  };
}

function toUserClientAccessResponse(access: UserClientAccessRecord): UserClientAccessResponse {
  return {
    id: access.id,
    userId: access.userId,
    clientId: access.clientId,
    warehouseId: access.warehouseId ?? null,
    isActive: access.isActive,
    metadata: access.metadata ?? null,
  };
}

function toClientResourceLinkResponse(link: ClientResourceLinkRecord): ClientResourceLinkResponse {
  return {
    id: link.id,
    clientId: link.clientId,
    warehouseId: link.warehouseId,
    resourceType: link.resourceType,
    resourceId: link.resourceId,
    externalReference: link.externalReference ?? null,
    metadata: link.metadata ?? null,
  };
}

function toBillingEventResponse(event: BillingEventRecord): BillingEventResponse {
  return {
    id: event.id,
    clientId: event.clientId,
    warehouseId: event.warehouseId,
    eventType: event.eventType,
    status: event.status,
    reference: event.reference,
    resourceType: event.resourceType ?? null,
    resourceId: event.resourceId ?? null,
    description: event.description ?? null,
    quantity: event.quantity,
    unitPriceMinor: event.unitPriceMinor,
    amountMinor: event.amountMinor,
    currency: event.currency,
    occurredAt: event.occurredAt,
    invoicedAt: event.invoicedAt ?? null,
    voidedAt: event.voidedAt ?? null,
    metadata: event.metadata ?? null,
  };
}


function toBillingInvoiceLineResponse(line: BillingInvoiceLineRecord): BillingInvoiceLineResponse {
  return {
    id: line.id,
    invoiceId: line.invoiceId,
    billingEventId: line.billingEventId ?? null,
    lineNumber: line.lineNumber,
    eventType: line.eventType,
    description: line.description,
    quantity: line.quantity,
    amountMinor: line.amountMinor,
    vatRateBps: line.vatRateBps ?? null,
    netAmountMinor: line.netAmountMinor ?? line.amountMinor,
    taxAmountMinor: line.taxAmountMinor ?? 0,
    grossAmountMinor: line.grossAmountMinor ?? line.amountMinor,
    currency: line.currency,
    metadata: line.metadata ?? null,
  };
}

function toBillingInvoiceResponse(
  invoice: BillingInvoiceRecord & { lines?: BillingInvoiceLineRecord[]; _count?: { lines: number } },
): BillingInvoiceResponse {
  const lines = invoice.lines?.map(toBillingInvoiceLineResponse);
  return {
    id: invoice.id,
    clientId: invoice.clientId,
    warehouseId: invoice.warehouseId,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    currency: invoice.currency,
    subtotalMinor: invoice.subtotalMinor ?? invoice.totalAmountMinor,
    taxTotalMinor: invoice.taxTotalMinor ?? 0,
    totalAmountMinor: invoice.totalAmountMinor,
    lineCount: invoice._count?.lines ?? lines?.length ?? 0,
    finalizedAt: invoice.finalizedAt ?? null,
    voidedAt: invoice.voidedAt ?? null,
    metadata: invoice.metadata ?? null,
    ...(lines ? { lines } : {}),
    createdAt: invoice.createdAt,
    updatedAt: invoice.updatedAt,
  };
}

function toBillingCreditNoteLineResponse(line: BillingCreditNoteLineRecord): BillingCreditNoteLineResponse {
  return {
    id: line.id,
    creditNoteId: line.creditNoteId,
    invoiceLineId: line.invoiceLineId ?? null,
    lineNumber: line.lineNumber,
    eventType: line.eventType,
    description: line.description,
    quantity: line.quantity,
    amountMinor: line.amountMinor,
    vatRateBps: line.vatRateBps ?? null,
    netAmountMinor: line.netAmountMinor ?? line.amountMinor,
    taxAmountMinor: line.taxAmountMinor ?? 0,
    grossAmountMinor: line.grossAmountMinor ?? line.amountMinor,
    currency: line.currency,
    metadata: line.metadata ?? null,
  };
}

function toBillingCreditNoteResponse(
  creditNote: BillingCreditNoteRecord & { lines?: BillingCreditNoteLineRecord[]; _count?: { lines: number } },
): BillingCreditNoteResponse {
  const lines = creditNote.lines?.map(toBillingCreditNoteLineResponse);
  return {
    id: creditNote.id,
    clientId: creditNote.clientId,
    warehouseId: creditNote.warehouseId,
    invoiceId: creditNote.invoiceId,
    creditNoteNumber: creditNote.creditNoteNumber,
    status: creditNote.status,
    reasonCode: creditNote.reasonCode ?? null,
    reason: creditNote.reason ?? null,
    currency: creditNote.currency,
    subtotalMinor: creditNote.subtotalMinor ?? creditNote.totalAmountMinor,
    taxTotalMinor: creditNote.taxTotalMinor ?? 0,
    totalAmountMinor: creditNote.totalAmountMinor,
    lineCount: creditNote._count?.lines ?? lines?.length ?? 0,
    finalizedAt: creditNote.finalizedAt ?? null,
    voidedAt: creditNote.voidedAt ?? null,
    metadata: creditNote.metadata ?? null,
    ...(lines ? { lines } : {}),
    createdAt: creditNote.createdAt,
    updatedAt: creditNote.updatedAt,
  };
}

function warehouseWhere(reference: string): Record<string, unknown> {
  return isUuid(reference) ? { OR: [{ id: reference }, { code: reference.trim().toUpperCase() }] } : { code: reference.trim().toUpperCase() };
}

function compactRecord<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === undefined) return false;
      if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) return false;
      return true;
    }),
  );
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function mergeMetadata(existing: unknown, patch: Record<string, unknown>): Record<string, unknown> {
  return { ...toRecord(existing), ...patch };
}

interface ClientsPrismaClient extends ClientsTransactionClient {
  $transaction<T>(fn: (client: ClientsTransactionClient) => Promise<T>): Promise<T>;
}

interface ClientsTransactionClient {
  warehouse: { findFirst(args: Record<string, unknown>): Promise<WarehouseRecord | null> };
  wmsClient: { findMany(args: Record<string, unknown>): Promise<WmsClientRecord[]>; findFirst(args: Record<string, unknown>): Promise<WmsClientRecord | null>; upsert(args: Record<string, unknown>): Promise<WmsClientRecord> };
  clientWarehouse: { findMany(args: Record<string, unknown>): Promise<Array<ClientWarehouseRecord & { client: WmsClientRecord }>>; upsert(args: Record<string, unknown>): Promise<ClientWarehouseRecord> };
  clientSkuAlias: { upsert(args: Record<string, unknown>): Promise<ClientSkuAliasRecord> };
  clientRateCard: { findMany(args: Record<string, unknown>): Promise<Array<ClientRateCardRecord & { rates?: ClientRateRecord[] }>>; findFirst(args: Record<string, unknown>): Promise<(ClientRateCardRecord & { rates?: ClientRateRecord[] }) | null>; create(args: Record<string, unknown>): Promise<ClientRateCardRecord & { rates?: ClientRateRecord[] }> };
  user: { findFirst(args: Record<string, unknown>): Promise<{ id: string; email: string } | null> };
  userClientAccess: { upsert(args: Record<string, unknown>): Promise<UserClientAccessRecord> };
  clientResourceLink: { findMany(args: Record<string, unknown>): Promise<ClientResourceLinkRecord[]>; upsert(args: Record<string, unknown>): Promise<ClientResourceLinkRecord> };
  sku: { findFirst(args: Record<string, unknown>): Promise<{ id: string } | null> };
  stockQuant: { findMany(args: Record<string, unknown>): Promise<StockQuantBillingRecord[]> };
  billingEvent: { count(args: Record<string, unknown>): Promise<number>; findFirst(args: Record<string, unknown>): Promise<BillingEventRecord | null>; findMany(args: Record<string, unknown>): Promise<BillingEventRecord[]>; update(args: Record<string, unknown>): Promise<BillingEventRecord>; updateMany(args: Record<string, unknown>): Promise<unknown>; upsert(args: Record<string, unknown>): Promise<BillingEventRecord> };
  invoiceNumberSequence: { findFirst(args: Record<string, unknown>): Promise<InvoiceNumberSequenceRecord | null>; create(args: Record<string, unknown>): Promise<InvoiceNumberSequenceRecord>; update(args: Record<string, unknown>): Promise<InvoiceNumberSequenceRecord> };
  billingInvoice: { count(args: Record<string, unknown>): Promise<number>; create(args: Record<string, unknown>): Promise<BillingInvoiceRecord & { lines?: BillingInvoiceLineRecord[]; _count?: { lines: number } }>; findFirst(args: Record<string, unknown>): Promise<(BillingInvoiceRecord & { lines?: BillingInvoiceLineRecord[]; _count?: { lines: number } }) | null>; findMany(args: Record<string, unknown>): Promise<Array<BillingInvoiceRecord & { _count?: { lines: number } }>>; update(args: Record<string, unknown>): Promise<BillingInvoiceRecord & { lines?: BillingInvoiceLineRecord[]; _count?: { lines: number } }> };
  billingInvoiceLine: { updateMany(args: Record<string, unknown>): Promise<unknown> };
  billingCreditNote: { count(args: Record<string, unknown>): Promise<number>; create(args: Record<string, unknown>): Promise<BillingCreditNoteRecord & { lines?: BillingCreditNoteLineRecord[]; _count?: { lines: number } }>; findFirst(args: Record<string, unknown>): Promise<(BillingCreditNoteRecord & { lines?: BillingCreditNoteLineRecord[]; _count?: { lines: number } }) | null>; findMany(args: Record<string, unknown>): Promise<Array<BillingCreditNoteRecord & { _count?: { lines: number } }>>; update(args: Record<string, unknown>): Promise<BillingCreditNoteRecord & { lines?: BillingCreditNoteLineRecord[]; _count?: { lines: number } }> };
  auditLog: { create(args: Record<string, unknown>): Promise<unknown> };
  outboxEvent: { create(args: Record<string, unknown>): Promise<unknown> };
}

interface WarehouseRecord { id: string; code: string }
interface WmsClientRecord { id: string; code: string; name: string; status: string; billingCurrency: string; externalReference?: string | null; metadata: unknown; createdAt: Date; updatedAt: Date }
interface ClientWarehouseRecord { id: string; clientId: string; warehouseId: string; isActive: boolean; defaultBillingProfile: string | null; externalReference?: string | null; metadata: unknown }
interface ClientSkuAliasRecord { id: string; clientId: string; warehouseId: string | null; skuId: string | null; clientSku: string; clientBarcode: string | null; description: string | null; metadata: unknown }
interface ClientResourceLinkRecord { id: string; clientId: string; warehouseId: string; resourceType: string; resourceId: string; externalReference?: string | null; metadata?: unknown }
interface ClientRateCardRecord { id: string; clientId: string; warehouseId: string; name: string; currency: string; validFrom: Date; validTo: Date | null; isActive: boolean; metadata: unknown; createdAt: Date; updatedAt: Date }
interface ClientRateRecord { id: string; rateCardId: string; eventType: string; unit: string; unitPriceMinor: number; minChargeMinor: number | null; vatRateBps: number | null; metadata: unknown }
interface UserClientAccessRecord { id: string; userId: string; clientId: string; warehouseId: string | null; isActive: boolean; metadata: unknown }
interface BillingEventRecord { id: string; clientId: string; warehouseId: string; eventType: string; status: string; reference: string; resourceType: string | null; resourceId: string | null; description: string | null; quantity: number; unitPriceMinor: number; amountMinor: number; currency: string; occurredAt: Date; invoicedAt: Date | null; voidedAt: Date | null; metadata: unknown }

interface StockQuantBillingRecord { id: string; warehouseId: string; skuId: string; quantity: number; createdAt: Date; sku?: { code: string } | null; location?: { code: string } | null }
interface BillingInvoiceRecord { id: string; clientId: string; warehouseId: string; invoiceNumber: string; status: string; periodStart: Date; periodEnd: Date; currency: string; subtotalMinor?: number; taxTotalMinor?: number; totalAmountMinor: number; finalizedAt: Date | null; voidedAt: Date | null; metadata: unknown; createdAt: Date; updatedAt: Date }
interface BillingInvoiceLineRecord { id: string; invoiceId: string; billingEventId: string | null; lineNumber: number; eventType: string; description: string; quantity: number; amountMinor: number; vatRateBps?: number | null; netAmountMinor?: number; taxAmountMinor?: number; grossAmountMinor?: number; currency: string; metadata: unknown }
interface BillingCreditNoteRecord { id: string; clientId: string; warehouseId: string; invoiceId: string; creditNoteNumber: string; status: string; reasonCode: string | null; reason: string | null; currency: string; subtotalMinor?: number; taxTotalMinor?: number; totalAmountMinor: number; finalizedAt: Date | null; voidedAt: Date | null; metadata: unknown; createdAt: Date; updatedAt: Date }
interface BillingCreditNoteLineRecord { id: string; creditNoteId: string; invoiceLineId: string | null; lineNumber: number; eventType: string; description: string; quantity: number; amountMinor: number; vatRateBps?: number | null; netAmountMinor?: number; taxAmountMinor?: number; grossAmountMinor?: number; currency: string; metadata: unknown }
interface InvoiceNumberSequenceRecord { id: string; warehouseId: string; clientId: string | null; prefix: string; year: number; nextNumber: number }
