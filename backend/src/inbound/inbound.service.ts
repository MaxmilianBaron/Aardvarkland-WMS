import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { OwnerClientRecord, OwnerScopePrismaClient, OwnerScopeService } from '../clients/owner-scope.service';
import { normalizeOffsetPagination } from '../common';
import { PrismaService } from '../database';
import { Parcel, Prisma, Warehouse, WarehouseLocation } from '../generated/prisma/client';
import { lockStockQuantIdentity } from '../inventory/stock-quant-identity.helpers';
import {
  assertTraceabilityCapture,
  normalizeSerialNumbers,
  resolveTraceabilityPolicy,
  TraceabilityPolicy,
} from '../traceability/traceability-policy.helpers';
import { CreateInboundShipmentDto } from './dto/create-inbound-shipment.dto';
import { ListInboundShipmentsQueryDto } from './dto/list-inbound-shipments-query.dto';
import { ReceiveInboundLineDto } from './dto/receive-inbound-line.dto';
import {
  UpdateInboundShipmentDto,
  UpdateInboundShipmentLineDto,
} from './dto/update-inbound-shipment.dto';
import {
  InboundDockLocationResponse,
  InboundParcelResponse,
  InboundReceiveExceptionResponse,
  InboundReceiveMovementResponse,
  InboundReceiveQualityCheckResponse,
  InboundReceiveQuantResponse,
  InboundReceiveResponse,
  InboundReceiveTaskResponse,
  InboundShipmentLineResponse,
  InboundShipmentResponse,
  InboundStatus,
} from './inbound.types';

const inboundShipmentInclude: InboundShipmentInclude = {
  dockLocation: true,
  lines: {
    include: { parcel: true },
    orderBy: { lineNumber: 'asc' },
  },
};

@Injectable()
export class InboundService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async findMany(
    warehouseReference: string,
    query: ListInboundShipmentsQueryDto,
  ): Promise<InboundShipmentResponse[]> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });
    const shipments = await client.inboundShipment.findMany({
      where: {
        warehouseId: warehouse.id,
        ...(query.status ? { status: query.status } : {}),
        ...(query.search
          ? {
              OR: [
                { shipmentNumber: { contains: query.search, mode: 'insensitive' } },
                { externalReference: { contains: query.search, mode: 'insensitive' } },
                { supplierName: { contains: query.search, mode: 'insensitive' } },
                { supplierReference: { contains: query.search, mode: 'insensitive' } },
                { purchaseOrderReference: { contains: query.search, mode: 'insensitive' } },
                { dockLocation: { is: { code: { contains: query.search, mode: 'insensitive' } } } },
                { dockLocation: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      },
      include: inboundShipmentInclude,
      orderBy: { createdAt: 'desc' },
      take: page.take,
      skip: page.skip,
    });

    return shipments.map(toInboundShipmentResponse);
  }

  async findOne(
    warehouseReference: string,
    shipmentReference: string,
  ): Promise<InboundShipmentResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const shipment = await this.resolveShipment(warehouse.id, shipmentReference);

    return toInboundShipmentResponse(shipment);
  }

  async create(
    warehouseReference: string,
    dto: CreateInboundShipmentDto,
    actor: AuthenticatedUser,
  ): Promise<InboundShipmentResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const owner = dto.ownerClientReference
      ? await this.ownerScope.resolveOwnerClient({
          warehouseId: warehouse.id,
          clientReference: dto.ownerClientReference,
        })
      : null;
    const appointmentStartAt = toOptionalDate(dto.appointmentStartAt);
    const appointmentEndAt = toOptionalDate(dto.appointmentEndAt);
    assertAppointmentWindow(appointmentStartAt ?? null, appointmentEndAt ?? null);
    const dockLocationId = dto.dockLocationReference
      ? (await this.resolveDockLocation(client, warehouse.id, dto.dockLocationReference)).id
      : null;
    const lines = await Promise.all(
      (dto.lines ?? []).map(async (line, index) => ({
        lineNumber: normalizeLineNumber(line.lineNumber ?? `${index + 1}`),
        sku: line.sku.trim(),
        description: normalizeNullableString(line.description),
        expectedQuantity: line.expectedQuantity,
        receivedQuantity: line.receivedQuantity ?? 0,
        parcelId: line.parcelReference
          ? (await this.resolveParcel(warehouse.id, line.parcelReference)).id
          : null,
        metadata: toJsonInput(line.metadata),
      })),
    );

    try {
      const shipment = await client.inboundShipment.create({
        data: {
          warehouseId: warehouse.id,
          shipmentNumber: normalizeReference(dto.shipmentNumber),
          status: dto.status ?? InboundStatus.CREATED,
          supplierName: normalizeNullableString(dto.supplierName),
          supplierReference: normalizeNullableString(dto.supplierReference),
          purchaseOrderReference: normalizeNullableString(dto.purchaseOrderReference),
          externalReference: normalizeNullableString(dto.externalReference),
          dockLocationId,
          expectedAt: toOptionalDate(dto.expectedAt),
          appointmentStartAt: appointmentStartAt ?? null,
          appointmentEndAt: appointmentEndAt ?? null,
          receivedAt: toOptionalDate(dto.receivedAt),
          metadata: toJsonInput(dto.metadata),
          ...(lines.length ? { lines: { create: lines } } : {}),
        },
        include: inboundShipmentInclude,
      });

      if (owner) {
        await this.linkOwnerResources(client, warehouse.id, owner, [
          { resourceType: 'INBOUND_SHIPMENT', resourceId: shipment.id, metadata: { source: 'inbound.create' } },
          ...shipment.lines.map((line) => ({
            resourceType: 'INBOUND_SHIPMENT_LINE',
            resourceId: line.id,
            metadata: { source: 'inbound.create', inboundShipmentId: shipment.id },
          })),
        ]);
      }

      await this.writeAudit(actor, warehouse.id, 'inbound_shipment.created', shipment);

      return toInboundShipmentResponse(shipment);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Inbound shipment number already exists in this warehouse');
      }

      throw error;
    }
  }

  async update(
    warehouseReference: string,
    shipmentReference: string,
    dto: UpdateInboundShipmentDto,
    actor: AuthenticatedUser,
  ): Promise<InboundShipmentResponse> {
    const client = this.getClient();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existingShipment = await this.resolveShipment(warehouse.id, shipmentReference);
    const data = await this.toShipmentUpdateInput(client, warehouse.id, existingShipment, dto);

    try {
      const shipment =
        Object.keys(data).length === 0
          ? existingShipment
          : await client.inboundShipment.update({
              where: { id: existingShipment.id },
              data,
              include: inboundShipmentInclude,
            });

      for (const line of dto.lines ?? []) {
        await this.updateLine(warehouse.id, shipment.id, line);
      }

      const refreshedShipment = await this.resolveShipment(warehouse.id, shipment.id);
      await this.writeAudit(actor, warehouse.id, 'inbound_shipment.updated', refreshedShipment);

      return toInboundShipmentResponse(refreshedShipment);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Inbound shipment number or line number already exists');
      }

      throw error;
    }
  }

  async receive(
    warehouseReference: string,
    shipmentReference: string,
    dto: ReceiveInboundLineDto,
    actor: AuthenticatedUser,
  ): Promise<InboundReceiveResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const idempotentReceive = await this.findIdempotentReceive(warehouse.id, dto.idempotencyKey);

    if (idempotentReceive) {
      return idempotentReceive;
    }

    return this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as InboundPrismaClient;
      const shipment = await this.resolveShipmentInClient(client, warehouse.id, shipmentReference);
      const owner = await this.resolveReceiveOwner(client, warehouse.id, shipment.id, dto.ownerClientReference);

      if (shipment.status === InboundStatus.CANCELLED || shipment.status === InboundStatus.CLOSED) {
        throw new ConflictException('Cancelled or closed inbound shipments cannot receive stock');
      }

      const { line, isUnexpected } = await this.resolveReceiveLine(client, shipment, dto);
      const goodQuantity = dto.quantity;
      const damagedQuantity = dto.damagedQuantity ?? 0;
      const totalReceivedQuantity = goodQuantity + damagedQuantity;
      const qualityCheck = toReceiveQualityCheck(dto, goodQuantity);
      const stockStatus: 'AVAILABLE' | 'QUARANTINE' = qualityCheck?.heldQuantity
        ? 'QUARANTINE'
        : 'AVAILABLE';

      if (totalReceivedQuantity <= 0) {
        throw new ConflictException('Received quantity must be greater than zero');
      }

      const nextReceivedQuantity = line.receivedQuantity + totalReceivedQuantity;
      const overReceivedQuantity = Math.max(0, nextReceivedQuantity - line.expectedQuantity);

      if (!isUnexpected && overReceivedQuantity > 0 && dto.allowOverReceive !== true) {
        throw new ConflictException('Received quantity would exceed expected quantity');
      }

      const sku = await this.resolveSku(client, line.sku);
      const receivingLocation = await this.resolveLocation(
        client,
        warehouse.id,
        dto.locationReference ?? 'RCV-01',
      );
      const batch =
        normalizeNullableString(dto.batch) ??
        readStringMetadata(line.metadata, 'batch') ??
        readStringMetadata(line.metadata, 'lot');
      const lotReference =
        normalizeNullableString(dto.lotReference) ??
        readStringMetadata(line.metadata, 'lotReference') ??
        readStringMetadata(line.metadata, 'lotCode') ??
        batch;
      const expiry = toOptionalDate(dto.expiry ?? readStringMetadata(line.metadata, 'expiry'));
      const traceabilityPolicy = resolveTraceabilityPolicy(sku.metadata, line.metadata, dto.metadata);
      const goodSerialNumbers = normalizeSerialNumbers(dto.serialNumbers);
      const damagedSerialNumbers = normalizeSerialNumbers(dto.damagedSerialNumbers);
      assertTraceabilityCapture({
        operation: 'Inbound receive',
        quantity: totalReceivedQuantity,
        policy: traceabilityPolicy,
        serialNumbers: [...goodSerialNumbers, ...damagedSerialNumbers],
        lotReference,
        expiry,
      });
      assertReceiveSerialDistribution({
        goodQuantity,
        damagedQuantity,
        goodSerialNumbers,
        damagedSerialNumbers,
        policy: traceabilityPolicy,
      });
      const lot = await this.resolveOrCreateReceiveLot(client, {
        warehouseId: warehouse.id,
        ownerClientId: owner?.id ?? null,
        skuId: sku.id,
        lotReference,
        batch,
        expiry: expiry ?? null,
        qualityStatus: qualityCheck?.status ?? null,
        metadata: dto.metadata,
      });
      const exceptions = await this.createReceiveExceptions(client, {
        actor,
        warehouseId: warehouse.id,
        shipment,
        line,
        receivingLocation,
        isUnexpected,
        receivedQuantity: totalReceivedQuantity,
        overReceivedQuantity: isUnexpected ? 0 : overReceivedQuantity,
        underReceivedQuantity:
          dto.completeLine === true && nextReceivedQuantity < line.expectedQuantity
            ? line.expectedQuantity - nextReceivedQuantity
            : 0,
        damagedQuantity,
        damageReason: dto.damageReason,
        qualityCheck,
        sku: line.sku,
      });
      const exceptionIds = exceptions.map((exception) => exception.id);
      const quant =
        goodQuantity > 0
          ? await this.incrementOrCreateReceiveQuant(client, {
              warehouseId: warehouse.id,
              locationId: receivingLocation.id,
              skuId: sku.id,
              quantity: goodQuantity,
              status: stockStatus,
              ownerClientId: owner?.id ?? null,
              lotId: lot?.id ?? null,
              batch,
              expiry: expiry ?? null,
            })
          : null;
      const damagedQuant =
        damagedQuantity > 0
          ? await this.incrementOrCreateReceiveQuant(client, {
              warehouseId: warehouse.id,
              locationId: receivingLocation.id,
              skuId: sku.id,
              quantity: damagedQuantity,
              status: dto.damagedStockStatus ?? 'DAMAGED',
              ownerClientId: owner?.id ?? null,
              lotId: lot?.id ?? null,
              batch,
              expiry: expiry ?? null,
            })
          : null;
      const putawayTask =
        !quant || stockStatus !== 'AVAILABLE' || dto.createPutawayTask === false
          ? null
          : await this.createPutawayTaskForReceive(client, {
              warehouseId: warehouse.id,
              shipment,
              line,
              skuId: sku.id,
              quant,
              quantity: goodQuantity,
              receivingLocation,
              putawayLocationReference: dto.putawayLocationReference,
              metadata: dto.metadata,
            });
      const movement = quant
        ? await this.createReceiveMovement(client, {
            actor,
            warehouseId: warehouse.id,
            shipment,
            line,
            quant,
            putawayTask,
            receivingLocation,
            quantity: goodQuantity,
            condition: stockStatus,
            batch,
            expiry,
            idempotencyKey: normalizeNullableString(dto.idempotencyKey),
            metadata: mergeReceiveMetadata(dto.metadata, qualityCheck, 'RECEIVED'),
            exceptionIds,
          })
        : null;
      const damagedMovement = damagedQuant
        ? await this.createReceiveMovement(client, {
            actor,
            warehouseId: warehouse.id,
            shipment,
            line,
            quant: damagedQuant,
            putawayTask: null,
            receivingLocation,
            quantity: damagedQuantity,
            condition: damagedQuant.status,
            batch,
            expiry,
            idempotencyKey: movement
              ? appendIdempotencySuffix(dto.idempotencyKey, 'damaged')
              : normalizeNullableString(dto.idempotencyKey),
            metadata: {
              ...mergeReceiveMetadata(dto.metadata, qualityCheck, 'DAMAGED'),
              damageReason: normalizeNullableString(dto.damageReason),
            },
            exceptionIds,
          })
        : null;
      const primaryQuant = quant ?? damagedQuant;
      const primaryMovement = movement ?? damagedMovement;

      if (!primaryQuant || !primaryMovement) {
        throw new ConflictException('Receive did not create stock');
      }

      const serialsCreated = await this.recordReceiveSerials(client, {
        actor,
        warehouseId: warehouse.id,
        ownerClientId: owner?.id ?? null,
        skuId: sku.id,
        lotId: lot?.id ?? null,
        inboundShipmentId: shipment.id,
        inboundShipmentLineId: line.id,
        receivingLocationId: receivingLocation.id,
        goodQuant: quant,
        damagedQuant,
        goodSerialNumbers,
        damagedSerialNumbers,
        metadata: dto.metadata,
      });

      if (owner) {
        await this.linkOwnerResources(client, warehouse.id, owner, [
          { resourceType: 'INBOUND_SHIPMENT', resourceId: shipment.id, metadata: { source: 'inbound.receive' } },
          { resourceType: 'INBOUND_SHIPMENT_LINE', resourceId: line.id, metadata: { source: 'inbound.receive', inboundShipmentId: shipment.id } },
          ...[quant, damagedQuant].filter(isPresent).map((item) => ({
            resourceType: 'STOCK_QUANT',
            resourceId: item.id,
            metadata: { source: 'inbound.receive', inboundShipmentId: shipment.id, inboundShipmentLineId: line.id },
          })),
          ...[movement, damagedMovement].filter(isPresent).map((item) => ({
            resourceType: 'STOCK_MOVEMENT',
            resourceId: item.id,
            metadata: { source: 'inbound.receive', inboundShipmentId: shipment.id, inboundShipmentLineId: line.id },
          })),
          ...serialsCreated.map((serialId) => ({
            resourceType: 'SERIAL_NUMBER',
            resourceId: serialId,
            metadata: { source: 'inbound.receive', inboundShipmentId: shipment.id, inboundShipmentLineId: line.id },
          })),
          ...(lot
            ? [{ resourceType: 'SKU_LOT', resourceId: lot.id, metadata: { source: 'inbound.receive', inboundShipmentId: shipment.id } }]
            : []),
          ...(putawayTask
            ? [{ resourceType: 'WAREHOUSE_TASK', resourceId: putawayTask.id, metadata: { source: 'inbound.receive', taskType: 'PUTAWAY' } }]
            : []),
        ]);
      }

      await client.inboundShipmentLine.update({
        where: { id: line.id },
        data: {
          receivedQuantity: { increment: totalReceivedQuantity },
          metadata: toJsonInput(
            mergeMetadata(line.metadata, {
              lastReceive: {
                goodQuantity,
                damagedQuantity,
                qualityCheck,
                qualityHeldQuantity: qualityCheck?.heldQuantity ?? 0,
                totalReceivedQuantity,
                overReceivedQuantity,
                completedShort:
                  dto.completeLine === true && nextReceivedQuantity < line.expectedQuantity,
                lotId: lot?.id ?? null,
                serialNumbers: {
                  good: goodSerialNumbers,
                  damaged: damagedSerialNumbers,
                  created: serialsCreated,
                },
                exceptionIds,
              },
            }),
          ),
        },
        include: { parcel: true },
      });

      const refreshedShipment = await client.inboundShipment.update({
        where: { id: shipment.id },
        data: {
          status: exceptions.length
            ? InboundStatus.EXCEPTION
            : this.resolveReceiveStatus(shipment, line.id, nextReceivedQuantity),
          receivedAt: shipment.receivedAt ?? new Date(),
        },
        include: inboundShipmentInclude,
      });
      const refreshedLine = refreshedShipment.lines.find((item) => item.id === line.id);

      if (!refreshedLine) {
        throw new NotFoundException('Inbound shipment line was not found after receive');
      }

      await this.writeAuditInClient(
        client,
        actor,
        warehouse.id,
        'inbound_shipment.received',
        refreshedShipment,
        {
          lineId: line.id,
          quantity: totalReceivedQuantity,
          goodQuantity,
          damagedQuantity,
          qualityCheck,
          qualityHeldQuantity: qualityCheck?.heldQuantity ?? 0,
          stockQuantId: primaryQuant.id,
          movementId: primaryMovement.id,
          putawayTaskId: putawayTask?.id ?? null,
          lotId: lot?.id ?? null,
          serialsCreated,
          exceptionIds,
        },
      );

      return {
        shipment: toInboundShipmentResponse(refreshedShipment),
        line: toInboundShipmentLineResponse(refreshedLine),
        quant: toReceiveQuantResponse(primaryQuant),
        movement: toReceiveMovementResponse(primaryMovement),
        putawayTask: putawayTask ? toReceiveTaskResponse(putawayTask) : null,
        quants: [quant, damagedQuant].filter(isPresent).map(toReceiveQuantResponse),
        movements: [movement, damagedMovement].filter(isPresent).map(toReceiveMovementResponse),
        exceptions: exceptions.map(toReceiveExceptionResponse),
        receivedQuantity: goodQuantity,
        damagedQuantity,
        qualityHeldQuantity: qualityCheck?.heldQuantity ?? 0,
        qualityCheck,
      };
    });
  }

  private async resolveReceiveOwner(
    client: InboundPrismaClient,
    warehouseId: string,
    shipmentId: string,
    ownerClientReference?: string | null,
  ): Promise<OwnerClientRecord | null> {
    const ownerClient = client as unknown as OwnerScopePrismaClient;

    if (ownerClientReference) {
      const owner = await this.ownerScope.resolveOwnerClient({
        warehouseId,
        clientReference: ownerClientReference,
        client: ownerClient,
      });
      if (!owner) throw new ConflictException('Owner client reference is required.');
      await this.ownerScope.linkResourceToResolvedClient({
        warehouseId,
        clientId: owner.id,
        resourceType: 'INBOUND_SHIPMENT',
        resourceId: shipmentId,
        metadata: { source: 'inbound.receive.owner_override' },
        client: ownerClient,
      });
      return owner;
    }

    return this.ownerScope.findResourceOwner({
      warehouseId,
      resourceType: 'INBOUND_SHIPMENT',
      resourceId: shipmentId,
      client: ownerClient,
    });
  }

  private async resolveOrCreateReceiveLot(
    client: InboundPrismaClient,
    input: ReceiveLotInput,
  ): Promise<SkuLotRecord | null> {
    const lotCode = normalizeNullableString(input.lotReference ?? input.batch);

    if (!lotCode) {
      return null;
    }

    if (!client.skuLot) {
      throw new ConflictException('Lot capture is required but the traceability lot delegate is not available');
    }

    const normalizedLotCode = normalizeReference(lotCode);
    const existing = await client.skuLot.findFirst({
      where: {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        lotCode: normalizedLotCode,
      },
    });

    if (existing) {
      if (['RECALLED', 'CONSUMED', 'ARCHIVED'].includes(existing.status)) {
        throw new ConflictException(`Lot ${normalizedLotCode} cannot receive stock while status is ${existing.status}`);
      }

      return existing;
    }

    const held = input.qualityStatus === 'HOLD' || input.qualityStatus === 'FAILED';

    return client.skuLot.create({
      data: {
        warehouseId: input.warehouseId,
        ownerClientId: input.ownerClientId,
        skuId: input.skuId,
        lotCode: normalizedLotCode,
        batch: input.batch,
        qualityStatus: held ? 'PENDING_QA' : 'RELEASED',
        status: held ? 'HOLD' : 'ACTIVE',
        expiryDate: input.expiry,
        receivedAt: new Date(),
        metadata: toJsonInput({
          ...(input.metadata ?? {}),
          source: 'inbound.receive',
          autoCreated: true,
        }),
      },
    });
  }

  private async recordReceiveSerials(
    client: InboundPrismaClient,
    input: ReceiveSerialCaptureInput,
  ): Promise<string[]> {
    const createdGood = await this.recordReceiveSerialGroup(client, {
      ...input,
      serialNumbers: input.goodSerialNumbers,
      stockQuant: input.goodQuant,
      status: input.goodQuant?.status === 'QUARANTINE' ? 'BLOCKED' : 'AVAILABLE',
      eventType: 'RECEIVED',
    });
    const createdDamaged = await this.recordReceiveSerialGroup(client, {
      ...input,
      serialNumbers: input.damagedSerialNumbers,
      stockQuant: input.damagedQuant,
      status: input.damagedQuant?.status === 'DAMAGED' ? 'DAMAGED' : 'BLOCKED',
      eventType: 'DAMAGED_RECEIVED',
    });

    return [...createdGood, ...createdDamaged];
  }

  private async recordReceiveSerialGroup(
    client: InboundPrismaClient,
    input: ReceiveSerialGroupInput,
  ): Promise<string[]> {
    if (input.serialNumbers.length === 0) {
      return [];
    }

    if (!client.serialNumber || !client.serialNumberEvent) {
      throw new ConflictException('Serial capture is required but the traceability serial delegates are not available');
    }

    const serialIds: string[] = [];

    for (const serialNumber of input.serialNumbers) {
      const existing = await client.serialNumber.findFirst({
        where: { warehouseId: input.warehouseId, serialNumber },
      });

      if (existing && existing.skuId !== input.skuId) {
        throw new ConflictException(`Serial ${serialNumber} already belongs to another SKU`);
      }

      if (existing && existing.status !== 'EXPECTED') {
        throw new ConflictException(`Serial ${serialNumber} already exists with status ${existing.status}`);
      }

      const serial = existing
        ? await client.serialNumber.update({
            where: { id: existing.id },
            data: {
              ownerClientId: input.ownerClientId,
              lotId: input.lotId,
              stockQuantId: input.stockQuant?.id ?? null,
              status: input.status,
              firstReceivedAt: existing.firstReceivedAt ?? new Date(),
              lastSeenLocationId: input.receivingLocationId,
              inboundShipmentLineId: input.inboundShipmentLineId,
              metadata: toJsonInput(mergeMetadata(existing.metadata, {
                ...(input.metadata ?? {}),
                source: 'inbound.receive',
                inboundShipmentId: input.inboundShipmentId,
                inboundShipmentLineId: input.inboundShipmentLineId,
              })),
            },
          })
        : await client.serialNumber.create({
            data: {
              warehouseId: input.warehouseId,
              ownerClientId: input.ownerClientId,
              skuId: input.skuId,
              lotId: input.lotId,
              stockQuantId: input.stockQuant?.id ?? null,
              serialNumber,
              status: input.status,
              firstReceivedAt: new Date(),
              lastSeenLocationId: input.receivingLocationId,
              inboundShipmentLineId: input.inboundShipmentLineId,
              metadata: toJsonInput({
                ...(input.metadata ?? {}),
                source: 'inbound.receive',
                inboundShipmentId: input.inboundShipmentId,
                inboundShipmentLineId: input.inboundShipmentLineId,
              }),
            },
          });

      await client.serialNumberEvent.create({
        data: {
          warehouseId: input.warehouseId,
          ownerClientId: input.ownerClientId,
          serialNumberId: serial.id,
          eventType: input.eventType,
          toLocationId: input.receivingLocationId,
          stockQuantId: input.stockQuant?.id ?? null,
          actorUserId: input.actor.id,
          referenceType: 'INBOUND_SHIPMENT',
          referenceId: input.inboundShipmentId,
          metadata: toJsonInput({
            inboundShipmentLineId: input.inboundShipmentLineId,
            lotId: input.lotId,
            stockQuantId: input.stockQuant?.id ?? null,
            serialStatus: input.status,
          }),
        },
      });

      serialIds.push(serial.id);
    }

    return serialIds;
  }

  private async linkOwnerResources(
    client: InboundPrismaClient,
    warehouseId: string,
    owner: OwnerClientRecord,
    resources: Array<{ resourceType: string; resourceId: string | null | undefined; metadata?: Record<string, unknown> | null }>,
  ): Promise<void> {
    const ownerClient = client as unknown as OwnerScopePrismaClient;
    for (const resource of resources) {
      await this.ownerScope.linkResourceToResolvedClient({
        warehouseId,
        clientId: owner.id,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        metadata: { inheritedOwnerClientCode: owner.code, ...(resource.metadata ?? {}) },
        client: ownerClient,
      });
    }
  }

  private getClient(): InboundPrismaClient {
    return this.prisma as unknown as InboundPrismaClient;
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.getClient().warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveParcel(warehouseId: string, parcelReference: string): Promise<Parcel> {
    const parcel = await this.getClient().parcel.findFirst({
      where: parcelReferenceWhere(warehouseId, parcelReference),
    });

    if (!parcel) {
      throw new NotFoundException('Parcel was not found');
    }

    return parcel;
  }

  private async resolveShipment(
    warehouseId: string,
    shipmentReference: string,
  ): Promise<InboundShipmentWithLines> {
    return this.resolveShipmentInClient(this.getClient(), warehouseId, shipmentReference);
  }

  private async resolveShipmentInClient(
    client: InboundPrismaClient,
    warehouseId: string,
    shipmentReference: string,
  ): Promise<InboundShipmentWithLines> {
    const shipment = await client.inboundShipment.findFirst({
      where: shipmentReferenceWhere(warehouseId, shipmentReference),
      include: inboundShipmentInclude,
    });

    if (!shipment) {
      throw new NotFoundException('Inbound shipment was not found');
    }

    return shipment;
  }

  private async resolveLine(
    shipmentId: string,
    lineReference: string,
  ): Promise<InboundShipmentLineWithParcel> {
    return this.resolveLineInClient(this.getClient(), shipmentId, lineReference);
  }

  private async resolveLineInClient(
    client: InboundPrismaClient,
    shipmentId: string,
    lineReference: string,
  ): Promise<InboundShipmentLineWithParcel> {
    const line = await client.inboundShipmentLine.findFirst({
      where: lineReferenceWhere(shipmentId, lineReference),
      include: { parcel: true },
    });

    if (!line) {
      throw new NotFoundException('Inbound shipment line was not found');
    }

    return line;
  }

  private async resolveReceiveLine(
    client: InboundPrismaClient,
    shipment: InboundShipmentWithLines,
    dto: ReceiveInboundLineDto,
  ): Promise<ReceiveLineResolution> {
    if (dto.lineReference) {
      const line = await this.resolveLineInClient(client, shipment.id, dto.lineReference);

      return {
        line,
        isUnexpected: readBooleanMetadata(line.metadata, 'unexpectedSku'),
      };
    }

    if (dto.allowUnexpectedSku !== true) {
      throw new ConflictException('lineReference is required unless allowUnexpectedSku is true');
    }

    if (!dto.sku) {
      throw new ConflictException('sku is required for unexpected SKU receiving');
    }

    const sku = await this.resolveSku(client, dto.sku);
    const line = await client.inboundShipmentLine.create({
      data: {
        shipmentId: shipment.id,
        parcelId: null,
        lineNumber: nextUnexpectedLineNumber(shipment),
        sku: sku.code,
        description: normalizeNullableString(dto.description),
        expectedQuantity: 0,
        receivedQuantity: 0,
        metadata: toJsonInput({
          ...(dto.metadata ?? {}),
          unexpectedSku: true,
          expectedQuantity: 0,
          source: 'unexpected_receive',
        }),
      },
      include: { parcel: true },
    });

    shipment.lines.push(line);

    return { line, isUnexpected: true };
  }

  private async resolveSku(client: InboundPrismaClient, skuReference: string): Promise<SkuRecord> {
    const sku = await client.sku.findFirst({
      where: skuReferenceWhere(skuReference),
    });

    if (!sku) {
      throw new NotFoundException('SKU was not found');
    }

    return sku;
  }

  private async resolveLocation(
    client: InboundPrismaClient,
    warehouseId: string,
    locationReference: string,
  ): Promise<WarehouseLocation> {
    const location = await client.warehouseLocation.findFirst({
      where: locationReferenceWhere(warehouseId, locationReference),
    });

    if (!location) {
      throw new NotFoundException('Warehouse location was not found');
    }

    return location;
  }

  private async resolveDockLocation(
    client: InboundPrismaClient,
    warehouseId: string,
    locationReference: string,
  ): Promise<WarehouseLocation> {
    const location = await this.resolveLocation(client, warehouseId, locationReference);

    if (!['RECEIVING', 'SHIPPING', 'BUFFER'].includes(location.type)) {
      throw new ConflictException(
        'Dock location must be a receiving, shipping, or buffer location',
      );
    }

    return location;
  }

  private async incrementOrCreateReceiveQuant(
    client: InboundPrismaClient,
    input: ReceiveQuantInput,
  ): Promise<StockQuantRecord> {
    await lockStockQuantIdentity(client, input);

    const existingQuant = await client.stockQuant.findFirst({
      where: {
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        skuId: input.skuId,
        status: input.status,
        ownerClientId: input.ownerClientId,
        lotId: input.lotId,
        batch: input.batch,
        expiryDate: input.expiry,
      },
    });

    if (existingQuant) {
      return client.stockQuant.update({
        where: { id: existingQuant.id },
        data: { quantity: { increment: input.quantity } },
      });
    }

    return client.stockQuant.create({
      data: {
        warehouseId: input.warehouseId,
        locationId: input.locationId,
        skuId: input.skuId,
        status: input.status,
        ownerClientId: input.ownerClientId,
        lotId: input.lotId,
        quantity: input.quantity,
        reservedQuantity: 0,
        batch: input.batch,
        expiryDate: input.expiry,
      },
    });
  }

  private async createPutawayTaskForReceive(
    client: InboundPrismaClient,
    input: ReceivePutawayTaskInput,
  ): Promise<WarehouseTaskRecord> {
    const targetLocation = input.putawayLocationReference
      ? await this.resolveLocation(client, input.warehouseId, input.putawayLocationReference)
      : await this.findSuggestedPutawayLocation(client, {
          warehouseId: input.warehouseId,
          sourceLocationId: input.receivingLocation.id,
          skuId: input.skuId,
          batch: input.quant.batch,
          expiry: input.quant.expiryDate,
        });

    if (targetLocation.id === input.receivingLocation.id) {
      throw new ConflictException(
        'Putaway target location must be different from receiving location',
      );
    }

    return client.warehouseTask.create({
      data: {
        warehouseId: input.warehouseId,
        type: 'PUTAWAY',
        status: 'OPEN',
        fromLocationId: input.receivingLocation.id,
        toLocationId: targetLocation.id,
        skuId: input.skuId,
        quantity: input.quantity,
        inboundShipmentId: input.shipment.id,
        inboundShipmentLineId: input.line.id,
        metadata: toJsonInput({
          ...(input.metadata ?? {}),
          stockQuantId: input.quant.id,
          shipmentNumber: input.shipment.shipmentNumber,
          inboundShipmentId: input.shipment.id,
          inboundShipmentLineId: input.line.id,
          lineNumber: input.line.lineNumber,
          source: 'inbound_receive',
        }),
      },
    });
  }

  private async createReceiveMovement(
    client: InboundPrismaClient,
    input: ReceiveMovementInput,
  ): Promise<StockMovementRecord> {
    return client.stockMovement.create({
      data: {
        warehouseId: input.warehouseId,
        skuId: input.quant.skuId,
        stockQuantId: input.quant.id,
        taskId: input.putawayTask?.id ?? null,
        actorUserId: input.actor.id,
        type: 'RECEIVE',
        quantity: input.quantity,
        toLocationId: input.receivingLocation.id,
        referenceType: 'INBOUND_SHIPMENT',
        referenceId: input.shipment.id,
        sourceSystem: input.idempotencyKey ? 'WMS' : null,
        idempotencyKey: input.idempotencyKey,
        metadata: toJsonInput({
          ...(input.metadata ?? {}),
          inboundShipmentId: input.shipment.id,
          inboundShipmentLineId: input.line.id,
          shipmentNumber: input.shipment.shipmentNumber,
          lineNumber: input.line.lineNumber,
          sku: input.line.sku,
          batch: input.batch,
          expiry: input.expiry ? input.expiry.toISOString().slice(0, 10) : null,
          stockCondition: input.condition,
          putawayTaskId: input.putawayTask?.id ?? null,
          exceptionIds: input.exceptionIds,
          quantityDelta: input.quantity,
        }),
      },
    });
  }

  private async createReceiveExceptions(
    client: InboundPrismaClient,
    input: ReceiveExceptionInput,
  ): Promise<WmsExceptionRecord[]> {
    const exceptions: WmsExceptionRecord[] = [];

    if (input.isUnexpected) {
      exceptions.push(
        await this.createReceiveException(client, {
          ...input,
          code: 'UNEXPECTED_SKU_RECEIVED',
          title: 'Unexpected SKU received',
          severity: 'HIGH',
          quantity: input.receivedQuantity,
          metadata: { expectedQuantity: 0 },
        }),
      );
    }

    if (input.overReceivedQuantity > 0) {
      exceptions.push(
        await this.createReceiveException(client, {
          ...input,
          code: 'OVER_RECEIVE',
          title: 'Inbound line over-received',
          severity: 'HIGH',
          quantity: input.overReceivedQuantity,
          metadata: { overReceivedQuantity: input.overReceivedQuantity },
        }),
      );
    }

    if (input.underReceivedQuantity > 0) {
      exceptions.push(
        await this.createReceiveException(client, {
          ...input,
          code: 'UNDER_RECEIVE',
          title: 'Inbound line completed short',
          severity: 'MEDIUM',
          quantity: input.underReceivedQuantity,
          metadata: { underReceivedQuantity: input.underReceivedQuantity },
        }),
      );
    }

    if (input.damagedQuantity > 0) {
      exceptions.push(
        await this.createReceiveException(client, {
          ...input,
          code: 'DAMAGED_GOODS_RECEIVED',
          title: 'Damaged goods received',
          severity: 'HIGH',
          quantity: input.damagedQuantity,
          metadata: {
            damagedQuantity: input.damagedQuantity,
            damageReason: normalizeNullableString(input.damageReason),
          },
        }),
      );
    }

    if (input.qualityCheck?.heldQuantity) {
      const isFailed = input.qualityCheck.status === 'FAILED';

      exceptions.push(
        await this.createReceiveException(client, {
          ...input,
          code: isFailed ? 'QUALITY_CHECK_FAILED' : 'QUALITY_CHECK_HOLD',
          title: isFailed ? 'Receiving quality check failed' : 'Receiving quality hold',
          severity: isFailed ? 'HIGH' : 'MEDIUM',
          quantity: input.qualityCheck.heldQuantity,
          metadata: {
            qualityStatus: input.qualityCheck.status,
            qualityReference: input.qualityCheck.reference,
            qualityNotes: input.qualityCheck.notes,
            heldQuantity: input.qualityCheck.heldQuantity,
          },
        }),
      );
    }

    return exceptions;
  }

  private async createReceiveException(
    client: InboundPrismaClient,
    input: CreateReceiveExceptionInput,
  ): Promise<WmsExceptionRecord> {
    return client.wmsException.create({
      data: {
        warehouseId: input.warehouseId,
        locationId: input.receivingLocation.id,
        createdByUserId: input.actor.id,
        code: input.code,
        title: input.title,
        description: `${input.title} for ${input.shipment.shipmentNumber} line ${input.line.lineNumber}.`,
        status: 'OPEN',
        severity: input.severity,
        metadata: toJsonInput({
          inboundShipmentId: input.shipment.id,
          inboundShipmentLineId: input.line.id,
          shipmentNumber: input.shipment.shipmentNumber,
          lineNumber: input.line.lineNumber,
          sku: input.sku,
          quantity: input.quantity,
          ...input.metadata,
        }),
      },
    });
  }

  private async findSuggestedPutawayLocation(
    client: InboundPrismaClient,
    input: PutawaySuggestionInput,
  ): Promise<WarehouseLocation> {
    const consolidationQuant = await client.stockQuant.findFirst({
      where: {
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        status: 'AVAILABLE',
        quantity: { gt: 0 },
        batch: input.batch,
        expiryDate: input.expiry,
        NOT: { locationId: input.sourceLocationId },
      },
      include: { location: true },
      orderBy: [{ quantity: 'desc' }, { updatedAt: 'desc' }],
    });

    if (consolidationQuant?.location) {
      return consolidationQuant.location;
    }

    const emptyLocation = await client.warehouseLocation.findFirst({
      where: {
        warehouseId: input.warehouseId,
        isActive: true,
        type: { in: ['STORAGE', 'PICKING'] },
        children: { none: {} },
        stockQuants: { none: { quantity: { gt: 0 } } },
        NOT: { id: input.sourceLocationId },
      },
      orderBy: [{ code: 'asc' }],
    });

    if (emptyLocation) {
      return emptyLocation;
    }

    const firstLocation = await client.warehouseLocation.findFirst({
      where: {
        warehouseId: input.warehouseId,
        isActive: true,
        type: { in: ['STORAGE', 'PICKING'] },
        children: { none: {} },
        NOT: { id: input.sourceLocationId },
      },
      orderBy: [{ code: 'asc' }],
    });

    if (!firstLocation) {
      throw new NotFoundException('No active storage location is available for putaway');
    }

    return firstLocation;
  }

  private resolveReceiveStatus(
    shipment: InboundShipmentWithLines,
    receivedLineId: string,
    receivedLineQuantity: number,
  ): InboundStatus {
    const allLinesReceived = shipment.lines.every((line) => {
      const quantity = line.id === receivedLineId ? receivedLineQuantity : line.receivedQuantity;

      return quantity >= line.expectedQuantity;
    });

    return allLinesReceived ? InboundStatus.RECEIVED : InboundStatus.RECEIVING;
  }

  private async findIdempotentReceive(
    warehouseId: string,
    rawIdempotencyKey: string | undefined,
  ): Promise<InboundReceiveResponse | null> {
    const idempotencyKey = normalizeNullableString(rawIdempotencyKey);

    if (!idempotencyKey) {
      return null;
    }

    const client = this.getClient();
    const movement = await client.stockMovement.findFirst({
      where: {
        warehouseId,
        sourceSystem: 'WMS',
        idempotencyKey,
      },
    });

    if (!movement) {
      return null;
    }

    if (movement.type !== 'RECEIVE') {
      throw new ConflictException(
        'Idempotency key has already been used for another movement type',
      );
    }

    const shipmentId =
      readStringMetadata(movement.metadata, 'inboundShipmentId') ?? movement.referenceId;
    const lineId = readStringMetadata(movement.metadata, 'inboundShipmentLineId');

    if (!shipmentId || !lineId || !movement.stockQuantId) {
      throw new ConflictException('Idempotent inbound receive movement is missing references');
    }

    const siblingMovements = await client.stockMovement.findMany({
      where: {
        warehouseId,
        sourceSystem: 'WMS',
        idempotencyKey: { startsWith: `${idempotencyKey}:` },
      },
      orderBy: { occurredAt: 'asc' },
    });
    const movements = [movement, ...siblingMovements];
    const exceptionIds = readStringArrayMetadata(movement.metadata, 'exceptionIds');
    const [shipment, quants, putawayTask, exceptions] = await Promise.all([
      this.resolveShipmentInClient(client, warehouseId, shipmentId),
      Promise.all(
        movements
          .map((item) => item.stockQuantId)
          .filter(isPresent)
          .map((stockQuantId) => this.resolveStockQuant(client, warehouseId, stockQuantId)),
      ),
      movement.taskId ? this.resolveWarehouseTask(client, warehouseId, movement.taskId) : null,
      exceptionIds.length
        ? client.wmsException.findMany({ where: { warehouseId, id: { in: exceptionIds } } })
        : [],
    ]);
    const line = shipment.lines.find((item) => item.id === lineId);
    const quant = quants[0];

    if (!line || !quant) {
      throw new NotFoundException('Inbound shipment line was not found');
    }

    const receivedQuantity = movements
      .filter((item) => receiveDisposition(item) !== 'DAMAGED')
      .reduce((sum, item) => sum + item.quantity, 0);
    const damagedQuantity = movements
      .filter((item) => receiveDisposition(item) === 'DAMAGED')
      .reduce((sum, item) => sum + item.quantity, 0);
    const qualityCheck = toIdempotentReceiveQualityCheck(movements);

    return {
      shipment: toInboundShipmentResponse(shipment),
      line: toInboundShipmentLineResponse(line),
      quant: toReceiveQuantResponse(quant),
      movement: toReceiveMovementResponse(movement),
      putawayTask: putawayTask ? toReceiveTaskResponse(putawayTask) : null,
      quants: quants.map(toReceiveQuantResponse),
      movements: movements.map(toReceiveMovementResponse),
      exceptions: exceptions.map(toReceiveExceptionResponse),
      receivedQuantity,
      damagedQuantity,
      qualityHeldQuantity: qualityCheck?.heldQuantity ?? 0,
      qualityCheck,
    };
  }

  private async resolveStockQuant(
    client: InboundPrismaClient,
    warehouseId: string,
    stockQuantId: string,
  ): Promise<StockQuantRecord> {
    const quant = await client.stockQuant.findFirst({
      where: { warehouseId, id: stockQuantId },
    });

    if (!quant) {
      throw new NotFoundException('Stock quant was not found');
    }

    return quant;
  }

  private async resolveWarehouseTask(
    client: InboundPrismaClient,
    warehouseId: string,
    taskId: string,
  ): Promise<WarehouseTaskRecord> {
    const task = await client.warehouseTask.findFirst({
      where: { warehouseId, id: taskId },
    });

    if (!task) {
      throw new NotFoundException('Warehouse task was not found');
    }

    return task;
  }

  private async toShipmentUpdateInput(
    client: InboundPrismaClient,
    warehouseId: string,
    existingShipment: InboundShipmentWithLines,
    dto: UpdateInboundShipmentDto,
  ): Promise<Record<string, unknown>> {
    const appointmentStartAt =
      dto.appointmentStartAt === undefined ? undefined : toOptionalDate(dto.appointmentStartAt);
    const appointmentEndAt =
      dto.appointmentEndAt === undefined ? undefined : toOptionalDate(dto.appointmentEndAt);
    const nextAppointmentStartAt =
      appointmentStartAt === undefined
        ? existingShipment.appointmentStartAt
        : (appointmentStartAt ?? null);
    const nextAppointmentEndAt =
      appointmentEndAt === undefined
        ? existingShipment.appointmentEndAt
        : (appointmentEndAt ?? null);
    const dockLocationId = await this.resolveUpdateDockLocationId(
      client,
      warehouseId,
      dto.dockLocationReference,
    );

    assertAppointmentWindow(nextAppointmentStartAt, nextAppointmentEndAt);

    return {
      ...(dto.shipmentNumber === undefined
        ? {}
        : { shipmentNumber: normalizeReference(dto.shipmentNumber) }),
      ...(dto.status === undefined ? {} : { status: dto.status }),
      ...(dto.supplierName === undefined
        ? {}
        : { supplierName: normalizeNullableString(dto.supplierName) }),
      ...(dto.supplierReference === undefined
        ? {}
        : { supplierReference: normalizeNullableString(dto.supplierReference) }),
      ...(dto.purchaseOrderReference === undefined
        ? {}
        : { purchaseOrderReference: normalizeNullableString(dto.purchaseOrderReference) }),
      ...(dto.externalReference === undefined
        ? {}
        : { externalReference: normalizeNullableString(dto.externalReference) }),
      ...(dockLocationId === undefined ? {} : { dockLocationId }),
      ...(dto.expectedAt === undefined ? {} : { expectedAt: toOptionalDate(dto.expectedAt) }),
      ...(appointmentStartAt === undefined
        ? {}
        : { appointmentStartAt: appointmentStartAt ?? null }),
      ...(appointmentEndAt === undefined ? {} : { appointmentEndAt: appointmentEndAt ?? null }),
      ...(dto.receivedAt === undefined ? {} : { receivedAt: toOptionalDate(dto.receivedAt) }),
      ...(dto.metadata === undefined ? {} : { metadata: toJsonInput(dto.metadata) }),
    };
  }

  private async resolveUpdateDockLocationId(
    client: InboundPrismaClient,
    warehouseId: string,
    locationReference: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (locationReference === undefined) {
      return undefined;
    }

    if (locationReference === null || locationReference.trim().length === 0) {
      return null;
    }

    return (await this.resolveDockLocation(client, warehouseId, locationReference)).id;
  }

  private async updateLine(
    warehouseId: string,
    shipmentId: string,
    dto: UpdateInboundShipmentLineDto,
  ): Promise<void> {
    if (!dto.lineReference) {
      throw new ConflictException('lineReference is required when updating inbound lines');
    }

    const line = await this.resolveLine(shipmentId, dto.lineReference);
    const parcelId = await this.resolveUpdateParcelId(warehouseId, dto);
    const data: Record<string, unknown> = {
      ...(dto.sku === undefined ? {} : { sku: dto.sku.trim() }),
      ...(dto.description === undefined
        ? {}
        : { description: normalizeNullableString(dto.description) }),
      ...(dto.expectedQuantity === undefined ? {} : { expectedQuantity: dto.expectedQuantity }),
      ...(dto.receivedQuantity === undefined ? {} : { receivedQuantity: dto.receivedQuantity }),
      ...(dto.metadata === undefined ? {} : { metadata: toJsonInput(dto.metadata) }),
      ...(parcelId === undefined ? {} : { parcelId }),
    };

    if (Object.keys(data).length > 0) {
      await this.getClient().inboundShipmentLine.update({
        where: { id: line.id },
        data,
        include: { parcel: true },
      });
    }
  }

  private async resolveUpdateParcelId(
    warehouseId: string,
    dto: UpdateInboundShipmentLineDto,
  ): Promise<string | null | undefined> {
    if (dto.parcelReference === undefined) {
      return undefined;
    }

    if (dto.parcelReference === null || dto.parcelReference.length === 0) {
      return null;
    }

    return (await this.resolveParcel(warehouseId, dto.parcelReference)).id;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    shipment: InboundShipment,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.writeAuditInClient(
      this.getClient(),
      actor,
      warehouseId,
      action,
      shipment,
      extraMetadata,
    );
  }

  private async writeAuditInClient(
    client: InboundPrismaClient,
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    shipment: InboundShipment,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'inbound_shipment',
        resourceId: shipment.id,
        metadata: {
          shipmentNumber: shipment.shipmentNumber,
          status: shipment.status,
          supplierReference: shipment.supplierReference,
          purchaseOrderReference: shipment.purchaseOrderReference,
          dockLocationId: shipment.dockLocationId,
          appointmentStartAt: shipment.appointmentStartAt,
          appointmentEndAt: shipment.appointmentEndAt,
          ...extraMetadata,
        },
      },
    });
  }
}

function toInboundShipmentResponse(shipment: InboundShipmentWithLines): InboundShipmentResponse {
  return {
    id: shipment.id,
    warehouseId: shipment.warehouseId,
    dockLocationId: shipment.dockLocationId,
    shipmentNumber: shipment.shipmentNumber,
    status: shipment.status,
    supplierName: shipment.supplierName,
    supplierReference: shipment.supplierReference,
    purchaseOrderReference: shipment.purchaseOrderReference,
    externalReference: shipment.externalReference,
    expectedAt: shipment.expectedAt,
    appointmentStartAt: shipment.appointmentStartAt,
    appointmentEndAt: shipment.appointmentEndAt,
    receivedAt: shipment.receivedAt,
    dockLocation: shipment.dockLocation
      ? toInboundDockLocationResponse(shipment.dockLocation)
      : null,
    metadata: shipment.metadata,
    lines: shipment.lines.map(toInboundShipmentLineResponse),
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

function toInboundShipmentLineResponse(
  line: InboundShipmentLineWithParcel,
): InboundShipmentLineResponse {
  return {
    id: line.id,
    shipmentId: line.shipmentId,
    lineNumber: line.lineNumber,
    sku: line.sku,
    description: line.description,
    expectedQuantity: line.expectedQuantity,
    receivedQuantity: line.receivedQuantity,
    parcel: line.parcel ? toInboundParcelResponse(line.parcel) : null,
    metadata: line.metadata,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function toInboundDockLocationResponse(location: WarehouseLocation): InboundDockLocationResponse {
  return {
    id: location.id,
    code: location.code,
    name: location.name,
    type: location.type,
  };
}

function toInboundParcelResponse(parcel: Parcel): InboundParcelResponse {
  return {
    id: parcel.id,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
  };
}

function toReceiveQuantResponse(quant: StockQuantRecord): InboundReceiveQuantResponse {
  return {
    id: quant.id,
    warehouseId: quant.warehouseId,
    locationId: quant.locationId,
    skuId: quant.skuId,
    quantity: quant.quantity,
    reservedQuantity: quant.reservedQuantity,
    status: quant.status,
    batch: quant.batch,
    expiryDate: quant.expiryDate,
  };
}

function toReceiveMovementResponse(movement: StockMovementRecord): InboundReceiveMovementResponse {
  return {
    id: movement.id,
    type: movement.type,
    quantity: movement.quantity,
    stockQuantId: movement.stockQuantId,
    taskId: movement.taskId,
    fromLocationId: movement.fromLocationId,
    toLocationId: movement.toLocationId,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    idempotencyKey: movement.idempotencyKey,
    occurredAt: movement.occurredAt,
  };
}

function toReceiveTaskResponse(task: WarehouseTaskRecord): InboundReceiveTaskResponse {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    fromLocationId: task.fromLocationId,
    toLocationId: task.toLocationId,
    skuId: task.skuId,
    quantity: task.quantity,
  };
}

function toReceiveExceptionResponse(
  exception: WmsExceptionRecord,
): InboundReceiveExceptionResponse {
  return {
    id: exception.id,
    code: exception.code,
    title: exception.title,
    status: exception.status,
    severity: exception.severity,
  };
}

function toReceiveQualityCheck(
  dto: ReceiveInboundLineDto,
  receivedQuantity: number,
): InboundReceiveQualityCheckResponse | null {
  if (!dto.qualityStatus) {
    return null;
  }

  return {
    status: dto.qualityStatus,
    reference: normalizeNullableString(dto.qualityReference),
    notes: normalizeNullableString(dto.qualityNotes),
    heldQuantity: ['HOLD', 'FAILED'].includes(dto.qualityStatus) ? receivedQuantity : 0,
  };
}

function toIdempotentReceiveQualityCheck(
  movements: StockMovementRecord[],
): InboundReceiveQualityCheckResponse | null {
  const qualityMovement = movements.find((movement) =>
    Boolean(readStringMetadata(movement.metadata, 'qualityStatus')),
  );

  if (!qualityMovement) {
    return null;
  }

  const rawStatus = readStringMetadata(qualityMovement.metadata, 'qualityStatus');

  if (rawStatus !== 'PASSED' && rawStatus !== 'HOLD' && rawStatus !== 'FAILED') {
    return null;
  }

  return {
    status: rawStatus,
    reference: readStringMetadata(qualityMovement.metadata, 'qualityReference'),
    notes: readStringMetadata(qualityMovement.metadata, 'qualityNotes'),
    heldQuantity: movements
      .filter((movement) => readStringMetadata(movement.metadata, 'qualityStatus') === rawStatus)
      .reduce(
        (sum, movement) => sum + readNumberMetadata(movement.metadata, 'qualityHeldQuantity'),
        0,
      ),
  };
}

function mergeReceiveMetadata(
  metadata: Record<string, unknown> | undefined,
  qualityCheck: InboundReceiveQualityCheckResponse | null,
  disposition: 'RECEIVED' | 'DAMAGED',
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    receivedDisposition: disposition,
    ...(qualityCheck
      ? {
          qualityStatus: qualityCheck.status,
          qualityReference: qualityCheck.reference,
          qualityNotes: qualityCheck.notes,
          qualityHeldQuantity: qualityCheck.heldQuantity,
        }
      : {}),
  };
}

function receiveDisposition(movement: StockMovementRecord): 'RECEIVED' | 'DAMAGED' {
  const disposition = readStringMetadata(movement.metadata, 'receivedDisposition');

  if (disposition === 'DAMAGED') {
    return 'DAMAGED';
  }

  if (disposition === 'RECEIVED') {
    return 'RECEIVED';
  }

  return readStringMetadata(movement.metadata, 'stockCondition') === 'AVAILABLE'
    ? 'RECEIVED'
    : 'DAMAGED';
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return { code: normalizeReference(reference) };
}

function parcelReferenceWhere(warehouseId: string, reference: string): Prisma.ParcelWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { trackingNumber: normalizeReference(reference) }],
    };
  }

  return {
    warehouseId,
    trackingNumber: normalizeReference(reference),
  };
}

function locationReferenceWhere(
  warehouseId: string,
  reference: string,
): Prisma.WarehouseLocationWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return {
    warehouseId,
    code: normalizeReference(reference),
  };
}

function skuReferenceWhere(reference: string): Prisma.SkuWhereInput {
  const normalized = reference.trim();

  if (isUuid(normalized)) {
    return {
      OR: [{ id: normalized }, { code: normalizeReference(normalized) }],
    };
  }

  return {
    OR: [{ code: normalizeReference(normalized) }, { barcode: normalized }],
  };
}

function shipmentReferenceWhere(warehouseId: string, reference: string): InboundShipmentWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { shipmentNumber: normalizeReference(reference) }],
    };
  }

  return {
    warehouseId,
    shipmentNumber: normalizeReference(reference),
  };
}

function lineReferenceWhere(shipmentId: string, reference: string): InboundShipmentLineWhereInput {
  if (isUuid(reference)) {
    return {
      shipmentId,
      OR: [{ id: reference }, { lineNumber: normalizeLineNumber(reference) }],
    };
  }

  return {
    shipmentId,
    lineNumber: normalizeLineNumber(reference),
  };
}

function normalizeReference(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeLineNumber(value: string): string {
  return value.trim();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function toOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value.trim().length === 0) {
    return null;
  }

  return new Date(value);
}

function assertAppointmentWindow(startAt: Date | null, endAt: Date | null): void {
  if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
    throw new ConflictException(
      'Appointment end must be greater than or equal to appointment start',
    );
  }
}

function assertReceiveSerialDistribution(input: {
  goodQuantity: number;
  damagedQuantity: number;
  goodSerialNumbers: string[];
  damagedSerialNumbers: string[];
  policy: TraceabilityPolicy;
}): void {
  const hasAnySerials = input.goodSerialNumbers.length + input.damagedSerialNumbers.length > 0;

  if (!input.policy.serialRequired && !hasAnySerials) {
    return;
  }

  if (input.goodSerialNumbers.length !== input.goodQuantity) {
    throw new ConflictException(
      `Inbound receive requires ${input.goodQuantity} good serial number${input.goodQuantity === 1 ? '' : 's'}; received ${input.goodSerialNumbers.length}`,
    );
  }

  if (input.damagedSerialNumbers.length !== input.damagedQuantity) {
    throw new ConflictException(
      `Inbound receive requires ${input.damagedQuantity} damaged serial number${input.damagedQuantity === 1 ? '' : 's'}; received ${input.damagedSerialNumbers.length}`,
    );
  }
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function readStringMetadata(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function readNumberMetadata(value: unknown, key: string): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 0;
  }

  const candidate = (value as Record<string, unknown>)[key];

  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
}

function readStringArrayMetadata(value: unknown, key: string): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }

  const candidate = (value as Record<string, unknown>)[key];

  return Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readBooleanMetadata(value: unknown, key: string): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>)[key] === true;
}

function mergeMetadata(value: unknown, next: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}),
    ...next,
  };
}

function nextUnexpectedLineNumber(shipment: InboundShipmentWithLines): string {
  const usedLineNumbers = new Set(shipment.lines.map((line) => line.lineNumber));
  let nextLineIndex =
    shipment.lines.filter((line) => line.lineNumber.startsWith('UNEXPECTED-')).length + 1;
  let lineNumber = `UNEXPECTED-${nextLineIndex}`;

  while (usedLineNumbers.has(lineNumber)) {
    nextLineIndex += 1;
    lineNumber = `UNEXPECTED-${nextLineIndex}`;
  }

  return lineNumber;
}

function appendIdempotencySuffix(value: string | undefined, suffix: string): string | null {
  const normalized = normalizeNullableString(value);

  return normalized ? `${normalized}:${suffix}` : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}

interface InboundPrismaClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  warehouse: {
    findFirst(args: { where: Prisma.WarehouseWhereInput }): Promise<Warehouse | null>;
  };
  parcel: {
    findFirst(args: { where: Prisma.ParcelWhereInput }): Promise<Parcel | null>;
  };
  warehouseLocation: {
    findFirst(args: Record<string, unknown>): Promise<WarehouseLocation | null>;
  };
  sku: {
    findFirst(args: { where: Prisma.SkuWhereInput }): Promise<SkuRecord | null>;
  };
  inboundShipment: {
    findMany(args: {
      where: InboundShipmentWhereInput;
      include: InboundShipmentInclude;
      orderBy: { createdAt: 'desc' };
      take?: number;
      skip?: number;
    }): Promise<InboundShipmentWithLines[]>;
    findFirst(args: {
      where: InboundShipmentWhereInput;
      include: InboundShipmentInclude;
    }): Promise<InboundShipmentWithLines | null>;
    create(args: {
      data: Record<string, unknown>;
      include: InboundShipmentInclude;
    }): Promise<InboundShipmentWithLines>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include: InboundShipmentInclude;
    }): Promise<InboundShipmentWithLines>;
  };
  inboundShipmentLine: {
    findFirst(args: {
      where: InboundShipmentLineWhereInput;
      include: InboundShipmentLineInclude;
    }): Promise<InboundShipmentLineWithParcel | null>;
    create(args: {
      data: Record<string, unknown>;
      include: InboundShipmentLineInclude;
    }): Promise<InboundShipmentLineWithParcel>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include: InboundShipmentLineInclude;
    }): Promise<InboundShipmentLineWithParcel>;
  };
  skuLot?: {
    findFirst(args: Record<string, unknown>): Promise<SkuLotRecord | null>;
    create(args: Record<string, unknown>): Promise<SkuLotRecord>;
  };
  serialNumber?: {
    findFirst(args: Record<string, unknown>): Promise<SerialNumberRecord | null>;
    create(args: Record<string, unknown>): Promise<SerialNumberRecord>;
    update(args: Record<string, unknown>): Promise<SerialNumberRecord>;
  };
  serialNumberEvent?: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  stockQuant: {
    findFirst(args: Record<string, unknown>): Promise<StockQuantWithLocation | null>;
    create(args: Record<string, unknown>): Promise<StockQuantRecord>;
    update(args: Record<string, unknown>): Promise<StockQuantRecord>;
  };
  stockMovement: {
    findFirst(args: Record<string, unknown>): Promise<StockMovementRecord | null>;
    findMany(args: Record<string, unknown>): Promise<StockMovementRecord[]>;
    create(args: Record<string, unknown>): Promise<StockMovementRecord>;
  };
  warehouseTask: {
    findFirst(args: Record<string, unknown>): Promise<WarehouseTaskRecord | null>;
    create(args: Record<string, unknown>): Promise<WarehouseTaskRecord>;
  };
  wmsException: {
    findMany(args: Record<string, unknown>): Promise<WmsExceptionRecord[]>;
    create(args: Record<string, unknown>): Promise<WmsExceptionRecord>;
  };
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

type InboundShipmentWhereInput = Record<string, unknown>;
type InboundShipmentLineWhereInput = Record<string, unknown>;

interface InboundShipmentInclude {
  dockLocation: true;
  lines: {
    include: InboundShipmentLineInclude;
    orderBy: { lineNumber: 'asc' };
  };
}

interface InboundShipmentLineInclude {
  parcel: true;
}

interface InboundShipment {
  id: string;
  warehouseId: string;
  dockLocationId: string | null;
  shipmentNumber: string;
  status: InboundStatus;
  supplierName: string | null;
  supplierReference: string | null;
  purchaseOrderReference: string | null;
  externalReference: string | null;
  expectedAt: Date | null;
  appointmentStartAt: Date | null;
  appointmentEndAt: Date | null;
  receivedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface InboundShipmentLine {
  id: string;
  shipmentId: string;
  lineNumber: string;
  sku: string;
  description: string | null;
  expectedQuantity: number;
  receivedQuantity: number;
  parcelId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface InboundShipmentLineWithParcel extends InboundShipmentLine {
  parcel: Parcel | null;
}

interface InboundShipmentWithLines extends InboundShipment {
  dockLocation: WarehouseLocation | null;
  lines: InboundShipmentLineWithParcel[];
}

interface SkuRecord {
  id: string;
  code: string;
  metadata?: unknown;
}

interface SkuLotRecord {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string;
  lotCode: string;
  batch: string | null;
  qualityStatus: string;
  status: string;
  expiryDate: Date | null;
  metadata?: unknown;
}

interface SerialNumberRecord {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string;
  lotId: string | null;
  stockQuantId: string | null;
  serialNumber: string;
  status: string;
  firstReceivedAt: Date | null;
  lastSeenLocationId: string | null;
  inboundShipmentLineId: string | null;
  outboundOrderLineId: string | null;
  metadata?: unknown;
}

interface StockQuantRecord {
  id: string;
  warehouseId: string;
  locationId: string;
  skuId: string;
  ownerClientId?: string | null;
  lotId?: string | null;
  quantity: number;
  reservedQuantity: number;
  status: string;
  batch: string | null;
  expiryDate: Date | null;
}

interface StockQuantWithLocation extends StockQuantRecord {
  location?: WarehouseLocation | null;
}

interface StockMovementRecord {
  id: string;
  warehouseId: string;
  skuId: string;
  stockQuantId: string | null;
  taskId: string | null;
  type: string;
  quantity: number;
  fromLocationId: string | null;
  toLocationId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  metadata: unknown;
  occurredAt: Date;
}

interface WmsExceptionRecord {
  id: string;
  warehouseId: string;
  code: string;
  title: string;
  status: string;
  severity: string;
  metadata?: unknown;
}

interface WarehouseTaskRecord {
  id: string;
  warehouseId: string;
  type: string;
  status: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  skuId: string | null;
  quantity: number | null;
  inboundShipmentId?: string | null;
  inboundShipmentLineId?: string | null;
  metadata?: unknown;
}

interface ReceiveQuantInput {
  warehouseId: string;
  locationId: string;
  skuId: string;
  quantity: number;
  status: 'AVAILABLE' | 'DAMAGED' | 'QUARANTINE';
  ownerClientId: string | null;
  lotId: string | null;
  batch: string | null;
  expiry: Date | null;
}

interface ReceiveLotInput {
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string;
  lotReference: string | null;
  batch: string | null;
  expiry: Date | null;
  qualityStatus: 'PASSED' | 'HOLD' | 'FAILED' | null;
  metadata: Record<string, unknown> | undefined;
}

interface ReceiveSerialCaptureInput {
  actor: AuthenticatedUser;
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string;
  lotId: string | null;
  inboundShipmentId: string;
  inboundShipmentLineId: string;
  receivingLocationId: string;
  goodQuant: StockQuantRecord | null;
  damagedQuant: StockQuantRecord | null;
  goodSerialNumbers: string[];
  damagedSerialNumbers: string[];
  metadata: Record<string, unknown> | undefined;
}

interface ReceiveSerialGroupInput extends Omit<ReceiveSerialCaptureInput, 'goodQuant' | 'damagedQuant' | 'goodSerialNumbers' | 'damagedSerialNumbers'> {
  stockQuant: StockQuantRecord | null;
  serialNumbers: string[];
  status: 'AVAILABLE' | 'BLOCKED' | 'DAMAGED';
  eventType: 'RECEIVED' | 'DAMAGED_RECEIVED';
}

interface ReceivePutawayTaskInput {
  warehouseId: string;
  shipment: InboundShipmentWithLines;
  line: InboundShipmentLineWithParcel;
  skuId: string;
  quant: StockQuantRecord;
  quantity: number;
  receivingLocation: WarehouseLocation;
  putawayLocationReference: string | undefined;
  metadata: Record<string, unknown> | undefined;
}

interface PutawaySuggestionInput {
  warehouseId: string;
  sourceLocationId: string;
  skuId: string;
  batch: string | null;
  expiry: Date | null;
}

interface ReceiveLineResolution {
  line: InboundShipmentLineWithParcel;
  isUnexpected: boolean;
}

interface ReceiveMovementInput {
  actor: AuthenticatedUser;
  warehouseId: string;
  shipment: InboundShipmentWithLines;
  line: InboundShipmentLineWithParcel;
  quant: StockQuantRecord;
  putawayTask: WarehouseTaskRecord | null;
  receivingLocation: WarehouseLocation;
  quantity: number;
  condition: string;
  batch: string | null;
  expiry: Date | null | undefined;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | undefined;
  exceptionIds: string[];
}

interface ReceiveExceptionInput {
  actor: AuthenticatedUser;
  warehouseId: string;
  shipment: InboundShipmentWithLines;
  line: InboundShipmentLineWithParcel;
  receivingLocation: WarehouseLocation;
  isUnexpected: boolean;
  receivedQuantity: number;
  overReceivedQuantity: number;
  underReceivedQuantity: number;
  damagedQuantity: number;
  damageReason: string | undefined;
  qualityCheck: InboundReceiveQualityCheckResponse | null;
  sku: string;
}

interface CreateReceiveExceptionInput extends ReceiveExceptionInput {
  code: string;
  title: string;
  severity: 'MEDIUM' | 'HIGH';
  quantity: number;
  metadata: Record<string, unknown>;
}
