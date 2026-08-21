import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { OwnerClientRecord, OwnerScopePrismaClient, OwnerScopeService } from '../clients/owner-scope.service';
import { lockPostgresRowById, PrismaService, withTransactionRetry } from '../database';
import { assertNoBlockingStockFreeze } from '../inventory/stock-freeze.helpers';
import {
  QUANTITY_RESERVED_FIELDS,
  RuntimeRecord,
  STOCK_EXPIRY_FIELDS,
  STOCK_QUANTITY_FIELDS,
  activeReservationWhere,
  availableQuantity,
  getStockExpiry,
  isUuid,
  modelReferenceWhere,
  normalizeSku,
  toRecord,
  toReservationResponse,
  toRuntimeRecords,
  warehouseReferenceWhere,
} from '../reservations/reservation-mappers';
import {
  firstField,
  getDelegate,
  getModelFields,
  maybeDelegate,
  pickModelData,
  readDate,
  readNumber,
  readString,
} from '../reservations/reservation-prisma';
import { ReservationResponse, ReservationStatus } from '../reservations/reservations.types';
import { AllocateOutboundOrderDto } from './dto/allocate-outbound-order.dto';
import {
  AllocationLineResponse,
  AllocationMovementResponse,
  AllocationResponse,
  AllocationStrategy,
  AllocationTaskResponse,
} from './allocation.types';

@Injectable()
export class AllocationService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async allocateOutboundOrder(
    warehouseReference: string,
    orderReference: string,
    dto: AllocateOutboundOrderDto,
    actor: AuthenticatedUser,
  ): Promise<AllocationResponse> {
    return withTransactionRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const client = tx as unknown;
        const warehouse = await this.resolveWarehouse(client, warehouseReference);
        const warehouseId = requireStringId(warehouse, 'Warehouse');
        const order = await this.resolveOutboundOrder(client, warehouseId, orderReference);
        const owner = await this.resolveAllocationOwner(client, warehouseId, order, dto.ownerClientReference);

        return this.allocateOrderInTransaction(client, warehouseId, order, dto, actor, owner);
      }),
    );
  }

  private async allocateOrderInTransaction(
    client: unknown,
    warehouseId: string,
    order: RuntimeRecord,
    dto: AllocateOutboundOrderDto,
    actor: AuthenticatedUser,
    owner: OwnerClientRecord | null,
  ): Promise<AllocationResponse> {
    const lines = readOrderLines(order);

    if (lines.length === 0) {
      throw new ConflictException('Outbound order has no lines to allocate');
    }

    const orderId = requireStringId(order, 'OutboundOrder');
    const orderNumber = readString(order, 'orderNumber') ?? orderId;
    const allocationStrategy = normalizeAllocationStrategy(dto.allocationStrategy);
    const allocationLines: AllocationLineResponse[] = [];
    const reservations: ReservationResponse[] = [];
    const tasks: AllocationTaskResponse[] = [];
    const movements: AllocationMovementResponse[] = [];

    for (const line of lines) {
      const lineId = requireStringId(line, 'OutboundOrderLine');
      const orderedQuantity = getOrderedQuantity(line);
      const pickedQuantity = readNumber(line, 'pickedQuantity') ?? 0;
      const alreadyReservedQuantity = await this.countActiveReservations(client, lineId);
      const requiredQuantity = Math.max(
        orderedQuantity - pickedQuantity - alreadyReservedQuantity,
        0,
      );
      let allocatedQuantity = 0;

      if (requiredQuantity > 0) {
        const candidates = await this.findAvailableStockQuants(
          client,
          warehouseId,
          line,
          requiredQuantity,
          owner,
          allocationStrategy,
        );

        let remaining = requiredQuantity;

        for (const candidate of candidates) {
          if (remaining <= 0) {
            break;
          }

          const stockQuantFields = getModelFields(client, 'StockQuant');
          const quantityReservedField = firstField(stockQuantFields, QUANTITY_RESERVED_FIELDS);
          const available = availableQuantity(candidate, quantityReservedField);
          const quantity = Math.min(available, remaining);

          if (quantity <= 0) {
            continue;
          }

          const reservedStock = await this.reserveStockQuant(
            client,
            candidate,
            stockQuantFields,
            quantity,
          );
          const reservation = await this.createReservation(client, {
            warehouseId,
            order,
            line,
            stockQuant: candidate,
            reservedStockQuantId: reservedStock.reservedStockQuantId,
            quantity,
            actor,
            allocationStrategy,
            metadata: dto.metadata,
          });
          const task = await this.createPickTask(client, {
            warehouseId,
            order,
            line,
            stockQuant: candidate,
            reservation,
            reservedStockQuantId: reservedStock.reservedStockQuantId,
            quantity,
            actor,
            allocationStrategy,
            assignedToUserId: dto.assignedToUserId,
            metadata: dto.metadata,
          });
          const movement = await this.createStockMovement(client, {
            warehouseId,
            order,
            line,
            stockQuant: candidate,
            reservation,
            task,
            reservedStockQuantId: reservedStock.reservedStockQuantId,
            quantity,
            actor,
            allocationStrategy,
            metadata: dto.metadata,
          });

          if (owner) {
            await this.linkOwnerResources(client, warehouseId, owner, [
              { resourceType: 'OUTBOUND_ORDER', resourceId: orderId, metadata: { source: 'allocation' } },
              { resourceType: 'OUTBOUND_ORDER_LINE', resourceId: lineId, metadata: { source: 'allocation', outboundOrderId: orderId } },
              { resourceType: 'RESERVATION', resourceId: requireStringId(reservation, 'Reservation'), metadata: { source: 'allocation', outboundOrderId: orderId, outboundOrderLineId: lineId } },
              { resourceType: 'WAREHOUSE_TASK', resourceId: requireStringId(task, 'WarehouseTask'), metadata: { source: 'allocation', taskType: 'PICK', outboundOrderId: orderId } },
              { resourceType: 'STOCK_MOVEMENT', resourceId: requireStringId(movement, 'StockMovement'), metadata: { source: 'allocation', movementType: 'RESERVE' } },
              ...(reservedStock.reservedStockQuantId
                ? [{ resourceType: 'STOCK_QUANT', resourceId: reservedStock.reservedStockQuantId, metadata: { source: 'allocation.reserved_quant', parentStockQuantId: requireStringId(candidate, 'StockQuant') } }]
                : []),
            ]);
          }

          reservations.push(toReservationResponse(reservation));
          movements.push(toMovementResponse(movement));
          tasks.push(toTaskResponse(task));
          allocatedQuantity += quantity;
          remaining -= quantity;
        }
      }

      allocationLines.push({
        outboundOrderLineId: lineId,
        lineNumber: readString(line, 'lineNumber') ?? null,
        sku: readString(line, 'sku') ?? readString(line, 'skuCode') ?? null,
        orderedQuantity,
        pickedQuantity,
        alreadyReservedQuantity,
        allocatedQuantity,
        remainingQuantity: Math.max(requiredQuantity - allocatedQuantity, 0),
      });
    }

    const status = await this.markOrderAllocated(client, orderId);

    return {
      warehouseId,
      outboundOrderId: orderId,
      orderNumber,
      status,
      lines: allocationLines,
      reservations,
      tasks,
      movements,
    };
  }

  private async resolveAllocationOwner(
    client: unknown,
    warehouseId: string,
    order: RuntimeRecord,
    ownerClientReference?: string | null,
  ): Promise<OwnerClientRecord | null> {
    const orderId = requireStringId(order, 'OutboundOrder');
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
        resourceType: 'OUTBOUND_ORDER',
        resourceId: orderId,
        metadata: { source: 'allocation.owner_override' },
        client: ownerClient,
      });
      return owner;
    }

    return this.ownerScope.findResourceOwner({
      warehouseId,
      resourceType: 'OUTBOUND_ORDER',
      resourceId: orderId,
      client: ownerClient,
    });
  }

  private async linkOwnerResources(
    client: unknown,
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

  private async resolveOutboundOrder(
    client: unknown,
    warehouseId: string,
    orderReference: string,
  ): Promise<RuntimeRecord> {
    const outboundOrder = getDelegate<RuntimeRecord>(client, 'outboundOrder', 'OutboundOrder');
    const orderFields = getModelFields(client, 'OutboundOrder');
    const resolved = await outboundOrder.findFirst({
      where: {
        AND: [
          { warehouseId },
          modelReferenceWhere(orderFields, orderReference, ['orderNumber', 'code']),
        ],
      },
      include: {
        lines: {
          orderBy: { lineNumber: 'asc' },
        },
      },
    });

    if (!resolved) {
      throw new NotFoundException('Outbound order was not found');
    }

    return toRecord(resolved);
  }

  private async countActiveReservations(client: unknown, lineId: string): Promise<number> {
    const reservation = getDelegate<RuntimeRecord>(client, 'reservation', 'Reservation');
    const reservationFields = getModelFields(client, 'Reservation');
    const lineField = firstField(reservationFields, ['outboundOrderLineId', 'orderLineId']);

    if (!lineField) {
      return 0;
    }

    const existingReservations = await reservation.findMany({
      where: {
        [lineField]: lineId,
        ...activeReservationWhere(reservationFields),
      },
    });

    return existingReservations.reduce((sum, reservationRecord) => {
      return sum + (readNumber(toRecord(reservationRecord), 'quantity') ?? 0);
    }, 0);
  }

  private async findAvailableStockQuants(
    client: unknown,
    warehouseId: string,
    line: RuntimeRecord,
    requiredQuantity: number,
    owner: OwnerClientRecord | null,
    allocationStrategy: AllocationStrategy,
  ): Promise<RuntimeRecord[]> {
    const stockQuant = getDelegate<RuntimeRecord>(client, 'stockQuant', 'StockQuant');
    const stockQuantFields = getModelFields(client, 'StockQuant');
    const quantityReservedField = firstField(stockQuantFields, QUANTITY_RESERVED_FIELDS);
    const where = await this.buildStockQuantWhere(client, warehouseId, line, stockQuantFields);
    const args: RuntimeRecord = { where };

    if (stockQuantFields.has('createdAt')) {
      args['orderBy'] = { createdAt: 'asc' };
    }

    const ownerStockQuantIds = owner
      ? await this.ownerScope.findOwnedResourceIds({
          warehouseId,
          clientReference: owner.code,
          resourceType: 'STOCK_QUANT',
          client: client as unknown as OwnerScopePrismaClient,
        })
      : null;
    const ownerStockQuantSet = ownerStockQuantIds ? new Set(ownerStockQuantIds) : null;
    const candidates = toRuntimeRecords(await stockQuant.findMany(args))
      .filter((candidate) => {
        const candidateId = readString(candidate, 'id');
        return !ownerStockQuantSet || (candidateId ? ownerStockQuantSet.has(candidateId) : false);
      })
      .filter((candidate) => availableQuantity(candidate, quantityReservedField) > 0)
      .sort((left, right) => compareStockQuantForAllocation(left, right, allocationStrategy));
    const totalAvailable = candidates.reduce(
      (sum, candidate) => sum + availableQuantity(candidate, quantityReservedField),
      0,
    );

    if (totalAvailable < requiredQuantity) {
      const sku =
        readString(line, 'sku') ?? readString(line, 'skuCode') ?? readString(line, 'skuId');

      throw new ConflictException(
        `Insufficient available stock for SKU ${sku ?? 'unknown'}. Requested ${requiredQuantity}, available ${totalAvailable}.`,
      );
    }

    return candidates;
  }

  private async buildStockQuantWhere(
    client: unknown,
    warehouseId: string,
    line: RuntimeRecord,
    stockQuantFields: Set<string>,
  ): Promise<RuntimeRecord> {
    const where: RuntimeRecord = {
      ...(stockQuantFields.has('warehouseId') ? { warehouseId } : {}),
      ...buildAvailableStatusWhere(stockQuantFields),
    };
    const lineSkuId = readString(line, 'skuId');
    const lineSku = readString(line, 'sku') ?? readString(line, 'skuCode');

    if (stockQuantFields.has('skuId')) {
      if (lineSkuId) {
        where['skuId'] = lineSkuId;

        return where;
      }

      if (lineSku && isUuid(lineSku)) {
        where['skuId'] = lineSku;

        return where;
      }

      const skuId = lineSku ? await this.resolveSkuId(client, warehouseId, lineSku) : null;

      if (skuId) {
        where['skuId'] = skuId;

        return where;
      }
    }

    const skuTextField = firstField(stockQuantFields, ['sku', 'skuCode']);

    if (skuTextField && lineSku) {
      where[skuTextField] = normalizeSku(lineSku);

      return where;
    }

    throw new ConflictException(
      'Outbound order line does not expose a SKU that StockQuant can match',
    );
  }

  private async resolveSkuId(
    client: unknown,
    warehouseId: string,
    skuReference: string,
  ): Promise<string | null> {
    const sku = maybeDelegate<RuntimeRecord>(client, 'sku');

    if (!sku) {
      return null;
    }

    const skuFields = getModelFields(client, 'Sku');
    const codeField = firstField(skuFields, ['code', 'sku', 'skuCode']);
    const where: RuntimeRecord = {
      ...(skuFields.has('warehouseId') ? { warehouseId } : {}),
      ...(codeField ? { [codeField]: normalizeSku(skuReference) } : { id: skuReference }),
    };
    const resolved = await sku.findFirst({ where });

    if (!resolved) {
      throw new NotFoundException(`SKU ${normalizeSku(skuReference)} was not found`);
    }

    return readString(toRecord(resolved), 'id') ?? null;
  }

  private async lockAndReloadStockQuant(
    client: unknown,
    warehouseId: string,
    stockQuantId: string,
  ): Promise<RuntimeRecord> {
    await lockPostgresRowById(client, 'stock_quants', stockQuantId);
    const stockQuant = getDelegate<RuntimeRecord>(client, 'stockQuant', 'StockQuant');
    const resolved = await stockQuant.findFirst({
      where: { id: stockQuantId, warehouseId },
    });

    if (!resolved) {
      throw new NotFoundException('Stock quant was not found');
    }

    return toRecord(resolved);
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
      operation: 'allocate stock',
    });
    const quantityReservedField = firstField(stockQuantFields, QUANTITY_RESERVED_FIELDS);
    const available = availableQuantity(lockedStockQuant, quantityReservedField);

    if (quantity > available) {
      throw new ConflictException(
        `Insufficient available stock to allocate after row lock. Requested ${quantity}, available ${available}.`,
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

  private buildReservedStockQuantData(
    fields: Set<string>,
    stockQuant: RuntimeRecord,
    quantity: number,
    sourceStockQuantId: string,
  ): RuntimeRecord {
    const data: RuntimeRecord = {
      warehouseId: stockQuant['warehouseId'],
      locationId: stockQuant['locationId'],
      skuId: stockQuant['skuId'],
      sku: stockQuant['sku'],
      lotNumber: stockQuant['lotNumber'],
      status: 'RESERVED',
      state: 'RESERVED',
      sourceStockQuantId,
      parentStockQuantId: sourceStockQuantId,
      quantity,
    };

    for (const expiryField of STOCK_EXPIRY_FIELDS) {
      if (stockQuant[expiryField] !== undefined) {
        data[expiryField] = stockQuant[expiryField];
      }
    }

    return pickModelData(fields, data);
  }

  private async createReservation(
    client: unknown,
    params: AllocationWriteParams,
  ): Promise<RuntimeRecord> {
    const reservation = getDelegate<RuntimeRecord>(client, 'reservation', 'Reservation');
    const fields = getModelFields(client, 'Reservation');
    const orderId = requireStringId(params.order, 'OutboundOrder');
    const lineId = requireStringId(params.line, 'OutboundOrderLine');
    const stockQuantId = requireStringId(params.stockQuant, 'StockQuant');
    const data = pickModelData(fields, {
      warehouseId: params.warehouseId,
      stockQuantId,
      sourceStockQuantId: stockQuantId,
      reservedStockQuantId: params.reservedStockQuantId,
      targetStockQuantId: params.reservedStockQuantId,
      outboundOrderId: orderId,
      outboundOrderLineId: lineId,
      orderLineId: lineId,
      skuId: params.stockQuant['skuId'] ?? params.line['skuId'],
      sku: params.stockQuant['sku'] ?? params.line['sku'],
      quantity: params.quantity,
      status: ReservationStatus.ACTIVE,
      allocationStrategy: params.allocationStrategy,
      createdByUserId: params.actor.id,
      reservedByUserId: params.actor.id,
      metadata: params.metadata,
    });
    const created = await reservation.create({ data });

    return toRecord(created);
  }

  private async createStockMovement(
    client: unknown,
    params: AllocationSideEffectParams,
  ): Promise<RuntimeRecord> {
    const stockMovement = getDelegate<RuntimeRecord>(client, 'stockMovement', 'StockMovement');
    const fields = getModelFields(client, 'StockMovement');
    const orderId = requireStringId(params.order, 'OutboundOrder');
    const lineId = requireStringId(params.line, 'OutboundOrderLine');
    const stockQuantId = requireStringId(params.stockQuant, 'StockQuant');
    const reservationId = requireStringId(params.reservation, 'Reservation');
    const taskId = requireStringId(params.task, 'WarehouseTask');
    const data = pickModelData(fields, {
      warehouseId: params.warehouseId,
      type: 'RESERVE',
      movementType: 'RESERVE',
      reason: 'ALLOCATION',
      stockQuantId,
      sourceStockQuantId: stockQuantId,
      reservedStockQuantId: params.reservedStockQuantId,
      reservationId,
      taskId,
      fromLocationId: params.stockQuant['locationId'],
      referenceType: 'RESERVATION',
      referenceId: reservationId,
      outboundOrderId: orderId,
      outboundOrderLineId: lineId,
      orderLineId: lineId,
      skuId: params.stockQuant['skuId'] ?? params.line['skuId'],
      sku: params.stockQuant['sku'] ?? params.line['sku'],
      quantity: params.quantity,
      actorUserId: params.actor.id,
      createdByUserId: params.actor.id,
      metadata: withAllocationStrategyMetadata(params.metadata, params.allocationStrategy),
    });
    const created = await stockMovement.create({ data });

    return toRecord(created);
  }

  private async createPickTask(
    client: unknown,
    params: AllocationTaskParams,
  ): Promise<RuntimeRecord> {
    const warehouseTask = getDelegate<RuntimeRecord>(client, 'warehouseTask', 'WarehouseTask');
    const fields = getModelFields(client, 'WarehouseTask');
    const orderId = requireStringId(params.order, 'OutboundOrder');
    const lineId = requireStringId(params.line, 'OutboundOrderLine');
    const stockQuantId = requireStringId(params.stockQuant, 'StockQuant');
    const reservationId = requireStringId(params.reservation, 'Reservation');
    const data = pickModelData(fields, {
      warehouseId: params.warehouseId,
      type: 'PICK',
      taskType: 'PICK',
      status: 'OPEN',
      state: 'OPEN',
      reservationId,
      outboundOrderId: orderId,
      outboundOrderLineId: lineId,
      orderLineId: lineId,
      stockQuantId,
      sourceStockQuantId: stockQuantId,
      reservedStockQuantId: params.reservedStockQuantId,
      fromLocationId: params.stockQuant['locationId'],
      skuId: params.stockQuant['skuId'] ?? params.line['skuId'],
      sku: params.stockQuant['sku'] ?? params.line['sku'],
      quantity: params.quantity,
      assignedToUserId: params.assignedToUserId,
      assignedUserId: params.assignedToUserId,
      createdByUserId: params.actor.id,
      metadata: withAllocationStrategyMetadata(params.metadata, params.allocationStrategy),
    });
    const created = await warehouseTask.create({ data });

    return toRecord(created);
  }

  private async markOrderAllocated(client: unknown, orderId: string): Promise<string> {
    const outboundOrder = getDelegate<RuntimeRecord>(client, 'outboundOrder', 'OutboundOrder');
    const orderFields = getModelFields(client, 'OutboundOrder');

    if (!orderFields.has('status')) {
      return 'ALLOCATED';
    }

    const updated = await outboundOrder.update({
      where: { id: orderId },
      data: { status: 'ALLOCATED' },
    });

    return readString(toRecord(updated), 'status') ?? 'ALLOCATED';
  }
}

function readOrderLines(order: RuntimeRecord): RuntimeRecord[] {
  const lines = order['lines'];

  return Array.isArray(lines) ? lines.map(toRecord) : [];
}

function getOrderedQuantity(line: RuntimeRecord): number {
  return readNumber(line, 'orderedQuantity') ?? readNumber(line, 'quantity') ?? 0;
}

function buildAvailableStatusWhere(fields: Set<string>): RuntimeRecord {
  if (fields.has('status')) {
    return { status: 'AVAILABLE' };
  }

  if (fields.has('state')) {
    return { state: 'AVAILABLE' };
  }

  return {};
}

function normalizeAllocationStrategy(value: AllocationStrategy | string | undefined): AllocationStrategy {
  if (value && Object.values(AllocationStrategy).includes(value as AllocationStrategy)) {
    return value as AllocationStrategy;
  }

  return AllocationStrategy.FEFO;
}

function compareStockQuantForAllocation(
  left: RuntimeRecord,
  right: RuntimeRecord,
  strategy: AllocationStrategy,
): number {
  if (strategy === AllocationStrategy.LIFO) {
    return compareCreatedAt(right, left);
  }

  if (strategy === AllocationStrategy.FIFO) {
    return compareCreatedAt(left, right);
  }

  const leftExpiry = getStockExpiry(left);
  const rightExpiry = getStockExpiry(right);

  if (leftExpiry && rightExpiry && leftExpiry.valueOf() !== rightExpiry.valueOf()) {
    return leftExpiry.valueOf() - rightExpiry.valueOf();
  }

  if (leftExpiry && !rightExpiry) {
    return -1;
  }

  if (!leftExpiry && rightExpiry) {
    return 1;
  }

  return compareCreatedAt(left, right);
}

function compareCreatedAt(left: RuntimeRecord, right: RuntimeRecord): number {
  const leftCreatedAt = readDate(left, 'createdAt') ?? new Date(0);
  const rightCreatedAt = readDate(right, 'createdAt') ?? new Date(0);

  return leftCreatedAt.valueOf() - rightCreatedAt.valueOf();
}

function withAllocationStrategyMetadata(
  metadata: Record<string, unknown> | undefined,
  allocationStrategy: AllocationStrategy,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    allocationStrategy,
  };
}

function toTaskResponse(task: RuntimeRecord): AllocationTaskResponse {
  return {
    id: readString(task, 'id') ?? '',
    type: readString(task, 'type') ?? readString(task, 'taskType') ?? 'PICK',
    status: readString(task, 'status') ?? readString(task, 'state') ?? 'OPEN',
    quantity: readNumber(task, 'quantity') ?? 0,
  };
}

function toMovementResponse(movement: RuntimeRecord): AllocationMovementResponse {
  return {
    id: readString(movement, 'id') ?? '',
    type: readString(movement, 'type') ?? readString(movement, 'movementType') ?? 'RESERVE',
    quantity: readNumber(movement, 'quantity') ?? 0,
  };
}

function requireStringId(record: RuntimeRecord, label: string): string {
  const id = readString(record, 'id');

  if (!id) {
    throw new ConflictException(`${label} record is missing an id`);
  }

  return id;
}

interface ReservedStockResult {
  reservedStockQuantId: string | null;
}

interface AllocationWriteParams {
  warehouseId: string;
  order: RuntimeRecord;
  line: RuntimeRecord;
  stockQuant: RuntimeRecord;
  reservedStockQuantId: string | null;
  quantity: number;
  actor: AuthenticatedUser;
  allocationStrategy: AllocationStrategy;
  metadata: Record<string, unknown> | undefined;
}

interface AllocationSideEffectParams extends AllocationWriteParams {
  reservation: RuntimeRecord;
  task: RuntimeRecord;
}

interface AllocationTaskParams extends AllocationWriteParams {
  reservation: RuntimeRecord;
  assignedToUserId: string | undefined;
}
