import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { OwnerClientRecord, OwnerScopePrismaClient, OwnerScopeService } from '../clients/owner-scope.service';
import { lockPostgresRowById, PrismaService, withTransactionRetry } from '../database';
import { assertNoBlockingStockFreeze } from '../inventory/stock-freeze.helpers';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ListReservationsQueryDto } from './dto/list-reservations-query.dto';
import { ReleaseReservationDto } from './dto/release-reservation.dto';
import {
  firstField,
  getDelegate,
  getModelFields,
  pickModelData,
  readNumber,
  readString,
} from './reservation-prisma';
import {
  QUANTITY_RESERVED_FIELDS,
  RuntimeRecord,
  STOCK_EXPIRY_FIELDS,
  STOCK_QUANTITY_FIELDS,
  availableQuantity,
  modelReferenceWhere,
  normalizeSku,
  toRecord,
  toReservationResponse,
  warehouseReferenceWhere,
} from './reservation-mappers';
import { ReservationResponse, ReservationStatus } from './reservations.types';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async findMany(
    warehouseReference: string,
    query: ListReservationsQueryDto,
  ): Promise<ReservationResponse[]> {
    const client = this.prisma as unknown;
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const warehouseId = requireStringId(warehouse, 'Warehouse');
    const reservation = getDelegate<RuntimeRecord>(client, 'reservation', 'Reservation');
    const reservationFields = getModelFields(client, 'Reservation');
    const ownedReservationIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId,
      clientReference: query.ownerClientReference,
      resourceType: 'RESERVATION',
      client: client as OwnerScopePrismaClient,
    });
    const where = this.buildReservationListWhere(reservationFields, warehouseId, query);
    if (ownedReservationIds) {
      const andConditions = Array.isArray(where['AND']) ? [...(where['AND'] as RuntimeRecord[])] : [];
      andConditions.push({ id: { in: ownedReservationIds } });
      where['AND'] = andConditions;
    }
    const args: RuntimeRecord = { where };

    if (reservationFields.has('createdAt')) {
      args['orderBy'] = { createdAt: 'desc' };
    }

    const reservations = await reservation.findMany(args);

    return reservations.map((item) => toReservationResponse(toRecord(item)));
  }

  async findOne(
    warehouseReference: string,
    reservationReference: string,
  ): Promise<ReservationResponse> {
    const client = this.prisma as unknown;
    const warehouse = await this.resolveWarehouse(client, warehouseReference);
    const reservationRecord = await this.resolveReservation(
      client,
      requireStringId(warehouse, 'Warehouse'),
      reservationReference,
    );

    return toReservationResponse(reservationRecord);
  }

  async create(
    warehouseReference: string,
    dto: CreateReservationDto,
    actor: AuthenticatedUser,
  ): Promise<ReservationResponse> {
    const reservation = await withTransactionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const client = tx as unknown;
        const warehouse = await this.resolveWarehouse(client, warehouseReference);

        return this.createReservationInTransaction(client, warehouse, dto, actor);
      }),
    );

    return toReservationResponse(reservation);
  }

  async release(
    warehouseReference: string,
    reservationReference: string,
    dto: ReleaseReservationDto,
    actor: AuthenticatedUser,
  ): Promise<ReservationResponse> {
    return this.releaseWithStatus(
      warehouseReference,
      reservationReference,
      dto,
      actor,
      ReservationStatus.RELEASED,
    );
  }

  async cancel(
    warehouseReference: string,
    reservationReference: string,
    dto: ReleaseReservationDto,
    actor: AuthenticatedUser,
  ): Promise<ReservationResponse> {
    return this.releaseWithStatus(
      warehouseReference,
      reservationReference,
      dto,
      actor,
      ReservationStatus.CANCELLED,
    );
  }

  private async releaseWithStatus(
    warehouseReference: string,
    reservationReference: string,
    dto: ReleaseReservationDto,
    actor: AuthenticatedUser,
    targetStatus: typeof ReservationStatus.RELEASED | typeof ReservationStatus.CANCELLED,
  ): Promise<ReservationResponse> {
    const reservation = await withTransactionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const client = tx as unknown;
        const warehouse = await this.resolveWarehouse(client, warehouseReference);

        return this.releaseReservationInTransaction(
          client,
          warehouse,
          reservationReference,
          dto,
          actor,
          targetStatus,
        );
      }),
    );

    return toReservationResponse(reservation);
  }

  private async createReservationInTransaction(
    client: unknown,
    warehouse: RuntimeRecord,
    dto: CreateReservationDto,
    actor: AuthenticatedUser,
  ): Promise<RuntimeRecord> {
    const warehouseId = requireStringId(warehouse, 'Warehouse');
    const stockQuant = await this.resolveStockQuant(client, warehouseId, dto.stockQuantReference);
    const stockQuantFields = getModelFields(client, 'StockQuant');
    const quantityReservedField = firstField(stockQuantFields, QUANTITY_RESERVED_FIELDS);
    const available = availableQuantity(stockQuant, quantityReservedField);

    if (dto.quantity > available) {
      throw new ConflictException(
        `Insufficient available stock to reserve. Requested ${dto.quantity}, available ${available}.`,
      );
    }

    const orderContext = await this.resolveOrderContext(client, warehouseId, dto);
    const owner = await this.resolveReservationOwner(client, warehouseId, dto, stockQuant, orderContext);
    const reservedStock = await this.reserveStockQuant(
      client,
      stockQuant,
      stockQuantFields,
      dto.quantity,
    );
    const reservation = await this.createReservationRecord(client, {
      warehouseId,
      stockQuant,
      reservedStockQuantId: reservedStock.reservedStockQuantId,
      outboundOrderId: orderContext.outboundOrderId,
      outboundOrderLineId: orderContext.outboundOrderLineId,
      quantity: dto.quantity,
      metadata: dto.metadata,
      actor,
    });

    const movement = await this.createStockMovement(client, {
      warehouseId,
      stockQuant,
      reservation,
      reservedStockQuantId: reservedStock.reservedStockQuantId,
      outboundOrderId: orderContext.outboundOrderId,
      outboundOrderLineId: orderContext.outboundOrderLineId,
      quantity: dto.quantity,
      actor,
      metadata: dto.metadata,
    });

    const pickTask = orderContext.outboundOrderLineId
      ? await this.createPickTask(client, {
          warehouseId,
          stockQuant,
          reservation,
          reservedStockQuantId: reservedStock.reservedStockQuantId,
          outboundOrderId: orderContext.outboundOrderId,
          outboundOrderLineId: orderContext.outboundOrderLineId,
          quantity: dto.quantity,
          actor,
          metadata: dto.metadata,
        })
      : null;

    if (owner) {
      await this.linkReservationOwnerResources(client, warehouseId, owner, {
        stockQuantId: requireStringId(stockQuant, 'StockQuant'),
        reservedStockQuantId: reservedStock.reservedStockQuantId ?? null,
        reservationId: requireStringId(reservation, 'Reservation'),
        stockMovementId: readString(movement, 'id') ?? null,
        warehouseTaskId: pickTask ? readString(pickTask, 'id') ?? null : null,
        outboundOrderId: orderContext.outboundOrderId,
        outboundOrderLineId: orderContext.outboundOrderLineId,
      });
    }

    return reservation;
  }

  private async releaseReservationInTransaction(
    client: unknown,
    warehouse: RuntimeRecord,
    reservationReference: string,
    dto: ReleaseReservationDto,
    actor: AuthenticatedUser,
    targetStatus: typeof ReservationStatus.RELEASED | typeof ReservationStatus.CANCELLED,
  ): Promise<RuntimeRecord> {
    const warehouseId = requireStringId(warehouse, 'Warehouse');
    const reservationCandidate = await this.resolveReservation(client, warehouseId, reservationReference);
    const reservationId = requireStringId(reservationCandidate, 'Reservation');

    // Serialize the complete reservation lifecycle before touching reserved stock.
    // A concurrent release/cancel must wait, reload the row, and observe the
    // committed terminal status instead of decrementing reserved quantity twice.
    await lockPostgresRowById(client, 'reservations', reservationId);
    const reservation = await this.resolveReservation(client, warehouseId, reservationId);
    const currentStatus = readString(reservation, 'status') ?? ReservationStatus.ACTIVE;

    if (currentStatus !== ReservationStatus.ACTIVE) {
      throw new ConflictException(`Only ACTIVE reservations can be ${targetStatus.toLowerCase()}`);
    }

    const quantity = readNumber(reservation, 'quantity') ?? 0;

    if (quantity <= 0) {
      throw new ConflictException('Reservation quantity must be greater than zero');
    }

    const stockQuantId =
      readString(reservation, 'stockQuantId') ?? readString(reservation, 'sourceStockQuantId');

    if (!stockQuantId) {
      throw new ConflictException('Reservation is missing a stock quant reference');
    }

    const stockQuant = await this.resolveStockQuant(client, warehouseId, stockQuantId);

    await this.releaseReservedStockQuant(client, stockQuant, quantity);
    const tasksCancelled = await this.cancelOpenReservationTasks(
      client,
      warehouseId,
      reservationId,
    );
    const updatedReservation = await this.updateReservationStatus(client, {
      reservation,
      targetStatus,
      reason: dto.reason,
      metadata: dto.metadata,
      actor,
      tasksCancelled,
    });

    await this.createReleaseStockMovement(client, {
      warehouseId,
      stockQuant,
      reservation: updatedReservation,
      quantity,
      actor,
      targetStatus,
      reason: dto.reason,
      metadata: dto.metadata,
      tasksCancelled,
    });
    await this.writeReleaseAudit(client, {
      warehouseId,
      reservation: updatedReservation,
      actor,
      targetStatus,
      quantity,
      reason: dto.reason,
      tasksCancelled,
    });

    return updatedReservation;
  }

  private async resolveWarehouse(
    client: unknown,
    warehouseReference: string,
  ): Promise<RuntimeRecord> {
    const warehouse = getDelegate<RuntimeRecord>(client, 'warehouse', 'Warehouse');
    const resolved = await warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!resolved) {
      throw new NotFoundException('Warehouse was not found');
    }

    return toRecord(resolved);
  }

  private async resolveReservation(
    client: unknown,
    warehouseId: string,
    reservationReference: string,
  ): Promise<RuntimeRecord> {
    const reservation = getDelegate<RuntimeRecord>(client, 'reservation', 'Reservation');
    const reservationFields = getModelFields(client, 'Reservation');
    const where: RuntimeRecord = {
      AND: [
        { warehouseId },
        modelReferenceWhere(reservationFields, reservationReference, ['reservationNumber', 'code']),
      ],
    };
    const resolved = await reservation.findFirst({ where });

    if (!resolved) {
      throw new NotFoundException('Reservation was not found');
    }

    return toRecord(resolved);
  }

  private async resolveStockQuant(
    client: unknown,
    warehouseId: string,
    stockQuantReference: string,
  ): Promise<RuntimeRecord> {
    const stockQuant = getDelegate<RuntimeRecord>(client, 'stockQuant', 'StockQuant');
    const stockQuantFields = getModelFields(client, 'StockQuant');
    const where: RuntimeRecord = {
      AND: [
        { warehouseId },
        modelReferenceWhere(stockQuantFields, stockQuantReference, ['code', 'lotNumber']),
      ],
    };
    const resolved = await stockQuant.findFirst({ where });

    if (!resolved) {
      throw new NotFoundException('Stock quant was not found');
    }

    return toRecord(resolved);
  }

  private async resolveOrderContext(
    client: unknown,
    warehouseId: string,
    dto: CreateReservationDto,
  ): Promise<OrderContext> {
    if (dto.outboundOrderLineId) {
      const line = await this.resolveOutboundOrderLine(
        client,
        warehouseId,
        dto.outboundOrderLineId,
      );
      const lineOrderId = readString(line, 'orderId');

      if (dto.outboundOrderId && dto.outboundOrderId !== lineOrderId) {
        throw new ConflictException('Outbound order line does not belong to the outbound order');
      }

      return {
        outboundOrderId: lineOrderId ?? dto.outboundOrderId ?? null,
        outboundOrderLineId: readString(line, 'id') ?? dto.outboundOrderLineId,
      };
    }

    if (dto.outboundOrderId) {
      const order = await this.resolveOutboundOrder(client, warehouseId, dto.outboundOrderId);

      return {
        outboundOrderId: readString(order, 'id') ?? dto.outboundOrderId,
        outboundOrderLineId: null,
      };
    }

    return { outboundOrderId: null, outboundOrderLineId: null };
  }

  private async resolveOutboundOrder(
    client: unknown,
    warehouseId: string,
    orderId: string,
  ): Promise<RuntimeRecord> {
    const outboundOrder = getDelegate<RuntimeRecord>(client, 'outboundOrder', 'OutboundOrder');
    const resolved = await outboundOrder.findFirst({
      where: { id: orderId, warehouseId },
    });

    if (!resolved) {
      throw new NotFoundException('Outbound order was not found');
    }

    return toRecord(resolved);
  }

  private async resolveOutboundOrderLine(
    client: unknown,
    warehouseId: string,
    lineId: string,
  ): Promise<RuntimeRecord> {
    const outboundOrderLine = getDelegate<RuntimeRecord>(
      client,
      'outboundOrderLine',
      'OutboundOrderLine',
    );
    const resolved = await outboundOrderLine.findFirst({
      where: { id: lineId, order: { warehouseId } },
    });

    if (!resolved) {
      throw new NotFoundException('Outbound order line was not found');
    }

    return toRecord(resolved);
  }

  private buildReservationListWhere(
    fields: Set<string>,
    warehouseId: string,
    query: ListReservationsQueryDto,
  ): RuntimeRecord {
    return {
      ...(fields.has('warehouseId') ? { warehouseId } : {}),
      ...(query.status && fields.has('status') ? { status: query.status } : {}),
      ...(query.sku && fields.has('sku') ? { sku: normalizeSku(query.sku) } : {}),
      ...(query.outboundOrderId && fields.has('outboundOrderId')
        ? { outboundOrderId: query.outboundOrderId }
        : {}),
      ...(query.outboundOrderLineId && fields.has('outboundOrderLineId')
        ? { outboundOrderLineId: query.outboundOrderLineId }
        : {}),
    };
  }

  private async lockAndReloadStockQuant(
    client: unknown,
    warehouseId: string,
    stockQuantId: string,
  ): Promise<RuntimeRecord> {
    await lockPostgresRowById(client, 'stock_quants', stockQuantId);

    return this.resolveStockQuant(client, warehouseId, stockQuantId);
  }

  private async reserveStockQuant(
    client: unknown,
    stockQuant: RuntimeRecord,
    stockQuantFields: Set<string>,
    quantity: number,
  ): Promise<ReservedStockResult> {
    const stockQuantDelegate = getDelegate<RuntimeRecord>(client, 'stockQuant', 'StockQuant');
    const stockQuantId = requireStringId(stockQuant, 'StockQuant');
    const warehouseId = readString(stockQuant, 'warehouseId');

    if (!warehouseId) {
      throw new ConflictException('StockQuant record is missing warehouseId');
    }

    const lockedStockQuant = await this.lockAndReloadStockQuant(client, warehouseId, stockQuantId);
    await assertNoBlockingStockFreeze(client, {
      warehouseId,
      stockQuantId,
      locationId: readString(lockedStockQuant, 'locationId'),
      skuId: readString(lockedStockQuant, 'skuId'),
      operation: 'reserve stock',
    });
    const quantityReservedField = firstField(stockQuantFields, QUANTITY_RESERVED_FIELDS);
    const available = availableQuantity(lockedStockQuant, quantityReservedField);

    if (quantity > available) {
      throw new ConflictException(
        `Insufficient available stock to reserve after row lock. Requested ${quantity}, available ${available}.`,
      );
    }

    if (quantityReservedField) {
      await stockQuantDelegate.update({
        where: { id: stockQuantId },
        data: {
          [quantityReservedField]: { increment: quantity },
        },
      });

      return { reservedStockQuantId: null };
    }

    const quantityField = firstField(stockQuantFields, STOCK_QUANTITY_FIELDS);

    if (!quantityField) {
      throw new ConflictException('StockQuant does not expose a reservable quantity field');
    }

    await stockQuantDelegate.update({
      where: { id: stockQuantId },
      data: { [quantityField]: { decrement: quantity } },
    });

    const reservedQuant = await stockQuantDelegate.create({
      data: this.buildReservedStockQuantData(
        stockQuantFields,
        lockedStockQuant,
        quantity,
        stockQuantId,
      ),
    });

    return {
      reservedStockQuantId: readString(toRecord(reservedQuant), 'id') ?? null,
    };
  }

  private async releaseReservedStockQuant(
    client: unknown,
    stockQuant: RuntimeRecord,
    quantity: number,
  ): Promise<void> {
    const stockQuantDelegate = getDelegate<RuntimeRecord>(client, 'stockQuant', 'StockQuant');
    const stockQuantFields = getModelFields(client, 'StockQuant');
    const quantityReservedField = firstField(stockQuantFields, QUANTITY_RESERVED_FIELDS);

    if (!quantityReservedField) {
      throw new ConflictException('StockQuant does not expose a reserved quantity field');
    }

    const stockQuantId = requireStringId(stockQuant, 'StockQuant');
    const warehouseId = readString(stockQuant, 'warehouseId');

    if (!warehouseId) {
      throw new ConflictException('StockQuant record is missing warehouseId');
    }

    const lockedStockQuant = await this.lockAndReloadStockQuant(client, warehouseId, stockQuantId);
    await assertNoBlockingStockFreeze(client, {
      warehouseId,
      stockQuantId,
      locationId: readString(lockedStockQuant, 'locationId'),
      skuId: readString(lockedStockQuant, 'skuId'),
      operation: 'release reserved stock',
    });
    const currentReservedQuantity = readNumber(lockedStockQuant, quantityReservedField) ?? 0;

    if (currentReservedQuantity < quantity) {
      throw new ConflictException('Reservation release would make reserved quantity negative');
    }

    await stockQuantDelegate.update({
      where: { id: stockQuantId },
      data: {
        [quantityReservedField]: { decrement: quantity },
      },
    });
  }

  private async cancelOpenReservationTasks(
    client: unknown,
    warehouseId: string,
    reservationId: string,
  ): Promise<number> {
    const warehouseTask = getDelegate<RuntimeRecord>(client, 'warehouseTask', 'WarehouseTask');
    const fields = getModelFields(client, 'WarehouseTask');

    if (!fields.has('reservationId') || !fields.has('status')) {
      return 0;
    }

    const hasCompletedAt = fields.has('completedAt');
    const inProgressTask = await warehouseTask.findFirst({
      where: {
        warehouseId,
        reservationId,
        status: 'IN_PROGRESS',
      },
    });

    if (inProgressTask) {
      throw new ConflictException('Reservation has an in-progress task and cannot be released');
    }

    const result = await warehouseTask.updateMany({
      where: {
        warehouseId,
        reservationId,
        status: 'OPEN',
      },
      data: {
        status: 'CANCELLED',
        ...(hasCompletedAt ? { completedAt: new Date() } : {}),
      },
    });

    return result.count;
  }

  private buildReservedStockQuantData(
    fields: Set<string>,
    stockQuant: RuntimeRecord,
    quantity: number,
    sourceStockQuantId: string,
  ): RuntimeRecord {
    const copiedValues: RuntimeRecord = {
      warehouseId: stockQuant['warehouseId'],
      locationId: stockQuant['locationId'],
      skuId: stockQuant['skuId'],
      sku: stockQuant['sku'],
      lotNumber: stockQuant['lotNumber'],
      expiresAt: stockQuant['expiresAt'],
      expiryDate: stockQuant['expiryDate'],
      expirationDate: stockQuant['expirationDate'],
      status: 'RESERVED',
      state: 'RESERVED',
      sourceStockQuantId,
      parentStockQuantId: sourceStockQuantId,
      quantity,
    };

    for (const expiryField of STOCK_EXPIRY_FIELDS) {
      if (stockQuant[expiryField] !== undefined) {
        copiedValues[expiryField] = stockQuant[expiryField];
      }
    }

    return pickModelData(fields, copiedValues);
  }

  private async resolveReservationOwner(
    client: unknown,
    warehouseId: string,
    dto: CreateReservationDto,
    stockQuant: RuntimeRecord,
    orderContext: OrderContext,
  ): Promise<OwnerClientRecord | null> {
    const ownerClient = client as OwnerScopePrismaClient;
    const stockQuantId = requireStringId(stockQuant, 'StockQuant');
    const inheritedOwner = await this.ownerScope.resolveSingleOwnerFromResources({
      warehouseId,
      resources: [
        { resourceType: 'STOCK_QUANT', resourceId: stockQuantId },
        { resourceType: 'OUTBOUND_ORDER', resourceId: orderContext.outboundOrderId },
        { resourceType: 'OUTBOUND_ORDER_LINE', resourceId: orderContext.outboundOrderLineId },
      ],
      client: ownerClient,
    });
    const ownerReference = this.ownerScope.readOwnerClientReference({
      ownerClientReference: dto.ownerClientReference,
      metadata: dto.metadata,
    });

    if (!ownerReference) return inheritedOwner;

    const explicitOwner = await this.ownerScope.resolveOwnerClient({
      warehouseId,
      clientReference: ownerReference,
      client: ownerClient,
    });
    if (!explicitOwner) throw new ConflictException('Owner client reference is required.');

    if (inheritedOwner && inheritedOwner.id !== explicitOwner.id) {
      throw new ConflictException('Explicit owner client conflicts with stock/order ownership.');
    }

    return explicitOwner;
  }

  private async linkReservationOwnerResources(
    client: unknown,
    warehouseId: string,
    owner: OwnerClientRecord,
    resources: ReservationOwnerResourceIds,
  ): Promise<void> {
    await this.ownerScope.ensureOwnedResourceLinks({
      warehouseId,
      clientId: owner.id,
      resources: [
        { resourceType: 'STOCK_QUANT', resourceId: resources.stockQuantId, metadata: { source: 'reservations.create.source' } },
        { resourceType: 'STOCK_QUANT', resourceId: resources.reservedStockQuantId, metadata: { source: 'reservations.create.reserved', sourceStockQuantId: resources.stockQuantId } },
        { resourceType: 'RESERVATION', resourceId: resources.reservationId, metadata: { source: 'reservations.create' } },
        { resourceType: 'STOCK_MOVEMENT', resourceId: resources.stockMovementId, metadata: { source: 'reservations.create', reservationId: resources.reservationId } },
        { resourceType: 'WAREHOUSE_TASK', resourceId: resources.warehouseTaskId, metadata: { source: 'reservations.create', reservationId: resources.reservationId } },
        { resourceType: 'OUTBOUND_ORDER', resourceId: resources.outboundOrderId, metadata: { source: 'reservations.create', reservationId: resources.reservationId } },
        { resourceType: 'OUTBOUND_ORDER_LINE', resourceId: resources.outboundOrderLineId, metadata: { source: 'reservations.create', reservationId: resources.reservationId } },
      ],
      metadata: { inheritedOwnerClientCode: owner.code },
      client: client as OwnerScopePrismaClient,
    });
  }

  private async createReservationRecord(
    client: unknown,
    params: ReservationWriteParams,
  ): Promise<RuntimeRecord> {
    const reservation = getDelegate<RuntimeRecord>(client, 'reservation', 'Reservation');
    const fields = getModelFields(client, 'Reservation');
    const stockQuantId = requireStringId(params.stockQuant, 'StockQuant');
    const data = pickModelData(fields, {
      warehouseId: params.warehouseId,
      stockQuantId,
      sourceStockQuantId: stockQuantId,
      reservedStockQuantId: params.reservedStockQuantId,
      targetStockQuantId: params.reservedStockQuantId,
      outboundOrderId: params.outboundOrderId,
      outboundOrderLineId: params.outboundOrderLineId,
      orderLineId: params.outboundOrderLineId,
      skuId: params.stockQuant['skuId'],
      sku: params.stockQuant['sku'],
      quantity: params.quantity,
      status: ReservationStatus.ACTIVE,
      allocationStrategy: 'MANUAL',
      createdByUserId: params.actor.id,
      reservedByUserId: params.actor.id,
      metadata: params.metadata,
    });

    const created = await reservation.create({ data });

    return toRecord(created);
  }

  private async updateReservationStatus(
    client: unknown,
    params: ReservationReleaseUpdateParams,
  ): Promise<RuntimeRecord> {
    const reservation = getDelegate<RuntimeRecord>(client, 'reservation', 'Reservation');
    const fields = getModelFields(client, 'Reservation');
    const reservationId = requireStringId(params.reservation, 'Reservation');
    const data = pickModelData(fields, {
      status: params.targetStatus,
      metadata: mergeReservationMetadata(params.reservation['metadata'], {
        action: params.targetStatus,
        actorUserId: params.actor.id,
        reason: params.reason,
        metadata: params.metadata,
        tasksCancelled: params.tasksCancelled,
      }),
    });
    const updated = await reservation.update({
      where: { id: reservationId },
      data,
    });

    return toRecord(updated);
  }

  private async createStockMovement(
    client: unknown,
    params: ReservationSideEffectParams,
  ): Promise<RuntimeRecord> {
    const stockMovement = getDelegate<RuntimeRecord>(client, 'stockMovement', 'StockMovement');
    const fields = getModelFields(client, 'StockMovement');
    const stockQuantId = requireStringId(params.stockQuant, 'StockQuant');
    const reservationId = requireStringId(params.reservation, 'Reservation');
    const data = pickModelData(fields, {
      warehouseId: params.warehouseId,
      type: 'RESERVE',
      movementType: 'RESERVE',
      reason: 'RESERVATION',
      stockQuantId,
      sourceStockQuantId: stockQuantId,
      reservedStockQuantId: params.reservedStockQuantId,
      reservationId,
      fromLocationId: params.stockQuant['locationId'],
      referenceType: 'RESERVATION',
      referenceId: reservationId,
      outboundOrderId: params.outboundOrderId,
      outboundOrderLineId: params.outboundOrderLineId,
      orderLineId: params.outboundOrderLineId,
      skuId: params.stockQuant['skuId'],
      sku: params.stockQuant['sku'],
      quantity: params.quantity,
      actorUserId: params.actor.id,
      createdByUserId: params.actor.id,
      metadata: params.metadata,
    });

    return toRecord(await stockMovement.create({ data }));
  }

  private async createReleaseStockMovement(
    client: unknown,
    params: ReservationReleaseSideEffectParams,
  ): Promise<void> {
    const stockMovement = getDelegate<RuntimeRecord>(client, 'stockMovement', 'StockMovement');
    const fields = getModelFields(client, 'StockMovement');
    const stockQuantId = requireStringId(params.stockQuant, 'StockQuant');
    const reservationId = requireStringId(params.reservation, 'Reservation');
    const data = pickModelData(fields, {
      warehouseId: params.warehouseId,
      type: 'CANCEL_RESERVATION',
      movementType: 'CANCEL_RESERVATION',
      reason: params.targetStatus,
      stockQuantId,
      sourceStockQuantId: stockQuantId,
      reservationId,
      fromLocationId: params.stockQuant['locationId'],
      referenceType: 'RESERVATION',
      referenceId: reservationId,
      outboundOrderId: params.reservation['outboundOrderId'],
      outboundOrderLineId: params.reservation['outboundOrderLineId'],
      orderLineId: params.reservation['outboundOrderLineId'],
      skuId: params.stockQuant['skuId'] ?? params.reservation['skuId'],
      sku: params.stockQuant['sku'] ?? params.reservation['sku'],
      quantity: params.quantity,
      actorUserId: params.actor.id,
      createdByUserId: params.actor.id,
      metadata: {
        ...mergeReservationMetadata(params.metadata, {
          action: params.targetStatus,
          reason: params.reason,
          tasksCancelled: params.tasksCancelled,
          reservedQuantityDelta: -params.quantity,
        }),
        quantityDelta: 0,
        reservedQuantityDelta: -params.quantity,
      },
    });

    await stockMovement.create({ data });
  }

  private async writeReleaseAudit(
    client: unknown,
    params: ReservationReleaseAuditParams,
  ): Promise<void> {
    const auditLog = getDelegate<RuntimeRecord>(client, 'auditLog', 'AuditLog');
    const reservationId = requireStringId(params.reservation, 'Reservation');

    await auditLog.create({
      data: {
        actorUserId: params.actor.id,
        warehouseId: params.warehouseId,
        action:
          params.targetStatus === ReservationStatus.CANCELLED
            ? 'reservation.cancelled'
            : 'reservation.released',
        resourceType: 'reservation',
        resourceId: reservationId,
        metadata: {
          status: params.targetStatus,
          quantity: params.quantity,
          reason: params.reason ?? null,
          tasksCancelled: params.tasksCancelled,
        },
      },
    });
  }

  private async createPickTask(
    client: unknown,
    params: ReservationSideEffectParams,
  ): Promise<RuntimeRecord> {
    const warehouseTask = getDelegate<RuntimeRecord>(client, 'warehouseTask', 'WarehouseTask');
    const fields = getModelFields(client, 'WarehouseTask');
    const stockQuantId = requireStringId(params.stockQuant, 'StockQuant');
    const reservationId = requireStringId(params.reservation, 'Reservation');
    const data = pickModelData(fields, {
      warehouseId: params.warehouseId,
      type: 'PICK',
      taskType: 'PICK',
      status: 'OPEN',
      state: 'OPEN',
      reservationId,
      outboundOrderId: params.outboundOrderId,
      outboundOrderLineId: params.outboundOrderLineId,
      orderLineId: params.outboundOrderLineId,
      stockQuantId,
      sourceStockQuantId: stockQuantId,
      reservedStockQuantId: params.reservedStockQuantId,
      fromLocationId: params.stockQuant['locationId'],
      skuId: params.stockQuant['skuId'],
      sku: params.stockQuant['sku'],
      quantity: params.quantity,
      assignedUserId: undefined,
      createdByUserId: params.actor.id,
      metadata: params.metadata,
    });

    return toRecord(await warehouseTask.create({ data }));
  }
}

function requireStringId(record: RuntimeRecord, label: string): string {
  const id = readString(record, 'id');

  if (!id) {
    throw new ConflictException(`${label} record is missing an id`);
  }

  return id;
}

function mergeReservationMetadata(
  currentMetadata: unknown,
  releaseMetadata: ReservationReleaseMetadataInput,
): Record<string, unknown> {
  const current =
    currentMetadata && typeof currentMetadata === 'object' && !Array.isArray(currentMetadata)
      ? (currentMetadata as Record<string, unknown>)
      : {};
  const normalizedReason = releaseMetadata.reason?.trim();

  return {
    ...current,
    reservationRelease: {
      action: releaseMetadata.action,
      actorUserId: releaseMetadata.actorUserId,
      reason: normalizedReason && normalizedReason.length > 0 ? normalizedReason : null,
      metadata: releaseMetadata.metadata ?? null,
      tasksCancelled: releaseMetadata.tasksCancelled,
      reservedQuantityDelta: releaseMetadata.reservedQuantityDelta ?? null,
      releasedAt: new Date().toISOString(),
    },
  };
}

interface OrderContext {
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
}

interface ReservedStockResult {
  reservedStockQuantId: string | null;
}

interface ReservationOwnerResourceIds {
  stockQuantId: string;
  reservedStockQuantId: string | null;
  reservationId: string;
  stockMovementId: string | null;
  warehouseTaskId: string | null;
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
}

interface ReservationWriteParams {
  warehouseId: string;
  stockQuant: RuntimeRecord;
  reservedStockQuantId: string | null;
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
  quantity: number;
  actor: AuthenticatedUser;
  metadata: Record<string, unknown> | undefined;
}

interface ReservationSideEffectParams extends ReservationWriteParams {
  reservation: RuntimeRecord;
}

interface ReservationReleaseUpdateParams {
  reservation: RuntimeRecord;
  targetStatus: typeof ReservationStatus.RELEASED | typeof ReservationStatus.CANCELLED;
  reason: string | undefined;
  metadata: Record<string, unknown> | undefined;
  actor: AuthenticatedUser;
  tasksCancelled: number;
}

interface ReservationReleaseSideEffectParams {
  warehouseId: string;
  stockQuant: RuntimeRecord;
  reservation: RuntimeRecord;
  quantity: number;
  actor: AuthenticatedUser;
  targetStatus: typeof ReservationStatus.RELEASED | typeof ReservationStatus.CANCELLED;
  reason: string | undefined;
  metadata: Record<string, unknown> | undefined;
  tasksCancelled: number;
}

interface ReservationReleaseAuditParams {
  warehouseId: string;
  reservation: RuntimeRecord;
  actor: AuthenticatedUser;
  targetStatus: typeof ReservationStatus.RELEASED | typeof ReservationStatus.CANCELLED;
  quantity: number;
  reason: string | undefined;
  tasksCancelled: number;
}

interface ReservationReleaseMetadataInput {
  action: string;
  actorUserId?: string | null;
  reason?: string;
  metadata?: Record<string, unknown>;
  tasksCancelled?: number;
  reservedQuantityDelta?: number;
}
