import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { hasClientAccess, shouldEnforceClientAccess } from '../access-control/client-access.helpers';
import { AuthenticatedUser } from '../access-control/types';
import { OwnerClientRecord, OwnerScopePrismaClient, OwnerScopeService } from '../clients/owner-scope.service';
import { lockPostgresRowById, PrismaService, withTransactionRetry } from '../database';
import { assertNoBlockingStockFreeze } from '../inventory/stock-freeze.helpers';
import {
  assertTraceabilityCapture,
  normalizeSerialNumbers,
  resolveTraceabilityPolicy,
  TraceabilityPolicy,
} from '../traceability/traceability-policy.helpers';
import {
  OutboundStatus as PrismaOutboundStatus,
  Parcel,
  Prisma,
  Warehouse,
} from '../generated/prisma/client';
import { ConfirmPickDto } from './dto/confirm-pick.dto';
import { PackOrderDto, ReleasePickingDto, ShipOrderDto } from './dto/fulfillment-action.dto';
import {
  ConfirmPickResponse,
  FulfillmentActionResponse,
  FulfillmentOrderLineResponse,
  FulfillmentOrderResponse,
  FulfillmentParcelResponse,
  FulfillmentStatus,
} from './fulfillment.types';

const outboundOrderInclude: OutboundOrderInclude = {
  lines: {
    include: { parcel: true },
    orderBy: { lineNumber: 'asc' },
  },
};

@Injectable()
export class FulfillmentService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  releasePicking(
    warehouseReference: string,
    orderReference: string,
    dto: ReleasePickingDto,
    actor: AuthenticatedUser,
  ): Promise<FulfillmentActionResponse> {
    return this.transaction(async (tx) => {
      const warehouse = await this.resolveWarehouse(tx, warehouseReference);
      const order = await this.resolveOrder(tx, warehouse.id, orderReference);
      this.assertTransition(order, [FulfillmentStatus.ALLOCATED], FulfillmentStatus.PICKING);

      const existingOpenPickTasks = await this.countOpenPickTasks(tx, warehouse.id, order.id);
      const owner = await this.resolveOrderOwner(tx, warehouse.id, order.id);
      this.assertActorCanAccessOwner(actor, owner, warehouse.id);
      const updatedOrder = await this.updateOrderStatus(tx, order, FulfillmentStatus.PICKING, {
        releaseMetadata: dto.metadata,
        existingOpenPickTasks,
      });
      if (owner) {
        await this.linkOwnerResources(tx, warehouse.id, owner, [
          { resourceType: 'OUTBOUND_ORDER', resourceId: updatedOrder.id, metadata: { source: 'fulfillment.release_picking' } },
          ...updatedOrder.lines.map((line) => ({
            resourceType: 'OUTBOUND_ORDER_LINE',
            resourceId: line.id,
            metadata: { source: 'fulfillment.release_picking', outboundOrderId: updatedOrder.id },
          })),
        ]);
      }
      const tasksCreated = existingOpenPickTasks > 0
        ? 0
        : await this.createPickTasks(tx, warehouse.id, updatedOrder, dto, owner);

      await this.writeAudit(tx, actor, warehouse.id, 'fulfillment.picking_released', updatedOrder, {
        tasksCreated,
        releaseMetadata: dto.metadata ?? null,
      });

      return {
        order: toFulfillmentOrderResponse(updatedOrder),
        tasksCreated,
        movementsCreated: 0,
      };
    });
  }

  confirmPick(
    warehouseReference: string,
    taskReference: string,
    dto: ConfirmPickDto,
    actor: AuthenticatedUser,
  ): Promise<ConfirmPickResponse> {
    return this.transaction(async (tx) => {
      const warehouse = await this.resolveWarehouse(tx, warehouseReference);
      const task = await this.resolveWarehouseTask(tx, warehouse.id, taskReference);
      const order = await this.resolvePickOrder(tx, warehouse.id, task, dto);
      const owner = await this.resolveOrderOwner(tx, warehouse.id, order.id);
      this.assertActorCanAccessOwner(actor, owner, warehouse.id);
      this.assertCurrentStatus(order, FulfillmentStatus.PICKING);

      const line = this.resolvePickLine(order, task, dto);
      const remainingQuantity = line.orderedQuantity - line.pickedQuantity;

      if (remainingQuantity <= 0) {
        throw new ConflictException('Outbound line is already fully picked');
      }

      const pickQuantity = this.resolvePickQuantity(task, dto, remainingQuantity);

      if (pickQuantity > remainingQuantity) {
        throw new ConflictException('Pick quantity exceeds remaining outbound line quantity');
      }

      const reservation = await this.resolvePickReservation(tx, warehouse.id, line, task);
      const stockQuant = await this.resolvePickStockQuant(
        tx,
        warehouse.id,
        line,
        task,
        reservation,
      );
      const traceabilityPolicy = await this.resolveLineTraceabilityPolicy(tx, line);
      const pickSerialNumbers = assertTraceabilityCapture({
        operation: 'Confirm pick',
        quantity: pickQuantity,
        policy: traceabilityPolicy,
        serialNumbers: dto.serialNumbers,
        lotReference: stockQuant?.lotId ?? readMetadataString(line.metadata, 'lotReference', 'lotCode', 'batch'),
        expiry: stockQuant?.expiryDate ?? null,
      });
      await this.applyPickInventory(tx, stockQuant, reservation, pickQuantity);

      const updatedLine = await tx.outboundOrderLine.update({
        where: { id: line.id },
        data: { pickedQuantity: line.pickedQuantity + pickQuantity },
        include: { parcel: true },
      });
      const movementsCreated = await this.createStockMovement(tx, 'PICK', {
        warehouseId: warehouse.id,
        actorUserId: actor.id,
        order,
        line: updatedLine,
        task,
        reservation,
        stockQuant,
        quantity: pickQuantity,
        metadata: dto.metadata,
      });
      const serialsTransitioned = await this.transitionOutboundSerials(tx, {
        actor,
        warehouseId: warehouse.id,
        ownerClientId: owner?.id ?? null,
        skuId: stockQuant?.skuId ?? reservation?.skuId ?? null,
        outboundOrderId: order.id,
        outboundOrderLineId: line.id,
        stockQuant,
        serialNumbers: pickSerialNumbers,
        fromStatus: ['AVAILABLE', 'RESERVED'],
        toStatus: 'PICKED',
        eventType: 'PICKED',
        operation: 'Confirm pick',
        quantity: pickQuantity,
        requireExact: traceabilityPolicy.serialRequired,
        metadata: dto.metadata,
      });

      const updatedTask = await this.markPickTaskDone(tx, task);
      const refreshedOrder = await this.resolveOrder(tx, warehouse.id, order.id);
      const finalOrder = this.isOrderFullyPicked(refreshedOrder)
        ? await this.updateOrderStatus(tx, refreshedOrder, FulfillmentStatus.PICKED, {
            pickMetadata: dto.metadata,
          })
        : refreshedOrder;

      await this.writeAudit(tx, actor, warehouse.id, 'fulfillment.pick_confirmed', finalOrder, {
        taskId: updatedTask?.id ?? taskReference,
        lineId: updatedLine.id,
        quantity: pickQuantity,
        movementsCreated,
        serialsTransitioned,
        pickMetadata: dto.metadata ?? null,
      });

      return {
        order: toFulfillmentOrderResponse(finalOrder),
        tasksCreated: 0,
        movementsCreated,
        task: {
          id: updatedTask?.id ?? task?.id ?? null,
          status: updatedTask?.status ?? task?.status ?? 'DONE',
        },
        pickedLine: {
          id: updatedLine.id,
          lineNumber: updatedLine.lineNumber,
          pickedQuantity: updatedLine.pickedQuantity,
          orderedQuantity: updatedLine.orderedQuantity,
        },
      };
    });
  }

  pack(
    warehouseReference: string,
    orderReference: string,
    dto: PackOrderDto,
    actor: AuthenticatedUser,
  ): Promise<FulfillmentActionResponse> {
    return this.transaction(async (tx) => {
      const warehouse = await this.resolveWarehouse(tx, warehouseReference);
      const order = await this.resolveOrder(tx, warehouse.id, orderReference);
      const owner = await this.resolveOrderOwner(tx, warehouse.id, order.id);
      this.assertActorCanAccessOwner(actor, owner, warehouse.id);
      this.assertTransition(order, [FulfillmentStatus.PICKED], FulfillmentStatus.PACKED);

      const serialsTransitioned = await this.transitionOrderSerials(tx, {
        actor,
        warehouseId: warehouse.id,
        ownerClientId: owner?.id ?? null,
        order,
        serialNumbers: dto.serialNumbers,
        fromStatus: ['PICKED'],
        toStatus: 'PACKED',
        eventType: 'PACKED',
        operation: 'Pack order',
        metadata: dto.metadata,
      });
      const movementsCreated = await this.createLineMovements(
        tx,
        'PACK',
        warehouse.id,
        order,
        actor,
        dto.metadata,
      );
      const updatedOrder = await this.updateOrderStatus(tx, order, FulfillmentStatus.PACKED, {
        packageReference: dto.packageReference ?? null,
        packMetadata: dto.metadata,
      });

      await this.updateLineParcels(tx, warehouse.id, updatedOrder, 'PACKED');
      await this.writeParcelTrackingEvents(tx, actor, warehouse.id, updatedOrder, 'PACKED');
      await this.writeAudit(tx, actor, warehouse.id, 'fulfillment.order_packed', updatedOrder, {
        packageReference: dto.packageReference ?? null,
        movementsCreated,
        serialsTransitioned,
        packMetadata: dto.metadata ?? null,
      });

      return {
        order: toFulfillmentOrderResponse(updatedOrder),
        tasksCreated: 0,
        movementsCreated,
      };
    });
  }

  ship(
    warehouseReference: string,
    orderReference: string,
    dto: ShipOrderDto,
    actor: AuthenticatedUser,
  ): Promise<FulfillmentActionResponse> {
    return this.transaction(async (tx) => {
      const warehouse = await this.resolveWarehouse(tx, warehouseReference);
      const order = await this.resolveOrder(tx, warehouse.id, orderReference);
      const owner = await this.resolveOrderOwner(tx, warehouse.id, order.id);
      this.assertActorCanAccessOwner(actor, owner, warehouse.id);
      this.assertTransition(order, [FulfillmentStatus.PACKED], FulfillmentStatus.SHIPPED);

      const serialsTransitioned = await this.transitionOrderSerials(tx, {
        actor,
        warehouseId: warehouse.id,
        ownerClientId: owner?.id ?? null,
        order,
        serialNumbers: dto.serialNumbers,
        fromStatus: ['PACKED'],
        toStatus: 'SHIPPED',
        eventType: 'SHIPPED',
        operation: 'Ship order',
        metadata: dto.metadata,
      });
      const movementsCreated = await this.createLineMovements(
        tx,
        'SHIP',
        warehouse.id,
        order,
        actor,
        dto.metadata,
      );
      const updatedOrder = await this.updateOrderStatus(
        tx,
        order,
        FulfillmentStatus.SHIPPED,
        {
          shipMetadata: dto.metadata,
          trackingReference: dto.trackingReference ?? null,
        },
        compactRecord({
          carrier: dto.carrier === undefined ? undefined : normalizeNullableString(dto.carrier),
          serviceLevel:
            dto.serviceLevel === undefined ? undefined : normalizeNullableString(dto.serviceLevel),
          shippedAt: toOptionalDate(dto.shippedAt) ?? new Date(),
        }),
      );

      await this.updateLineParcels(tx, warehouse.id, updatedOrder, 'SHIPPED');
      await this.writeParcelTrackingEvents(tx, actor, warehouse.id, updatedOrder, 'SHIPPED');
      await this.writeAudit(tx, actor, warehouse.id, 'fulfillment.order_shipped', updatedOrder, {
        trackingReference: dto.trackingReference ?? null,
        movementsCreated,
        serialsTransitioned,
        shipMetadata: dto.metadata ?? null,
      });

      return {
        order: toFulfillmentOrderResponse(updatedOrder),
        tasksCreated: 0,
        movementsCreated,
      };
    });
  }


  private transaction<T>(fn: (client: FulfillmentTransactionClient) => Promise<T>): Promise<T> {
    return withTransactionRetry(() => this.getClient().$transaction(fn));
  }

  private getClient(): FulfillmentPrismaClient {
    return this.prisma as unknown as FulfillmentPrismaClient;
  }

  private async resolveWarehouse(
    client: FulfillmentTransactionClient,
    warehouseReference: string,
  ): Promise<Warehouse> {
    const warehouse = await client.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveOrder(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    orderReference: string,
  ): Promise<OutboundOrderWithLines> {
    const order = await client.outboundOrder.findFirst({
      where: orderReferenceWhere(warehouseId, orderReference),
      include: outboundOrderInclude,
    });

    if (!order) {
      throw new NotFoundException('Outbound order was not found');
    }

    return order;
  }

  private async resolvePickOrder(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    task: WarehouseTask | null,
    dto: ConfirmPickDto,
  ): Promise<OutboundOrderWithLines> {
    const orderReference =
      dto.orderReference ??
      task?.outboundOrderId ??
      readMetadataString(task?.metadata, 'outboundOrderId', 'orderId', 'orderReference');

    if (orderReference) {
      return this.resolveOrder(client, warehouseId, orderReference);
    }

    const lineReference =
      dto.lineReference ??
      task?.outboundOrderLineId ??
      readMetadataString(task?.metadata, 'outboundOrderLineId', 'lineId', 'lineReference');

    if (lineReference && isUuid(lineReference)) {
      const line = await client.outboundOrderLine.findFirst({
        where: { id: lineReference },
        include: { parcel: true },
      });

      if (line) {
        return this.resolveOrder(client, warehouseId, line.orderId);
      }
    }

    throw new ConflictException('Outbound order context is required to confirm pick');
  }

  private resolvePickLine(
    order: OutboundOrderWithLines,
    task: WarehouseTask | null,
    dto: ConfirmPickDto,
  ): OutboundOrderLineWithParcel {
    const lineReference =
      dto.lineReference ??
      task?.outboundOrderLineId ??
      readMetadataString(task?.metadata, 'outboundOrderLineId', 'lineId', 'lineReference');

    if (lineReference) {
      const line = order.lines.find((candidate) => matchesLineReference(candidate, lineReference));

      if (!line) {
        throw new NotFoundException('Outbound order line was not found');
      }

      return line;
    }

    if (order.lines.length === 1) {
      const [line] = order.lines;

      if (line) {
        return line;
      }
    }

    throw new ConflictException('Outbound line context is required to confirm pick');
  }

  private resolvePickQuantity(
    task: WarehouseTask | null,
    dto: ConfirmPickDto,
    remainingQuantity: number,
  ): number {
    return dto.quantity ?? positiveIntOrUndefined(task?.quantity) ?? remainingQuantity;
  }

  private async resolveWarehouseTask(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    taskReference: string,
  ): Promise<WarehouseTask | null> {
    if (!client.warehouseTask) {
      return null;
    }

    const task = await client.warehouseTask.findFirst({
      where: { warehouseId, id: taskReference },
    });

    if (!task) {
      throw new NotFoundException('Warehouse task was not found');
    }

    if (task.status === 'DONE') {
      throw new ConflictException('Warehouse task is already done');
    }

    if (task.type !== 'PICK') {
      throw new ConflictException('Only PICK tasks can confirm picking');
    }

    return task;
  }

  private async countOpenPickTasks(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    outboundOrderId: string,
  ): Promise<number> {
    if (!client.warehouseTask?.findMany) {
      return 0;
    }

    const tasks = await client.warehouseTask.findMany({
      where: {
        warehouseId,
        outboundOrderId,
        type: 'PICK',
        status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] },
      },
    });

    return tasks.length;
  }

  private async createPickTasks(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    order: OutboundOrderWithLines,
    dto: ReleasePickingDto,
    owner: OwnerClientRecord | null,
  ): Promise<number> {
    if (!client.warehouseTask) {
      return 0;
    }

    let tasksCreated = 0;

    for (const line of order.lines) {
      const remainingQuantity = line.orderedQuantity - line.pickedQuantity;

      if (remainingQuantity <= 0) {
        continue;
      }

      const reservations = await this.findLineReservations(client, warehouseId, line.id);

      if (reservations.length === 0) {
        throw new ConflictException(
          `Outbound line ${line.lineNumber} has no active reservation; allocate the order before releasing picking.`,
        );
      }

      for (const reservation of reservations) {
        const stockQuant = await this.resolveStockQuant(client, reservation.stockQuantId);
        const created = await this.createPickTask(
          client,
          warehouseId,
          order,
          line,
          reservation.quantity,
          reservation.skuId,
          {
            reservation,
            stockQuant,
          },
          dto,
          owner,
        );
        tasksCreated += created ? 1 : 0;
      }
    }

    return tasksCreated;
  }

  private async createPickTask(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    order: OutboundOrderWithLines,
    line: OutboundOrderLineWithParcel,
    quantity: number,
    skuId: string | null,
    stockContext: PickTaskStockContext | null,
    dto: ReleasePickingDto,
    owner: OwnerClientRecord | null,
  ): Promise<boolean> {
    if (!client.warehouseTask) {
      return false;
    }

    const duplicateWhere: Record<string, unknown> = {
      warehouseId,
      outboundOrderId: order.id,
      outboundOrderLineId: line.id,
      type: 'PICK',
      status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] },
    };

    if (stockContext?.reservation.id) {
      duplicateWhere['reservationId'] = stockContext.reservation.id;
    }

    const existingTask = await client.warehouseTask.findFirst({ where: duplicateWhere });

    if (existingTask) {
      return false;
    }

    const created = await client.warehouseTask.create({
      data: compactRecord({
        warehouseId,
        type: 'PICK',
        status: 'OPEN',
        skuId,
        fromLocationId: stockContext?.stockQuant?.locationId ?? undefined,
        outboundOrderId: order.id,
        outboundOrderLineId: line.id,
        reservationId: stockContext?.reservation.id ?? undefined,
        quantity,
        priority: 100,
        metadata: toJsonInput({
          orderNumber: order.orderNumber,
          lineNumber: line.lineNumber,
          sku: line.sku,
          releaseMetadata: dto.metadata ?? null,
        }),
      }),
    });

    if (owner) {
      await this.linkOwnerResources(client, warehouseId, owner, [
        { resourceType: 'WAREHOUSE_TASK', resourceId: created.id, metadata: { source: 'fulfillment.release_picking', taskType: 'PICK', outboundOrderId: order.id, outboundOrderLineId: line.id } },
        ...(stockContext?.reservation.id
          ? [{ resourceType: 'RESERVATION', resourceId: stockContext.reservation.id, metadata: { source: 'fulfillment.release_picking', outboundOrderId: order.id } }]
          : []),
      ]);
    }

    return true;
  }

  private resolveSku(
    client: FulfillmentTransactionClient,
    skuCode: string,
  ): Promise<InventorySku | null> {
    if (!client.sku) {
      return Promise.resolve(null);
    }

    return client.sku.findFirst({
      where: { code: normalizeReference(skuCode) },
    });
  }

  private async resolveLineTraceabilityPolicy(
    client: FulfillmentTransactionClient,
    line: OutboundOrderLineWithParcel,
  ): Promise<TraceabilityPolicy> {
    const sku = await this.resolveSku(client, line.sku);

    return resolveTraceabilityPolicy(sku?.metadata, line.metadata);
  }

  private async transitionOrderSerials(
    client: FulfillmentTransactionClient,
    input: OrderSerialTransitionInput,
  ): Promise<number> {
    const explicitSerialNumbers = normalizeSerialNumbers(input.serialNumbers);
    const explicitSerials = explicitSerialNumbers.length
      ? await this.findOutboundSerials(client, input.warehouseId, explicitSerialNumbers)
      : [];
    const orderLineIds = new Set(input.order.lines.map((line) => line.id));

    for (const serial of explicitSerials) {
      if (!serial.outboundOrderLineId || !orderLineIds.has(serial.outboundOrderLineId)) {
        throw new ConflictException(`Serial ${serial.serialNumber} does not belong to outbound order ${input.order.orderNumber}`);
      }
    }

    let transitioned = 0;

    for (const line of input.order.lines) {
      if (line.pickedQuantity <= 0) {
        continue;
      }

      const policy = await this.resolveLineTraceabilityPolicy(client, line);
      const explicitForLine = explicitSerials
        .filter((serial) => serial.outboundOrderLineId === line.id)
        .map((serial) => serial.serialNumber);
      const automaticForLine =
        explicitSerialNumbers.length || !policy.serialRequired
          ? []
          : (
              await this.findLineSerialsByStatus(
                client,
                input.warehouseId,
                line.id,
                input.fromStatus,
                line.pickedQuantity,
              )
            ).map((serial) => serial.serialNumber);
      const serialNumbers = explicitForLine.length ? explicitForLine : automaticForLine;
      const sku = await this.resolveSku(client, line.sku);

      transitioned += await this.transitionOutboundSerials(client, {
        actor: input.actor,
        warehouseId: input.warehouseId,
        ownerClientId: input.ownerClientId,
        skuId: sku?.id ?? null,
        outboundOrderId: input.order.id,
        outboundOrderLineId: line.id,
        stockQuant: null,
        serialNumbers,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        eventType: input.eventType,
        operation: input.operation,
        quantity: line.pickedQuantity,
        requireExact: policy.serialRequired,
        metadata: input.metadata,
      });
    }

    return transitioned;
  }

  private async transitionOutboundSerials(
    client: FulfillmentTransactionClient,
    input: SerialTransitionInput,
  ): Promise<number> {
    if (!client.serialNumber || !client.serialNumberEvent) {
      if (input.requireExact || normalizeSerialNumbers(input.serialNumbers).length > 0) {
        throw new ConflictException('Serial transition is required but traceability serial delegates are not available');
      }
      return 0;
    }

    let serialNumbers = normalizeSerialNumbers(input.serialNumbers);

    if (input.requireExact && serialNumbers.length === 0 && input.stockQuant) {
      const availableSerials = await client.serialNumber.findMany({
        where: {
          warehouseId: input.warehouseId,
          stockQuantId: input.stockQuant.id,
          status: { in: input.fromStatus },
        },
        orderBy: { createdAt: 'asc' },
        take: input.quantity,
      });
      serialNumbers = availableSerials.map((serial) => serial.serialNumber);
    }

    if (!input.requireExact && serialNumbers.length === 0) {
      return 0;
    }

    assertTraceabilityCapture({
      operation: input.operation,
      quantity: input.quantity,
      policy: { lotRequired: false, serialRequired: input.requireExact, expiryRequired: false },
      serialNumbers,
    });

    const serials = await this.findOutboundSerials(client, input.warehouseId, serialNumbers);

    if (serials.length !== serialNumbers.length) {
      const found = new Set(serials.map((serial) => serial.serialNumber));
      const missing = serialNumbers.filter((serialNumber) => !found.has(serialNumber));
      throw new ConflictException(`Serial number${missing.length === 1 ? '' : 's'} not found: ${missing.join(', ')}`);
    }

    for (const serial of serials) {
      if (input.skuId && serial.skuId !== input.skuId) {
        throw new ConflictException(`Serial ${serial.serialNumber} does not belong to the outbound line SKU`);
      }

      if (!input.fromStatus.includes(serial.status)) {
        throw new ConflictException(`Serial ${serial.serialNumber} must be ${input.fromStatus.join(' or ')} before ${input.toStatus}`);
      }

      if (serial.outboundOrderLineId && serial.outboundOrderLineId !== input.outboundOrderLineId) {
        throw new ConflictException(`Serial ${serial.serialNumber} is assigned to another outbound line`);
      }

      const updated = await client.serialNumber.update({
        where: { id: serial.id },
        data: {
          ownerClientId: input.ownerClientId ?? serial.ownerClientId,
          stockQuantId: input.toStatus === 'PICKED' ? null : serial.stockQuantId,
          status: input.toStatus,
          outboundOrderLineId: input.outboundOrderLineId,
          lastSeenLocationId: input.stockQuant?.locationId ?? serial.lastSeenLocationId,
          metadata: toJsonInput(mergeMetadata(serial.metadata, {
            ...(input.metadata ?? {}),
            outboundOrderId: input.outboundOrderId,
            outboundOrderLineId: input.outboundOrderLineId,
            serialLifecycleStatus: input.toStatus,
          })),
        },
      });

      await client.serialNumberEvent.create({
        data: {
          warehouseId: input.warehouseId,
          ownerClientId: input.ownerClientId ?? updated.ownerClientId,
          serialNumberId: updated.id,
          eventType: input.eventType,
          fromLocationId: input.stockQuant?.locationId ?? null,
          toLocationId: input.stockQuant?.locationId ?? null,
          stockQuantId: input.stockQuant?.id ?? serial.stockQuantId,
          actorUserId: input.actor.id,
          referenceType: 'OUTBOUND_ORDER',
          referenceId: input.outboundOrderId,
          metadata: toJsonInput({
            outboundOrderLineId: input.outboundOrderLineId,
            serialStatus: input.toStatus,
          }),
        },
      });
    }

    return serials.length;
  }

  private findOutboundSerials(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    serialNumbers: string[],
  ): Promise<SerialNumberRecord[]> {
    if (serialNumbers.length === 0 || !client.serialNumber) {
      return Promise.resolve([]);
    }

    return client.serialNumber.findMany({
      where: {
        warehouseId,
        serialNumber: { in: serialNumbers },
      },
    });
  }

  private findLineSerialsByStatus(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    outboundOrderLineId: string,
    statuses: string[],
    take: number,
  ): Promise<SerialNumberRecord[]> {
    if (!client.serialNumber) {
      return Promise.resolve([]);
    }

    return client.serialNumber.findMany({
      where: {
        warehouseId,
        outboundOrderLineId,
        status: { in: statuses },
      },
      orderBy: { createdAt: 'asc' },
      take,
    });
  }

  private findLineReservations(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    outboundOrderLineId: string,
  ): Promise<Reservation[]> {
    if (!client.reservation) {
      return Promise.resolve([]);
    }

    return client.reservation.findMany({
      where: {
        warehouseId,
        outboundOrderLineId,
        status: 'ACTIVE',
      },
    });
  }

  private async resolvePickReservation(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    line: OutboundOrderLineWithParcel,
    task: WarehouseTask | null,
  ): Promise<Reservation | null> {
    if (!client.reservation) {
      return null;
    }

    if (task?.reservationId) {
      const reservation = await client.reservation.findFirst({
        where: { warehouseId, id: task.reservationId },
      });

      if (!reservation) {
        throw new NotFoundException('Reservation was not found');
      }

      return reservation;
    }

    const reservations = await this.findLineReservations(client, warehouseId, line.id);

    return reservations[0] ?? null;
  }

  private async resolvePickStockQuant(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    line: OutboundOrderLineWithParcel,
    task: WarehouseTask | null,
    reservation: Reservation | null,
  ): Promise<StockQuant | null> {
    if (!client.stockQuant) {
      return Promise.resolve(null);
    }

    if (reservation) {
      const stockQuant = await this.resolveStockQuant(client, reservation.stockQuantId);

      if (!stockQuant) {
        throw new NotFoundException('Stock quant was not found');
      }

      return stockQuant;
    }

    const skuId = task?.skuId ?? (await this.resolveSku(client, line.sku))?.id;

    if (!skuId) {
      throw new ConflictException('SKU is required to reduce stock for picking');
    }

    const stockQuant = await client.stockQuant.findFirst({
      where: {
        warehouseId,
        skuId,
        status: 'AVAILABLE',
        ...(task?.fromLocationId ? { locationId: task.fromLocationId } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!stockQuant) {
      throw new ConflictException('Available stock was not found for picking');
    }

    return stockQuant;
  }

  private resolveStockQuant(
    client: FulfillmentTransactionClient,
    stockQuantId: string,
  ): Promise<StockQuant | null> {
    if (!client.stockQuant) {
      return Promise.resolve(null);
    }

    return client.stockQuant.findFirst({
      where: { id: stockQuantId },
    });
  }

  private async applyPickInventory(
    client: FulfillmentTransactionClient,
    stockQuant: StockQuant | null,
    reservation: Reservation | null,
    quantity: number,
  ): Promise<void> {
    if (!client.stockQuant) {
      return;
    }

    if (!stockQuant) {
      throw new ConflictException('Stock quant is required to reduce stock for picking');
    }

    await lockPostgresRowById(client, 'stock_quants', stockQuant.id);
    const lockedStockQuant = await this.resolveStockQuant(client, stockQuant.id);

    if (!lockedStockQuant) {
      throw new NotFoundException('Stock quant was not found');
    }

    await assertNoBlockingStockFreeze(client, {
      warehouseId: lockedStockQuant.warehouseId,
      stockQuantId: lockedStockQuant.id,
      locationId: lockedStockQuant.locationId,
      skuId: lockedStockQuant.skuId,
      operation: 'confirm pick',
    });

    if (lockedStockQuant.quantity < quantity || lockedStockQuant.reservedQuantity < quantity) {
      throw new ConflictException('Insufficient available or reserved stock for picking');
    }

    await client.stockQuant.update({
      where: { id: lockedStockQuant.id },
      data: {
        quantity: { decrement: quantity },
        reservedQuantity: { decrement: quantity },
      },
    });

    if (!client.reservation || !reservation) {
      return;
    }

    await client.reservation.update({
      where: { id: reservation.id },
      data:
        reservation.quantity <= quantity
          ? { status: 'PICKED' }
          : { quantity: { decrement: quantity } },
    });
  }

  private markPickTaskDone(
    client: FulfillmentTransactionClient,
    task: WarehouseTask | null,
  ): Promise<WarehouseTask | null> {
    if (!client.warehouseTask || !task) {
      return Promise.resolve(null);
    }

    return client.warehouseTask.update({
      where: { id: task.id },
      data: {
        status: 'DONE',
        completedAt: new Date(),
      },
    });
  }

  private isOrderFullyPicked(order: OutboundOrderWithLines): boolean {
    return (
      order.lines.length > 0 &&
      order.lines.every((line) => line.pickedQuantity >= line.orderedQuantity)
    );
  }

  private async createLineMovements(
    client: FulfillmentTransactionClient,
    type: StockMovementKind,
    warehouseId: string,
    order: OutboundOrderWithLines,
    actor: AuthenticatedUser,
    metadata: Record<string, unknown> | undefined,
  ): Promise<number> {
    let movementsCreated = 0;

    for (const line of order.lines) {
      if (line.pickedQuantity <= 0) {
        continue;
      }

      movementsCreated += await this.createStockMovement(client, type, {
        warehouseId,
        actorUserId: actor.id,
        order,
        line,
        quantity: line.pickedQuantity,
        metadata,
      });
    }

    return movementsCreated;
  }

  private async createStockMovement(
    client: FulfillmentTransactionClient,
    type: StockMovementKind,
    context: StockMovementContext,
  ): Promise<number> {
    if (!client.stockMovement) {
      return 0;
    }

    const skuId =
      context.reservation?.skuId ??
      context.stockQuant?.skuId ??
      context.task?.skuId ??
      (await this.resolveSku(client, context.line.sku))?.id;

    if (!skuId) {
      throw new ConflictException('SKU is required to create stock movement');
    }

    const movement = await client.stockMovement.create({
      data: compactRecord({
        warehouseId: context.warehouseId,
        skuId,
        stockQuantId: context.stockQuant?.id ?? undefined,
        reservationId: context.reservation?.id ?? undefined,
        taskId: context.task?.id ?? undefined,
        actorUserId: context.actorUserId,
        type,
        quantity: context.quantity,
        fromLocationId: context.stockQuant?.locationId ?? context.task?.fromLocationId ?? undefined,
        referenceType: 'outbound_order',
        referenceId: context.order.id,
        metadata: toJsonInput({
          orderNumber: context.order.orderNumber,
          lineNumber: context.line.lineNumber,
          sku: context.line.sku,
          fulfillmentAction: type,
          actionMetadata: context.metadata ?? null,
        }),
      }),
    });

    const owner = await this.resolveOrderOwner(client, context.warehouseId, context.order.id);
    if (owner) {
      await this.linkOwnerResources(client, context.warehouseId, owner, [
        { resourceType: 'STOCK_MOVEMENT', resourceId: movement.id, metadata: { source: `fulfillment.${type.toLowerCase()}`, movementType: type, outboundOrderId: context.order.id, outboundOrderLineId: context.line.id } },
        { resourceType: 'OUTBOUND_ORDER', resourceId: context.order.id, metadata: { source: `fulfillment.${type.toLowerCase()}` } },
        { resourceType: 'OUTBOUND_ORDER_LINE', resourceId: context.line.id, metadata: { source: `fulfillment.${type.toLowerCase()}`, outboundOrderId: context.order.id } },
        { resourceType: 'RESERVATION', resourceId: context.reservation?.id ?? null, metadata: { source: `fulfillment.${type.toLowerCase()}`, outboundOrderId: context.order.id } },
        { resourceType: 'WAREHOUSE_TASK', resourceId: context.task?.id ?? null, metadata: { source: `fulfillment.${type.toLowerCase()}`, outboundOrderId: context.order.id } },
      ]);
    }

    return 1;
  }

  private async resolveOrderOwner(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    outboundOrderId: string | null | undefined,
  ): Promise<OwnerClientRecord | null> {
    if (!outboundOrderId) return null;
    return this.ownerScope.findResourceOwner({
      warehouseId,
      resourceType: 'OUTBOUND_ORDER',
      resourceId: outboundOrderId,
      client: client as unknown as OwnerScopePrismaClient,
    });
  }

  private assertActorCanAccessOwner(
    actor: AuthenticatedUser,
    owner: OwnerClientRecord | null,
    warehouseId: string,
  ): void {
    if (!shouldEnforceClientAccess(actor)) {
      return;
    }

    if (!owner) {
      throw new ForbiddenException('Restricted client users cannot process unowned fulfillment resources.');
    }

    if (!hasClientAccess({ user: actor, clientReference: owner.id, warehouseReference: warehouseId })) {
      throw new ForbiddenException('User does not have access to the fulfillment owner client.');
    }
  }

  private async linkOwnerResources(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    owner: OwnerClientRecord,
    resources: Array<{ resourceType: string; resourceId: string | null | undefined; metadata?: Record<string, unknown> | null }>,
  ): Promise<void> {
    await this.ownerScope.ensureOwnedResourceLinks({
      warehouseId,
      clientId: owner.id,
      resources,
      metadata: { ownerClientReference: owner.code, sourceModule: 'fulfillment' },
      client: client as unknown as OwnerScopePrismaClient,
    });
  }

  private updateOrderStatus(
    client: FulfillmentTransactionClient,
    order: OutboundOrderWithLines,
    status: FulfillmentStatus,
    metadata: Record<string, unknown>,
    extraData: Record<string, unknown> = {},
  ): Promise<OutboundOrderWithLines> {
    return client.outboundOrder.update({
      where: { id: order.id },
      data: compactRecord({
        ...extraData,
        ...(status === FulfillmentStatus.PICKED && !canPersistPickedStatus() ? {} : { status }),
        metadata: toJsonInput(
          mergeMetadata(order.metadata, {
            fulfillmentStatus: status,
            fulfillmentUpdatedAt: new Date().toISOString(),
            ...metadata,
          }),
        ),
      }),
      include: outboundOrderInclude,
    });
  }

  private async updateLineParcels(
    client: FulfillmentTransactionClient,
    warehouseId: string,
    order: OutboundOrderWithLines,
    status: 'PACKED' | 'SHIPPED',
  ): Promise<void> {
    const parcelIds = uniqueStrings(order.lines.map((line) => line.parcelId));

    if (parcelIds.length === 0) {
      return;
    }

    await client.parcel.updateMany({
      where: {
        warehouseId,
        id: { in: parcelIds },
      },
      data: { status },
    });
  }

  private async writeParcelTrackingEvents(
    client: FulfillmentTransactionClient,
    actor: AuthenticatedUser,
    warehouseId: string,
    order: OutboundOrderWithLines,
    type: 'PACKED' | 'SHIPPED',
  ): Promise<void> {
    const parcelIds = uniqueStrings(order.lines.map((line) => line.parcelId));

    for (const parcelId of parcelIds) {
      await client.trackingEvent.create({
        data: {
          warehouseId,
          parcelId,
          actorUserId: actor.id,
          type,
          code: `FULFILLMENT_${type}`,
          message: `Outbound order ${order.orderNumber} ${type.toLowerCase()}`,
          metadata: {
            outboundOrderId: order.id,
            orderNumber: order.orderNumber,
          },
        },
      });
    }
  }

  private async writeAudit(
    client: FulfillmentTransactionClient,
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    order: OutboundOrderWithLines,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await client.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'outbound_order',
        resourceId: order.id,
        metadata: {
          orderNumber: order.orderNumber,
          status: order.status,
          fulfillmentStatus: getEffectiveFulfillmentStatus(order),
          ...metadata,
        },
      },
    });
  }

  private assertTransition(
    order: OutboundOrderWithLines,
    allowedCurrentStatuses: FulfillmentStatus[],
    nextStatus: FulfillmentStatus,
  ): void {
    const currentStatus = getEffectiveFulfillmentStatus(order);

    if (!allowedCurrentStatuses.includes(currentStatus)) {
      throw new ConflictException(
        `Outbound order must be ${allowedCurrentStatuses.join(' or ')} before ${nextStatus}`,
      );
    }
  }

  private assertCurrentStatus(
    order: OutboundOrderWithLines,
    expectedStatus: FulfillmentStatus,
  ): void {
    const currentStatus = getEffectiveFulfillmentStatus(order);

    if (currentStatus !== expectedStatus) {
      throw new ConflictException(`Outbound order must be ${expectedStatus}`);
    }
  }
}

function toFulfillmentOrderResponse(order: OutboundOrderWithLines): FulfillmentOrderResponse {
  return {
    id: order.id,
    warehouseId: order.warehouseId,
    orderNumber: order.orderNumber,
    status: order.status,
    fulfillmentStatus: getEffectiveFulfillmentStatus(order),
    customerReference: order.customerReference,
    recipientName: order.recipientName,
    carrier: order.carrier,
    serviceLevel: order.serviceLevel,
    shipBy: order.shipBy,
    shippedAt: order.shippedAt,
    metadata: order.metadata,
    lines: order.lines.map(toFulfillmentOrderLineResponse),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function toFulfillmentOrderLineResponse(
  line: OutboundOrderLineWithParcel,
): FulfillmentOrderLineResponse {
  return {
    id: line.id,
    orderId: line.orderId,
    lineNumber: line.lineNumber,
    sku: line.sku,
    description: line.description,
    orderedQuantity: line.orderedQuantity,
    pickedQuantity: line.pickedQuantity,
    parcel: line.parcel ? toFulfillmentParcelResponse(line.parcel) : null,
    metadata: line.metadata,
    createdAt: line.createdAt,
    updatedAt: line.updatedAt,
  };
}

function toFulfillmentParcelResponse(parcel: Parcel): FulfillmentParcelResponse {
  return {
    id: parcel.id,
    trackingNumber: parcel.trackingNumber,
    status: parcel.status,
  };
}

function getEffectiveFulfillmentStatus(order: OutboundOrder): FulfillmentStatus {
  const metadataStatus = readMetadataString(order.metadata, 'fulfillmentStatus');

  if (metadataStatus && isFulfillmentStatus(metadataStatus)) {
    return metadataStatus;
  }

  return isFulfillmentStatus(order.status) ? order.status : FulfillmentStatus.EXCEPTION;
}

function canPersistPickedStatus(): boolean {
  return Object.values(PrismaOutboundStatus as Record<string, string>).includes(
    FulfillmentStatus.PICKED,
  );
}

function isFulfillmentStatus(value: string): value is FulfillmentStatus {
  return Object.values(FulfillmentStatus).includes(value as FulfillmentStatus);
}

function matchesLineReference(line: OutboundOrderLine, reference: string): boolean {
  const normalized = normalizeLineNumber(reference);

  return line.id === reference || line.lineNumber === normalized;
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeReference(reference) }],
    };
  }

  return { code: normalizeReference(reference) };
}

function orderReferenceWhere(warehouseId: string, reference: string): OutboundOrderWhereInput {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { orderNumber: normalizeReference(reference) }],
    };
  }

  return {
    warehouseId,
    orderNumber: normalizeReference(reference),
  };
}

function mergeMetadata(
  metadata: unknown,
  extraMetadata: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...toMetadataObject(metadata),
    ...extraMetadata,
  };
}

function toMetadataObject(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

function readMetadataString(metadata: unknown, ...keys: string[]): string | undefined {
  const metadataObject = toMetadataObject(metadata);

  for (const key of keys) {
    const value = metadataObject[key];

    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      compacted[key] = value;
    }
  }

  return compacted;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string'))];
}

function positiveIntOrUndefined(value: number | null | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return undefined;
  }

  return value;
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

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type StockMovementKind = 'PICK' | 'PACK' | 'SHIP';
type OutboundOrderWhereInput = Record<string, unknown>;
type DelegateArgs = Record<string, unknown>;

interface FulfillmentPrismaClient extends FulfillmentTransactionClient {
  $transaction<T>(fn: (client: FulfillmentTransactionClient) => Promise<T>): Promise<T>;
}

interface FulfillmentTransactionClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  warehouse: {
    findFirst(args: { where: Prisma.WarehouseWhereInput }): Promise<Warehouse | null>;
  };
  outboundOrder: {
    findFirst(args: {
      where: OutboundOrderWhereInput;
      include: OutboundOrderInclude;
    }): Promise<OutboundOrderWithLines | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
      include: OutboundOrderInclude;
    }): Promise<OutboundOrderWithLines>;
  };
  outboundOrderLine: {
    findFirst(args: DelegateArgs): Promise<OutboundOrderLineWithParcel | null>;
    update(args: DelegateArgs): Promise<OutboundOrderLineWithParcel>;
  };
  parcel: {
    updateMany(args: DelegateArgs): Promise<unknown>;
  };
  trackingEvent: {
    create(args: DelegateArgs): Promise<unknown>;
  };
  auditLog: {
    create(args: DelegateArgs): Promise<unknown>;
  };
  sku?: {
    findFirst(args: DelegateArgs): Promise<InventorySku | null>;
  };
  stockQuant?: {
    findFirst(args: DelegateArgs): Promise<StockQuant | null>;
    update(args: DelegateArgs): Promise<StockQuant>;
  };
  reservation?: {
    findFirst(args: DelegateArgs): Promise<Reservation | null>;
    findMany(args: DelegateArgs): Promise<Reservation[]>;
    update(args: DelegateArgs): Promise<Reservation>;
  };
  warehouseTask?: {
    findFirst(args: DelegateArgs): Promise<WarehouseTask | null>;
    findMany?(args: DelegateArgs): Promise<WarehouseTask[]>;
    create(args: DelegateArgs): Promise<WarehouseTask>;
    update(args: DelegateArgs): Promise<WarehouseTask>;
  };
  stockMovement?: {
    create(args: DelegateArgs): Promise<StockMovement>;
  };
  serialNumber?: {
    findMany(args: DelegateArgs): Promise<SerialNumberRecord[]>;
    update(args: DelegateArgs): Promise<SerialNumberRecord>;
  };
  serialNumberEvent?: {
    create(args: DelegateArgs): Promise<unknown>;
  };
}

interface OutboundOrderInclude {
  lines: {
    include: OutboundOrderLineInclude;
    orderBy: { lineNumber: 'asc' };
  };
}

interface OutboundOrderLineInclude {
  parcel: true;
}

interface OutboundOrder {
  id: string;
  warehouseId: string;
  orderNumber: string;
  status: string;
  customerReference: string | null;
  recipientName: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  shipBy: Date | null;
  shippedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface OutboundOrderLine {
  id: string;
  orderId: string;
  lineNumber: string;
  sku: string;
  description: string | null;
  orderedQuantity: number;
  pickedQuantity: number;
  parcelId: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface OutboundOrderLineWithParcel extends OutboundOrderLine {
  parcel: Parcel | null;
}

interface OutboundOrderWithLines extends OutboundOrder {
  lines: OutboundOrderLineWithParcel[];
}

interface InventorySku {
  id: string;
  code: string;
  metadata?: unknown;
}

interface StockQuant {
  id: string;
  warehouseId: string;
  ownerClientId?: string | null;
  locationId: string;
  skuId: string;
  lotId?: string | null;
  quantity: number;
  reservedQuantity: number;
  status: string;
  batch?: string | null;
  expiryDate?: Date | null;
  parcelId?: string | null;
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
  firstReceivedAt?: Date | null;
  lastSeenLocationId: string | null;
  inboundShipmentLineId?: string | null;
  outboundOrderLineId: string | null;
  metadata?: unknown;
}

interface SerialTransitionInput {
  actor: AuthenticatedUser;
  warehouseId: string;
  ownerClientId: string | null;
  skuId: string | null;
  outboundOrderId: string;
  outboundOrderLineId: string;
  stockQuant: StockQuant | null;
  serialNumbers: string[] | undefined;
  fromStatus: string[];
  toStatus: 'PICKED' | 'PACKED' | 'SHIPPED';
  eventType: 'PICKED' | 'PACKED' | 'SHIPPED';
  operation: string;
  quantity: number;
  requireExact: boolean;
  metadata: Record<string, unknown> | undefined;
}

interface OrderSerialTransitionInput {
  actor: AuthenticatedUser;
  warehouseId: string;
  ownerClientId: string | null;
  order: OutboundOrderWithLines;
  serialNumbers: string[] | undefined;
  fromStatus: string[];
  toStatus: 'PACKED' | 'SHIPPED';
  eventType: 'PACKED' | 'SHIPPED';
  operation: string;
  metadata: Record<string, unknown> | undefined;
}

interface Reservation {
  id: string;
  warehouseId: string;
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
  stockQuantId: string;
  skuId: string;
  quantity: number;
  status: string;
  parcelId?: string | null;
}

interface WarehouseTask {
  id: string;
  warehouseId: string;
  type: string;
  status: string;
  skuId: string | null;
  fromLocationId: string | null;
  outboundOrderId: string | null;
  outboundOrderLineId: string | null;
  reservationId: string | null;
  quantity: number | null;
  metadata: unknown;
  parcelId?: string | null;
}

interface StockMovement {
  id: string;
}

interface PickTaskStockContext {
  reservation: Reservation;
  stockQuant: StockQuant | null;
}

interface StockMovementContext {
  warehouseId: string;
  actorUserId: string;
  order: OutboundOrderWithLines;
  line: OutboundOrderLineWithParcel;
  quantity: number;
  metadata: Record<string, unknown> | undefined;
  task?: WarehouseTask | null;
  reservation?: Reservation | null;
  stockQuant?: StockQuant | null;
}
