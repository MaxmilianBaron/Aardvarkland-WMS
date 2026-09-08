import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database';

export interface BusinessMetricsResponse {
  warehouseId: string;
  generatedAt: string;
  tasks: {
    open: number;
    assigned: number;
    inProgress: number;
    blocked: number;
    failed: number;
    doneLast24h: number;
  };
  inventory: {
    activeQuants: number;
    reservedQuants: number;
    blockedQuants: number;
  };
  outbound: {
    created: number;
    allocated: number;
    picking: number;
    picked: number;
    packed: number;
    shippedLast24h: number;
    exception: number;
  };
  exceptions: {
    open: number;
    critical: number;
  };
  cycleCounts: {
    openTasks: number;
    submittedTasks: number;
    averageAbsoluteVariance: number;
  };
  replenishment: {
    openDemands: number;
    completedDemandsLast24h: number;
  };
  shipping: {
    openShipments: number;
    stagedShipments: number;
    shippedLast24h: number;
  };
  outbox: {
    pending: number;
    failed: number;
  };
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async getWarehouseMetrics(warehouseReference: string): Promise<BusinessMetricsResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = this.client;

    const [
      openTasks,
      assignedTasks,
      inProgressTasks,
      blockedTasks,
      failedTasks,
      doneLast24h,
      activeQuants,
      reservedQuants,
      blockedQuants,
      createdOrders,
      allocatedOrders,
      pickingOrders,
      pickedOrders,
      packedOrders,
      shippedOrdersLast24h,
      exceptionOrders,
      openExceptions,
      criticalExceptions,
      openCountTasks,
      submittedCountTasks,
      countVarianceRows,
      openReplenishmentDemands,
      completedReplenishmentDemandsLast24h,
      openShipments,
      stagedShipments,
      shippedShipmentsLast24h,
      pendingOutbox,
      failedOutbox,
    ] = await Promise.all([
      db.warehouseTask.count({ where: { warehouseId: warehouse.id, status: 'OPEN' } }),
      db.warehouseTask.count({ where: { warehouseId: warehouse.id, status: 'ASSIGNED' } }),
      db.warehouseTask.count({ where: { warehouseId: warehouse.id, status: 'IN_PROGRESS' } }),
      db.warehouseTask.count({ where: { warehouseId: warehouse.id, status: 'BLOCKED' } }),
      db.warehouseTask.count({ where: { warehouseId: warehouse.id, status: 'FAILED' } }),
      db.warehouseTask.count({
        where: { warehouseId: warehouse.id, status: 'DONE', completedAt: { gte: since24h } },
      }),
      db.stockQuant.count({ where: { warehouseId: warehouse.id, status: 'AVAILABLE' } }),
      db.stockQuant.count({ where: { warehouseId: warehouse.id, reservedQuantity: { gt: 0 } } }),
      db.stockQuant.count({
        where: { warehouseId: warehouse.id, status: { in: ['BLOCKED', 'QUARANTINE', 'DAMAGED'] } },
      }),
      db.outboundOrder.count({ where: { warehouseId: warehouse.id, status: 'CREATED' } }),
      db.outboundOrder.count({ where: { warehouseId: warehouse.id, status: 'ALLOCATED' } }),
      db.outboundOrder.count({ where: { warehouseId: warehouse.id, status: 'PICKING' } }),
      db.outboundOrder.count({ where: { warehouseId: warehouse.id, status: 'PICKED' } }),
      db.outboundOrder.count({ where: { warehouseId: warehouse.id, status: 'PACKED' } }),
      db.outboundOrder.count({
        where: { warehouseId: warehouse.id, status: 'SHIPPED', shippedAt: { gte: since24h } },
      }),
      db.outboundOrder.count({ where: { warehouseId: warehouse.id, status: 'EXCEPTION' } }),
      db.wmsException.count({
        where: { warehouseId: warehouse.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      db.wmsException.count({
        where: {
          warehouseId: warehouse.id,
          status: { in: ['OPEN', 'IN_PROGRESS'] },
          severity: 'CRITICAL',
        },
      }),
      db.cycleCountTask.count({
        where: { warehouseId: warehouse.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      }),
      db.cycleCountTask.count({ where: { warehouseId: warehouse.id, status: 'SUBMITTED' } }),
      db.cycleCountTask.findMany({
        where: { warehouseId: warehouse.id, varianceQuantity: { not: null } },
      }),
      db.replenishmentDemand.count({
        where: { warehouseId: warehouse.id, status: { in: ['OPEN', 'TASK_CREATED'] } },
      }),
      db.replenishmentDemand.count({
        where: { warehouseId: warehouse.id, status: 'COMPLETED', updatedAt: { gte: since24h } },
      }),
      db.shipment.count({
        where: { warehouseId: warehouse.id, status: { in: ['DRAFT', 'PACKING', 'LOADING'] } },
      }),
      db.shipment.count({ where: { warehouseId: warehouse.id, status: 'STAGED' } }),
      db.shipment.count({
        where: { warehouseId: warehouse.id, status: 'SHIPPED', shippedAt: { gte: since24h } },
      }),
      db.outboxEvent.count({ where: { status: 'PENDING' } }),
      db.outboxEvent.count({ where: { status: 'FAILED' } }),
    ]);

    const averageAbsoluteVariance = averageAbsVariance(countVarianceRows);

    return {
      warehouseId: warehouse.id,
      generatedAt: new Date().toISOString(),
      tasks: {
        open: openTasks,
        assigned: assignedTasks,
        inProgress: inProgressTasks,
        blocked: blockedTasks,
        failed: failedTasks,
        doneLast24h,
      },
      inventory: { activeQuants, reservedQuants, blockedQuants },
      outbound: {
        created: createdOrders,
        allocated: allocatedOrders,
        picking: pickingOrders,
        picked: pickedOrders,
        packed: packedOrders,
        shippedLast24h: shippedOrdersLast24h,
        exception: exceptionOrders,
      },
      exceptions: { open: openExceptions, critical: criticalExceptions },
      cycleCounts: {
        openTasks: openCountTasks,
        submittedTasks: submittedCountTasks,
        averageAbsoluteVariance,
      },
      replenishment: {
        openDemands: openReplenishmentDemands,
        completedDemandsLast24h: completedReplenishmentDemandsLast24h,
      },
      shipping: { openShipments, stagedShipments, shippedLast24h: shippedShipmentsLast24h },
      outbox: { pending: pendingOutbox, failed: failedOutbox },
    };
  }

  private async resolveWarehouse(reference: string): Promise<{ id: string; code: string }> {
    const warehouse = await this.client.warehouse.findFirst({ where: warehouseWhere(reference) });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private get client(): MetricsPrismaClient {
    return this.prisma as unknown as MetricsPrismaClient;
  }
}

function averageAbsVariance(rows: Array<{ varianceQuantity: number | null }>): number {
  const values = rows
    .map((row) => row.varianceQuantity)
    .filter((value): value is number => typeof value === 'number');

  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length;
}

function warehouseWhere(reference: string): Record<string, unknown> {
  return isUuid(reference)
    ? { OR: [{ id: reference }, { code: reference.trim().toUpperCase() }] }
    : { code: reference.trim().toUpperCase() };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface MetricsPrismaClient {
  warehouse: {
    findFirst(args: Record<string, unknown>): Promise<{ id: string; code: string } | null>;
  };
  warehouseTask: { count(args: Record<string, unknown>): Promise<number> };
  stockQuant: { count(args: Record<string, unknown>): Promise<number> };
  outboundOrder: { count(args: Record<string, unknown>): Promise<number> };
  wmsException: { count(args: Record<string, unknown>): Promise<number> };
  cycleCountTask: {
    count(args: Record<string, unknown>): Promise<number>;
    findMany(args: Record<string, unknown>): Promise<Array<{ varianceQuantity: number | null }>>;
  };
  replenishmentDemand: { count(args: Record<string, unknown>): Promise<number> };
  shipment: { count(args: Record<string, unknown>): Promise<number> };
  outboxEvent: { count(args: Record<string, unknown>): Promise<number> };
}
