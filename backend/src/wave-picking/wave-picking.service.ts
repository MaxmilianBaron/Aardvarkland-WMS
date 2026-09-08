import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { OwnerClientRecord, OwnerScopePrismaClient, OwnerScopeService } from '../clients/owner-scope.service';
import { normalizeOffsetPagination } from '../common';
import { PrismaService, withTransactionRetry } from '../database';
import { AssignPickCartDto } from './dto/assign-pick-cart.dto';
import { CreatePickCartDto } from './dto/create-pick-cart.dto';
import { CreatePickToteDto } from './dto/create-pick-tote.dto';
import { CreatePickWaveDto } from './dto/create-pick-wave.dto';
import { ListPickWavesQueryDto } from './dto/list-pick-waves-query.dto';
import { ReleasePickWaveDto } from './dto/release-pick-wave.dto';
import {
  buildWavePlan,
  calculatePickTaskSequence,
  canCompleteWave,
  canReleaseWave,
  makeWaveNumber,
  normalizeWaveNumber,
  WaveCandidateOrder,
} from './wave-picking.helpers';
import {
  PickCartResponse,
  PickCartStatus,
  PickToteResponse,
  PickToteStatus,
  PickWaveDetailResponse,
  PickWaveOrderResponse,
  PickWaveOrderStatus,
  PickWaveReleaseSummary,
  PickWaveResponse,
  PickWaveStatus,
  PickWaveStrategy,
  PickWaveTaskResponse,
} from './wave-picking.types';

@Injectable()
export class WavePickingService {
  constructor(private readonly prisma: PrismaService, private readonly ownerScope: OwnerScopeService) {}

  async listWaves(
    warehouseReference: string,
    query: ListPickWavesQueryDto = {},
  ): Promise<PickWaveResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const pagination = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 200 });
    const ownedWaveIds = await this.ownerScope.findOwnedResourceIds({
      warehouseId: warehouse.id,
      clientReference: query.ownerClientReference,
      resourceType: 'PICK_WAVE',
    });
    const waves = await this.client.pickWave.findMany({
      where: compactRecord({
        warehouseId: warehouse.id,
        status: query.status ? normalizeCode(query.status) : undefined,
        carrier: query.carrier ? normalizeCode(query.carrier) : undefined,
        zone: query.zone ? normalizeCode(query.zone) : undefined,
        id: ownedWaveIds ? { in: ownedWaveIds } : undefined,
      }),
      include: { _count: { select: { orders: true, tasks: true, carts: true, totes: true } } },
      orderBy: [{ priority: 'asc' }, { cutoffAt: 'asc' }, { createdAt: 'desc' }],
      take: pagination.take,
      skip: pagination.skip,
    });
    return waves.map(toWaveResponse);
  }

  async getWave(warehouseReference: string, waveReference: string): Promise<PickWaveDetailResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const wave = await this.resolveWave(warehouse.id, waveReference, {
      orders: { include: { outboundOrder: true }, orderBy: { sequence: 'asc' } },
      tasks: { include: { warehouseTask: true }, orderBy: { sequence: 'asc' } },
      carts: { include: { _count: { select: { totes: true } } }, orderBy: { code: 'asc' } },
      totes: { orderBy: { code: 'asc' } },
      _count: { select: { orders: true, tasks: true, carts: true, totes: true } },
    });
    return toWaveDetailResponse(wave);
  }

  async createWave(
    warehouseReference: string,
    dto: CreatePickWaveDto,
    actor: AuthenticatedUser,
  ): Promise<PickWaveDetailResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const waveNumber = normalizeWaveNumber(dto.waveNumber ?? makeWaveNumber());
    const strategy = normalizeCode(dto.strategy ?? PickWaveStrategy.BATCH);
    const candidates = await this.findWaveCandidateOrders(warehouse.id, dto);
    const plan = buildWavePlan(candidates, {
      carrier: dto.carrier ?? null,
      serviceLevel: dto.serviceLevel ?? null,
      zone: dto.zone ?? null,
      cutoffAt: dto.cutoffAt ?? null,
      maxOrders: dto.maxOrders,
    });
    const owner = await this.resolveOperationOwner(this.client, warehouse.id, dto.ownerClientReference, [
      ...plan.orders.map((order) => ({ resourceType: 'OUTBOUND_ORDER', resourceId: order.orderId })),
    ]);

    const wave = await this.client.pickWave.create({
      data: {
        warehouseId: warehouse.id,
        waveNumber,
        status: plan.status,
        priority: dto.priority ?? 100,
        strategy,
        carrier: normalizeOptionalCode(dto.carrier),
        serviceLevel: normalizeOptionalCode(dto.serviceLevel),
        zone: normalizeOptionalCode(dto.zone),
        cutoffAt: dto.cutoffAt ? new Date(dto.cutoffAt) : null,
        metadata: {
          ...(dto.metadata ?? {}),
          rejectedOrderIds: plan.rejectedOrderIds,
        },
        orders: {
          create: plan.orders.map((order) => ({
            warehouseId: warehouse.id,
            outboundOrderId: order.orderId,
            status: PickWaveOrderStatus.PLANNED,
            sequence: order.sequence,
            metadata: { priorityScore: order.priorityScore, orderNumber: order.orderNumber },
          })),
        },
      },
      include: {
        orders: { include: { outboundOrder: true }, orderBy: { sequence: 'asc' } },
        tasks: { include: { warehouseTask: true }, orderBy: { sequence: 'asc' } },
        carts: { include: { _count: { select: { totes: true } } }, orderBy: { code: 'asc' } },
        totes: { orderBy: { code: 'asc' } },
        _count: { select: { orders: true, tasks: true, carts: true, totes: true } },
      },
    });

    if (owner) {
      await this.linkOwnerResources(this.client, warehouse.id, owner, [
        { resourceType: 'PICK_WAVE', resourceId: wave.id, metadata: { source: 'wave.create', waveNumber: wave.waveNumber } },
        ...asArray<PickWaveOrderWithOrder>(wave.orders).map((order) => ({
          resourceType: 'PICK_WAVE_ORDER',
          resourceId: order.id,
          metadata: { source: 'wave.create', pickWaveId: wave.id, outboundOrderId: order.outboundOrderId },
        })),
      ]);
    }

    await this.writeAudit(actor.id, warehouse.id, 'pick_wave.created', 'pick_wave', wave.id, {
      waveNumber: wave.waveNumber,
      orderCount: plan.orders.length,
      strategy,
    });
    await this.writeOutbox('PICK_WAVE_CREATED', 'pick_wave', wave.id, {
      warehouseId: warehouse.id,
      waveNumber: wave.waveNumber,
      orderCount: plan.orders.length,
    });

    return toWaveDetailResponse(wave);
  }

  async releaseWave(
    warehouseReference: string,
    waveReference: string,
    dto: ReleasePickWaveDto,
    actor: AuthenticatedUser,
  ): Promise<PickWaveReleaseSummary> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    return this.transaction(async (tx) => {
      const wave = await this.resolveWaveWithClient(tx, warehouse.id, waveReference, {
        orders: { include: { outboundOrder: { include: { lines: true } } }, orderBy: { sequence: 'asc' } },
        tasks: true,
      });
      if (!canReleaseWave(wave.status)) {
        throw new ConflictException(`Pick wave cannot be released from status ${String(wave.status)}.`);
      }
      const owner = await this.resolveOperationOwner(tx, warehouse.id, null, [
        { resourceType: 'PICK_WAVE', resourceId: wave.id },
        ...asArray<PickWaveOrderWithOrder>(wave.orders).map((order) => ({
          resourceType: 'OUTBOUND_ORDER',
          resourceId: order.outboundOrderId,
        })),
      ]);
      if (owner) {
        await this.linkOwnerResources(tx, warehouse.id, owner, [
          { resourceType: 'PICK_WAVE', resourceId: wave.id, metadata: { source: 'wave.release', waveNumber: wave.waveNumber } },
        ]);
      }

      const taskRecords: WarehouseTaskRecord[] = [];
      let tasksCreated = 0;
      for (const waveOrder of asArray<PickWaveOrderWithOrder>(wave.orders)) {
        const existingTasks = await tx.warehouseTask.findMany({
          where: {
            warehouseId: warehouse.id,
            outboundOrderId: waveOrder.outboundOrderId,
            type: 'PICK',
            status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] },
          },
          include: { fromLocation: true },
        });
        taskRecords.push(...existingTasks);

        if (existingTasks.length === 0 && dto.createMissingPickTasks !== false) {
          const reservations = await tx.reservation.findMany({
            where: {
              warehouseId: warehouse.id,
              outboundOrderId: waveOrder.outboundOrderId,
              status: 'ACTIVE',
            },
            include: { stockQuant: true },
            orderBy: { createdAt: 'asc' },
          });
          for (const reservation of asArray<ReservationWithQuant>(reservations)) {
            const created = await tx.warehouseTask.create({
              data: {
                warehouseId: warehouse.id,
                type: 'PICK',
                status: 'OPEN',
                skuId: reservation.skuId,
                fromLocationId: reservation.stockQuant?.locationId ?? null,
                outboundOrderId: waveOrder.outboundOrderId,
                outboundOrderLineId: reservation.outboundOrderLineId ?? null,
                reservationId: reservation.id,
                quantity: reservation.quantity,
                priority: wave.priority,
                metadata: { createdByWaveId: wave.id, waveNumber: wave.waveNumber },
              },
              include: { fromLocation: true },
            });
            taskRecords.push(created);
            if (owner) {
              await this.linkOwnerResources(tx, warehouse.id, owner, [
                {
                  resourceType: 'WAREHOUSE_TASK',
                  resourceId: created.id,
                  metadata: { source: 'wave.release.create_task', pickWaveId: wave.id, outboundOrderId: waveOrder.outboundOrderId },
                },
              ]);
            }
            tasksCreated += 1;
          }
        }

        await tx.pickWaveOrder.update({
          where: { id: waveOrder.id },
          data: { status: PickWaveOrderStatus.RELEASED },
        });
        if (owner) {
          await this.linkOwnerResources(tx, warehouse.id, owner, [
            { resourceType: 'PICK_WAVE_ORDER', resourceId: waveOrder.id, metadata: { source: 'wave.release', pickWaveId: wave.id, outboundOrderId: waveOrder.outboundOrderId } },
          ]);
        }
        await tx.outboundOrder.updateMany({
          where: { id: waveOrder.outboundOrderId, status: { in: ['ALLOCATED', 'PICKING'] } },
          data: { status: 'PICKING' },
        });
      }

      const orderedTaskIds = calculatePickTaskSequence(
        taskRecords.map((task) => ({
          id: task.id,
          priority: task.priority,
          createdAt: task.createdAt,
          pickSequence: task.fromLocation?.pickSequence ?? null,
        })),
      );
      let sequence = 1;
      for (const taskId of orderedTaskIds) {
        const task = taskRecords.find((candidate) => candidate.id === taskId);
        if (!task) continue;
        const taskLink = await tx.pickWaveTask.upsert({
          where: { waveId_warehouseTaskId: { waveId: wave.id, warehouseTaskId: task.id } },
          create: {
            warehouseId: warehouse.id,
            waveId: wave.id,
            warehouseTaskId: task.id,
            status: task.status,
            sequence,
            zone: task.fromLocation?.zone ?? null,
          },
          update: { status: task.status, sequence, zone: task.fromLocation?.zone ?? null },
        });
        if (owner) {
          await this.linkOwnerResources(tx, warehouse.id, owner, [
            { resourceType: 'WAREHOUSE_TASK', resourceId: task.id, metadata: { source: 'wave.release.link_task', pickWaveId: wave.id } },
            { resourceType: 'PICK_WAVE_TASK', resourceId: taskLink.id, metadata: { source: 'wave.release.link_task', pickWaveId: wave.id, warehouseTaskId: task.id } },
          ]);
        }
        sequence += 1;
      }

      let cartAssigned = false;
      if (dto.pickCartReference) {
        const cart = await this.resolvePickCartWithClient(tx, warehouse.id, dto.pickCartReference);
        await tx.pickCart.update({
          where: { id: cart.id },
          data: { waveId: wave.id, status: PickCartStatus.ASSIGNED, assignedUserId: actor.id },
        });
        if (owner) {
          await this.linkOwnerResources(tx, warehouse.id, owner, [
            { resourceType: 'PICK_CART', resourceId: cart.id, metadata: { source: 'wave.release.assign_cart', pickWaveId: wave.id } },
          ]);
        }
        cartAssigned = true;
      }

      const released = await tx.pickWave.update({
        where: { id: wave.id },
        data: { status: PickWaveStatus.RELEASED, releasedAt: new Date() },
        include: { _count: { select: { orders: true, tasks: true, carts: true, totes: true } } },
      });
      await this.writeAuditWithClient(tx, actor.id, warehouse.id, 'pick_wave.released', 'pick_wave', wave.id, {
        waveNumber: wave.waveNumber,
        tasksCreated,
        tasksLinked: orderedTaskIds.length,
      });
      await this.writeOutboxWithClient(tx, 'PICK_WAVE_RELEASED', 'pick_wave', wave.id, {
        warehouseId: warehouse.id,
        waveNumber: wave.waveNumber,
        tasksCreated,
        tasksLinked: orderedTaskIds.length,
      });

      return {
        wave: toWaveResponse(released),
        ordersReleased: asArray<PickWaveOrderWithOrder>(wave.orders).length,
        tasksLinked: orderedTaskIds.length,
        tasksCreated,
        cartAssigned,
        toteAssignments: 0,
      };
    });
  }

  async assignCart(
    warehouseReference: string,
    waveReference: string,
    dto: AssignPickCartDto,
    actor: AuthenticatedUser,
  ): Promise<PickCartResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const wave = await this.resolveWave(warehouse.id, waveReference);
    const cart = await this.resolvePickCart(warehouse.id, dto.pickCartReference);
    const updated = await this.client.pickCart.update({
      where: { id: cart.id },
      data: {
        waveId: wave.id,
        status: PickCartStatus.ASSIGNED,
        assignedUserId: dto.assignedUserId ?? actor.id,
      },
      include: { _count: { select: { totes: true } } },
    });
    const owner = await this.ownerScope.findResourceOwner({
      warehouseId: warehouse.id,
      resourceType: 'PICK_WAVE',
      resourceId: wave.id,
      client: this.client as unknown as OwnerScopePrismaClient,
    });
    if (owner) {
      await this.linkOwnerResources(this.client, warehouse.id, owner, [
        { resourceType: 'PICK_CART', resourceId: cart.id, metadata: { source: 'wave.assign_cart', pickWaveId: wave.id } },
      ]);
    }
    await this.writeAudit(actor.id, warehouse.id, 'pick_cart.assigned_to_wave', 'pick_cart', cart.id, {
      waveId: wave.id,
      waveNumber: wave.waveNumber,
    });
    return toCartResponse(updated);
  }

  async completeWave(
    warehouseReference: string,
    waveReference: string,
    actor: AuthenticatedUser,
  ): Promise<PickWaveResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    return this.transaction(async (tx) => {
      const wave = await this.resolveWaveWithClient(tx, warehouse.id, waveReference, {
        tasks: { include: { warehouseTask: true } },
      });
      const taskLinks = asArray<PickWaveTaskWithTask>(wave.tasks);
      const openTaskCount = taskLinks.filter((link) => !['DONE', 'CANCELLED'].includes(String(link.warehouseTask?.status ?? link.status))).length;
      const exceptionTaskCount = taskLinks.filter((link) => ['FAILED', 'BLOCKED'].includes(String(link.warehouseTask?.status ?? link.status))).length;
      if (!canCompleteWave({ status: wave.status, openTaskCount, exceptionTaskCount })) {
        throw new ConflictException('Pick wave can be completed only when all linked tasks are DONE or CANCELLED.');
      }
      await tx.pickWaveOrder.updateMany({ where: { waveId: wave.id, status: { in: ['RELEASED', 'PICKING'] } }, data: { status: PickWaveOrderStatus.PICKED, pickedAt: new Date() } });
      const completed = await tx.pickWave.update({
        where: { id: wave.id },
        data: { status: PickWaveStatus.COMPLETED, completedAt: new Date() },
        include: { _count: { select: { orders: true, tasks: true, carts: true, totes: true } } },
      });
      await this.writeAuditWithClient(tx, actor.id, warehouse.id, 'pick_wave.completed', 'pick_wave', wave.id, { waveNumber: wave.waveNumber });
      await this.writeOutboxWithClient(tx, 'PICK_WAVE_COMPLETED', 'pick_wave', wave.id, { warehouseId: warehouse.id, waveNumber: wave.waveNumber });
      return toWaveResponse(completed);
    });
  }

  async listCarts(warehouseReference: string): Promise<PickCartResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const carts = await this.client.pickCart.findMany({
      where: { warehouseId: warehouse.id },
      include: { _count: { select: { totes: true } } },
      orderBy: { code: 'asc' },
    });
    return carts.map(toCartResponse);
  }

  async createCart(
    warehouseReference: string,
    dto: CreatePickCartDto,
    actor: AuthenticatedUser,
  ): Promise<PickCartResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const cart = await this.client.pickCart.create({
      data: {
        warehouseId: warehouse.id,
        code: normalizeCode(dto.code),
        status: PickCartStatus.AVAILABLE,
        metadata: dto.metadata ?? undefined,
      },
      include: { _count: { select: { totes: true } } },
    });
    await this.writeAudit(actor.id, warehouse.id, 'pick_cart.created', 'pick_cart', cart.id, { code: cart.code });
    return toCartResponse(cart);
  }

  async createTote(
    warehouseReference: string,
    dto: CreatePickToteDto,
    actor: AuthenticatedUser,
  ): Promise<PickToteResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const cart = dto.pickCartReference ? await this.resolvePickCart(warehouse.id, dto.pickCartReference) : null;
    const wave = dto.waveReference ? await this.resolveWave(warehouse.id, dto.waveReference) : null;
    const order = dto.outboundOrderReference
      ? await this.resolveOutboundOrder(warehouse.id, dto.outboundOrderReference)
      : null;
    const owner = await this.resolveOperationOwner(this.client, warehouse.id, dto.ownerClientReference, [
      { resourceType: 'PICK_CART', resourceId: cart?.id },
      { resourceType: 'PICK_WAVE', resourceId: wave?.id },
      { resourceType: 'OUTBOUND_ORDER', resourceId: order?.id },
    ]);
    const tote = await this.client.pickTote.create({
      data: {
        warehouseId: warehouse.id,
        pickCartId: cart?.id ?? null,
        waveId: wave?.id ?? null,
        outboundOrderId: order?.id ?? null,
        code: normalizeCode(dto.code),
        status: order || wave || cart ? PickToteStatus.ASSIGNED : PickToteStatus.EMPTY,
        capacityUnits: dto.capacityUnits ?? null,
        metadata: dto.metadata ?? undefined,
      },
    });
    if (owner) {
      await this.linkOwnerResources(this.client, warehouse.id, owner, [
        { resourceType: 'PICK_TOTE', resourceId: tote.id, metadata: { source: 'wave.create_tote', pickCartId: cart?.id ?? null, pickWaveId: wave?.id ?? null, outboundOrderId: order?.id ?? null } },
      ]);
    }
    await this.writeAudit(actor.id, warehouse.id, 'pick_tote.created', 'pick_tote', tote.id, { code: tote.code });
    return toToteResponse(tote);
  }

  private async findWaveCandidateOrders(
    warehouseId: string,
    dto: CreatePickWaveDto,
  ): Promise<WaveCandidateOrder[]> {
    const explicitReferences = dto.outboundOrderReferences?.map((reference) => reference.trim()).filter(Boolean) ?? [];
    const orders = await this.client.outboundOrder.findMany({
      where:
        explicitReferences.length > 0
          ? {
              warehouseId,
              OR: explicitReferences.flatMap((reference) => referenceToWhereOptions(reference, 'orderNumber')),
            }
          : compactRecord({
              warehouseId,
              status: { in: ['ALLOCATED', 'PICKING'] },
              carrier: dto.carrier ? normalizeCode(dto.carrier) : undefined,
              serviceLevel: dto.serviceLevel ? normalizeCode(dto.serviceLevel) : undefined,
              shipBy: dto.cutoffAt ? { lte: new Date(dto.cutoffAt) } : undefined,
            }),
      orderBy: [{ shipBy: 'asc' }, { createdAt: 'asc' }],
      take: Math.max(1, Math.min(dto.maxOrders ?? 500, 500)),
    });
    const ownedOrderIds = dto.ownerClientReference
      ? await this.ownerScope.findOwnedResourceIds({
          warehouseId,
          clientReference: dto.ownerClientReference,
          resourceType: 'OUTBOUND_ORDER',
        })
      : null;
    const ownedOrderSet = ownedOrderIds ? new Set(ownedOrderIds) : null;

    return asArray<OutboundOrderRecord>(orders)
      .filter((order) => !ownedOrderSet || ownedOrderSet.has(order.id))
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        carrier: order.carrier,
        serviceLevel: order.serviceLevel,
        shipBy: order.shipBy,
        priority: typeof order.metadata === 'object' && order.metadata && 'priority' in order.metadata ? Number((order.metadata as Record<string, unknown>)['priority']) : null,
        zone: typeof order.metadata === 'object' && order.metadata && 'zone' in order.metadata ? String((order.metadata as Record<string, unknown>)['zone']) : null,
        createdAt: order.createdAt,
      }));
  }

  private async resolveWarehouse(reference: string): Promise<WarehouseRecord> {
    const warehouse = await this.client.warehouse.findFirst({ where: warehouseWhere(reference) });
    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found.');
    }
    return warehouse;
  }

  private async resolveWave(warehouseId: string, reference: string, include?: Record<string, unknown>): Promise<PickWaveRecord> {
    const wave = await this.client.pickWave.findFirst({
      where: { warehouseId, OR: referenceToWhereOptions(reference, 'waveNumber') },
      include,
    });
    if (!wave) {
      throw new NotFoundException('Pick wave was not found.');
    }
    return wave;
  }

  private async resolveWaveWithClient(tx: WaveTransactionClient, warehouseId: string, reference: string, include?: Record<string, unknown>): Promise<PickWaveRecord> {
    const wave = await tx.pickWave.findFirst({
      where: { warehouseId, OR: referenceToWhereOptions(reference, 'waveNumber') },
      include,
    });
    if (!wave) {
      throw new NotFoundException('Pick wave was not found.');
    }
    return wave;
  }

  private async resolvePickCart(warehouseId: string, reference: string): Promise<PickCartRecord> {
    return this.resolvePickCartWithClient(this.client, warehouseId, reference);
  }

  private async resolvePickCartWithClient(tx: WaveTransactionClient, warehouseId: string, reference: string): Promise<PickCartRecord> {
    const cart = await tx.pickCart.findFirst({
      where: { warehouseId, OR: referenceToWhereOptions(reference, 'code') },
    });
    if (!cart) {
      throw new NotFoundException('Pick cart was not found.');
    }
    return cart;
  }

  private async resolveOutboundOrder(warehouseId: string, reference: string): Promise<OutboundOrderRecord> {
    const order = await this.client.outboundOrder.findFirst({
      where: { warehouseId, OR: referenceToWhereOptions(reference, 'orderNumber') },
    });
    if (!order) {
      throw new NotFoundException('Outbound order was not found.');
    }
    return order;
  }

  private async resolveOperationOwner(
    client: WaveTransactionClient,
    warehouseId: string,
    explicitOwnerReference: string | null | undefined,
    resources: Array<{ resourceType: string; resourceId: string | null | undefined }>,
  ): Promise<OwnerClientRecord | null> {
    if (explicitOwnerReference) {
      return this.ownerScope.resolveOperationalOwner({
        warehouseId,
        ownerClientReference: explicitOwnerReference,
        client: client as unknown as OwnerScopePrismaClient,
      });
    }
    return this.ownerScope.resolveSingleOwnerFromResources({
      warehouseId,
      resources: resources.map((resource) => ({ resourceType: resource.resourceType, resourceId: resource.resourceId })),
      client: client as unknown as OwnerScopePrismaClient,
    });
  }

  private async linkOwnerResources(
    client: WaveTransactionClient,
    warehouseId: string,
    owner: OwnerClientRecord,
    resources: Array<{ resourceType: string; resourceId: string | null | undefined; metadata?: Record<string, unknown> | null }>,
  ): Promise<void> {
    await this.ownerScope.ensureOwnedResourceLinks({
      warehouseId,
      clientId: owner.id,
      resources,
      metadata: { ownerClientReference: owner.code, sourceModule: 'wave-picking' },
      client: client as unknown as OwnerScopePrismaClient,
    });
  }

  private async writeAudit(actorUserId: string | null, warehouseId: string, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>): Promise<void> {
    await this.client.auditLog.create({ data: { actorUserId, warehouseId, action, resourceType, resourceId, metadata } });
  }

  private async writeAuditWithClient(tx: WaveTransactionClient, actorUserId: string | null, warehouseId: string, action: string, resourceType: string, resourceId: string, metadata: Record<string, unknown>): Promise<void> {
    await tx.auditLog.create({ data: { actorUserId, warehouseId, action, resourceType, resourceId, metadata } });
  }

  private async writeOutbox(type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
    await this.client.outboxEvent.create({ data: { type, aggregateType, aggregateId, payload, status: 'PENDING', availableAt: new Date() } });
  }

  private async writeOutboxWithClient(tx: WaveTransactionClient, type: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>): Promise<void> {
    await tx.outboxEvent.create({ data: { type, aggregateType, aggregateId, payload, status: 'PENDING', availableAt: new Date() } });
  }

  private transaction<T>(fn: (client: WaveTransactionClient) => Promise<T>): Promise<T> {
    return withTransactionRetry(() => this.client.$transaction(fn));
  }

  private get client(): WavePrismaClient {
    return this.prisma as unknown as WavePrismaClient;
  }
}

function toWaveResponse(wave: PickWaveRecord): PickWaveResponse {
  return {
    id: wave.id,
    warehouseId: wave.warehouseId,
    waveNumber: wave.waveNumber,
    status: wave.status,
    priority: wave.priority,
    strategy: wave.strategy,
    carrier: wave.carrier ?? null,
    serviceLevel: wave.serviceLevel ?? null,
    zone: wave.zone ?? null,
    cutoffAt: toIsoOrNull(wave.cutoffAt),
    releasedAt: toIsoOrNull(wave.releasedAt),
    completedAt: toIsoOrNull(wave.completedAt),
    createdAt: toIso(wave.createdAt),
    updatedAt: toIso(wave.updatedAt),
    orderCount: wave._count?.orders,
    taskCount: wave._count?.tasks,
    cartCount: wave._count?.carts,
    toteCount: wave._count?.totes,
    metadata: wave.metadata,
  };
}

function toWaveDetailResponse(wave: PickWaveRecord): PickWaveDetailResponse {
  return {
    ...toWaveResponse(wave),
    orders: asArray<PickWaveOrderWithOrder>(wave.orders).map(toWaveOrderResponse),
    tasks: asArray<PickWaveTaskWithTask>(wave.tasks).map(toWaveTaskResponse),
    carts: asArray<PickCartRecord>(wave.carts).map(toCartResponse),
    totes: asArray<PickToteRecord>(wave.totes).map(toToteResponse),
  };
}

function toWaveOrderResponse(order: PickWaveOrderWithOrder): PickWaveOrderResponse {
  return {
    id: order.id,
    waveId: order.waveId,
    outboundOrderId: order.outboundOrderId,
    status: order.status,
    sequence: order.sequence,
    pickedAt: toIsoOrNull(order.pickedAt),
    orderNumber: order.outboundOrder?.orderNumber,
  };
}

function toWaveTaskResponse(task: PickWaveTaskWithTask): PickWaveTaskResponse {
  return {
    id: task.id,
    waveId: task.waveId,
    warehouseTaskId: task.warehouseTaskId,
    status: task.status,
    sequence: task.sequence,
    zone: task.zone ?? null,
    taskType: task.warehouseTask?.type,
    taskPriority: task.warehouseTask?.priority,
  };
}

function toCartResponse(cart: PickCartRecord): PickCartResponse {
  return {
    id: cart.id,
    warehouseId: cart.warehouseId,
    waveId: cart.waveId ?? null,
    code: cart.code,
    status: cart.status,
    assignedUserId: cart.assignedUserId ?? null,
    toteCount: cart._count?.totes,
    metadata: cart.metadata,
  };
}

function toToteResponse(tote: PickToteRecord): PickToteResponse {
  return {
    id: tote.id,
    warehouseId: tote.warehouseId,
    pickCartId: tote.pickCartId ?? null,
    waveId: tote.waveId ?? null,
    outboundOrderId: tote.outboundOrderId ?? null,
    code: tote.code,
    status: tote.status,
    capacityUnits: tote.capacityUnits ?? null,
    metadata: tote.metadata,
  };
}


function referenceToWhereOptions(reference: string, fieldName: string): Record<string, string>[] {
  const normalized = normalizeCode(reference);
  return isUuid(reference) ? [{ id: reference }, { [fieldName]: normalized }] : [{ [fieldName]: normalized }];
}

function warehouseWhere(reference: string): Record<string, unknown> {
  return isUuid(reference) ? { OR: [{ id: reference }, { code: normalizeCode(reference) }] } : { code: normalizeCode(reference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeOptionalCode(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized && normalized.length > 0 ? normalized : null;
}

function compactRecord<T extends Record<string, unknown>>(record: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null | undefined): string | null {
  return value ? toIso(value) : null;
}

interface WavePrismaClient extends WaveTransactionClient {
  $transaction<T>(fn: (client: WaveTransactionClient) => Promise<T>): Promise<T>;
}

interface WaveTransactionClient {
  warehouse: { findFirst(args: Record<string, unknown>): Promise<WarehouseRecord | null> };
  outboundOrder: { findMany(args: Record<string, unknown>): Promise<OutboundOrderRecord[]>; findFirst(args: Record<string, unknown>): Promise<OutboundOrderRecord | null>; updateMany(args: Record<string, unknown>): Promise<unknown> };
  pickWave: { findMany(args: Record<string, unknown>): Promise<PickWaveRecord[]>; findFirst(args: Record<string, unknown>): Promise<PickWaveRecord | null>; create(args: Record<string, unknown>): Promise<PickWaveRecord>; update(args: Record<string, unknown>): Promise<PickWaveRecord> };
  pickWaveOrder: { update(args: Record<string, unknown>): Promise<unknown>; updateMany(args: Record<string, unknown>): Promise<unknown> };
  pickWaveTask: { upsert(args: Record<string, unknown>): Promise<{ id: string }> };
  pickCart: { findMany(args: Record<string, unknown>): Promise<PickCartRecord[]>; findFirst(args: Record<string, unknown>): Promise<PickCartRecord | null>; create(args: Record<string, unknown>): Promise<PickCartRecord>; update(args: Record<string, unknown>): Promise<PickCartRecord> };
  pickTote: { create(args: Record<string, unknown>): Promise<PickToteRecord> };
  warehouseTask: { findMany(args: Record<string, unknown>): Promise<WarehouseTaskRecord[]>; create(args: Record<string, unknown>): Promise<WarehouseTaskRecord> };
  reservation: { findMany(args: Record<string, unknown>): Promise<ReservationWithQuant[]> };
  auditLog: { create(args: Record<string, unknown>): Promise<unknown> };
  outboxEvent: { create(args: Record<string, unknown>): Promise<unknown> };
}

interface WarehouseRecord { id: string; code: string; }
interface OutboundOrderRecord { id: string; orderNumber: string; status: string; carrier?: string | null; serviceLevel?: string | null; shipBy?: Date | string | null; createdAt?: Date | string | null; metadata?: unknown; }
interface PickWaveRecord { id: string; warehouseId: string; waveNumber: string; status: string; priority: number; strategy: string; carrier?: string | null; serviceLevel?: string | null; zone?: string | null; cutoffAt?: Date | string | null; metadata?: unknown; releasedAt?: Date | string | null; completedAt?: Date | string | null; createdAt: Date | string; updatedAt: Date | string; orders?: unknown; tasks?: unknown; carts?: unknown; totes?: unknown; _count?: { orders?: number; tasks?: number; carts?: number; totes?: number }; }
interface PickWaveOrderWithOrder { id: string; waveId: string; outboundOrderId: string; status: string; sequence: number; pickedAt?: Date | string | null; outboundOrder?: { orderNumber: string; status: string; lines?: unknown[] }; }
interface PickWaveTaskWithTask { id: string; waveId: string; warehouseTaskId: string; status: string; sequence: number; zone?: string | null; warehouseTask?: { id: string; type: string; status: string; priority: number }; }
interface PickCartRecord { id: string; warehouseId: string; waveId?: string | null; code: string; status: string; assignedUserId?: string | null; metadata?: unknown; _count?: { totes?: number }; }
interface PickToteRecord { id: string; warehouseId: string; pickCartId?: string | null; waveId?: string | null; outboundOrderId?: string | null; code: string; status: string; capacityUnits?: number | null; metadata?: unknown; }
interface WarehouseTaskRecord { id: string; status: string; priority?: number | null; createdAt?: Date | string | null; fromLocation?: { pickSequence?: number | null; zone?: string | null } | null; }
interface ReservationWithQuant { id: string; skuId: string; stockQuant?: { locationId?: string | null } | null; outboundOrderLineId?: string | null; quantity: number; }
