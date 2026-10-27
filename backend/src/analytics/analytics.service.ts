import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database';
import { ParcelStatus, Prisma, Warehouse, WarehouseLocationType } from '../generated/prisma/client';
import {
  AnalyticsOverview,
  AnalyticsWarehouseScope,
  LocationAnalyticsSnapshot,
  OptionalMetricCounterKey,
  OptionalOperationalMetric,
  ParcelAnalyticsSnapshot,
  ParcelStatusAnalytics,
} from './analytics.types';
import { AnalyticsWindowQueryDto } from './dto/analytics-window-query.dto';
import { getRuntimeDelegate, safeRuntimeCount } from './prisma-runtime';

const DEFAULT_WINDOW_DAYS = 7;
const PARCEL_STATUSES = Object.values(ParcelStatus);
const LOCATION_TYPES = Object.values(WarehouseLocationType);

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    warehouseReference: string,
    query: AnalyticsWindowQueryDto = {},
  ): Promise<AnalyticsOverview> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const window = buildWindow(query.days);
    const [parcels, locations, exceptions, inbound, outbound, labelJobs, notifications] =
      await Promise.all([
        this.getParcelSnapshot(warehouse.id, window.since),
        this.getLocationSnapshot(warehouse.id),
        this.getOptionalMetric(warehouse.id, 'wmsException', [
          {
            key: 'open',
            statuses: ['OPEN', 'IN_PROGRESS'],
          },
        ]),
        this.getOptionalMetric(warehouse.id, 'inboundShipment', [
          {
            key: 'open',
            statuses: ['CREATED', 'EXPECTED', 'RECEIVING'],
          },
          {
            key: 'ready',
            statuses: ['RECEIVED'],
          },
        ]),
        this.getOptionalMetric(warehouse.id, 'outboundOrder', [
          {
            key: 'open',
            statuses: ['CREATED', 'ALLOCATED', 'PICKING', 'PACKED'],
          },
          {
            key: 'ready',
            statuses: ['PACKED'],
          },
        ]),
        this.getOptionalMetric(warehouse.id, 'labelPrintJob', [
          {
            key: 'queued',
            statuses: ['QUEUED', 'PRINTING'],
          },
          {
            key: 'failed',
            statuses: ['FAILED', 'ERROR'],
          },
        ]),
        this.getOptionalMetric(warehouse.id, 'notification', [
          {
            key: 'pending',
            statuses: ['UNREAD'],
          },
          {
            key: 'failed',
            statuses: [],
          },
        ]),
      ]);

    return {
      generatedAt: new Date(),
      warehouse: toWarehouseScope(warehouse),
      window,
      parcels,
      locations,
      exceptions,
      inbound,
      outbound,
      labelJobs,
      notifications,
    };
  }

  async getParcelStatus(warehouseReference: string): Promise<ParcelStatusAnalytics> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parcels = await this.getParcelSnapshot(
      warehouse.id,
      buildWindow(DEFAULT_WINDOW_DAYS).since,
    );

    return {
      generatedAt: new Date(),
      warehouse: toWarehouseScope(warehouse),
      total: parcels.total,
      byStatus: parcels.byStatus,
    };
  }

  private async getParcelSnapshot(
    warehouseId: string,
    since: Date,
  ): Promise<ParcelAnalyticsSnapshot> {
    const [total, createdInWindow, updatedInWindow, groupedStatuses] = await Promise.all([
      this.prisma.parcel.count({ where: { warehouseId } }),
      this.prisma.parcel.count({ where: { warehouseId, createdAt: { gte: since } } }),
      this.prisma.parcel.count({ where: { warehouseId, updatedAt: { gte: since } } }),
      this.prisma.parcel.groupBy({
        by: ['status'],
        where: { warehouseId },
        _count: { _all: true },
      }),
    ]);
    const groupedByStatus = new Map<ParcelStatus, number>(
      (groupedStatuses as Array<{ status: ParcelStatus; _count: { _all: number } }>).map((item) => [item.status, item._count._all]),
    );
    const exceptionCount = groupedByStatus.get(ParcelStatus.EXCEPTION) ?? 0;
    const byStatus = PARCEL_STATUSES.map((status) => ({
      status,
      count: groupedByStatus.get(status) ?? 0,
      ratio: calculateRatio(groupedByStatus.get(status) ?? 0, total),
    }));

    return {
      total,
      createdInWindow,
      updatedInWindow,
      exceptionRatio: calculateRatio(exceptionCount, total),
      byStatus,
    };
  }

  private async getLocationSnapshot(warehouseId: string): Promise<LocationAnalyticsSnapshot> {
    const [total, active, groupedTypes] = await Promise.all([
      this.prisma.warehouseLocation.count({ where: { warehouseId } }),
      this.prisma.warehouseLocation.count({ where: { warehouseId, isActive: true } }),
      this.prisma.warehouseLocation.groupBy({
        by: ['type'],
        where: { warehouseId },
        _count: { _all: true },
      }),
    ]);
    const groupedByType = new Map<WarehouseLocationType, number>(
      (groupedTypes as Array<{ type: WarehouseLocationType; _count: { _all: number } }>).map((item) => [item.type, item._count._all]),
    );

    return {
      total,
      active,
      inactive: total - active,
      byType: LOCATION_TYPES.map((type) => ({
        type,
        count: groupedByType.get(type) ?? 0,
      })),
    };
  }

  private async getOptionalMetric(
    warehouseId: string,
    delegateName: string,
    counters: Array<{ key: OptionalMetricCounterKey; statuses: string[] }>,
  ): Promise<OptionalOperationalMetric> {
    const delegate = getRuntimeDelegate(this.prisma, delegateName);
    const total = await safeRuntimeCount(delegate, { warehouseId });

    if (total === null) {
      return {
        available: false,
        total: 0,
      };
    }

    const statusCounts: Partial<Record<OptionalMetricCounterKey, number>> = {};

    await Promise.all(
      counters.map(async (counter) => {
        const count = await safeRuntimeCount(delegate, {
          warehouseId,
          status: { in: counter.statuses },
        });

        statusCounts[counter.key] = count ?? 0;
      }),
    );

    return {
      available: true,
      total,
      ...statusCounts,
    };
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }
}

function toWarehouseScope(warehouse: Warehouse): AnalyticsWarehouseScope {
  return {
    id: warehouse.id,
    code: warehouse.code,
    name: warehouse.name,
    timezone: warehouse.timezone,
  };
}

function buildWindow(days: number | undefined) {
  const normalizedDays = days ?? DEFAULT_WINDOW_DAYS;
  const since = new Date();

  since.setDate(since.getDate() - normalizedDays);

  return {
    days: normalizedDays,
    since,
  };
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function calculateRatio(value: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Number((value / total).toFixed(4));
}
