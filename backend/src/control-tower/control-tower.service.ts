import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database';
import { ControlTowerQueryDto } from './dto/control-tower-query.dto';
import {
  buildControlTowerRisks,
  countByKey,
  getCutoffWindow,
  getStaleTaskThreshold,
  summarizeCounts,
} from './control-tower.helpers';
import { ControlTowerOverviewResponse } from './control-tower.types';

@Injectable()
export class ControlTowerService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    warehouseReference: string,
    query: ControlTowerQueryDto = {},
  ): Promise<ControlTowerOverviewResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const now = new Date();
    const cutoffWindowHours = query.cutoffWindowHours ?? 4;
    const staleTaskMinutes = query.staleTaskMinutes ?? 90;
    const cutoff = getCutoffWindow(now, cutoffWindowHours);
    const staleThreshold = getStaleTaskThreshold(now, staleTaskMinutes);

    const [
      tasksByStatusRows,
      tasksByTypeRows,
      staleTasks,
      ordersByStatusRows,
      cutoffRiskOrders,
      wavesByStatusRows,
      shipmentsByStatusRows,
      carrierExceptions,
      exceptionsBySeverityRows,
      openSlottingRecommendations,
      overdueOrders,
      dockDoors,
      dockAppointments,
      yardTrailers,
    ] = await Promise.all([
      this.client.warehouseTask.groupBy({
        by: ['status'],
        where: { warehouseId: warehouse.id },
        _count: { _all: true },
      }),
      this.client.warehouseTask.groupBy({
        by: ['type'],
        where: { warehouseId: warehouse.id },
        _count: { _all: true },
      }),
      this.client.warehouseTask.count({
        where: {
          warehouseId: warehouse.id,
          status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] },
          createdAt: { lte: staleThreshold },
        },
      }),
      this.client.outboundOrder.groupBy({
        by: ['status'],
        where: { warehouseId: warehouse.id },
        _count: { _all: true },
      }),
      this.client.outboundOrder.count({
        where: {
          warehouseId: warehouse.id,
          status: { notIn: ['SHIPPED', 'CANCELLED'] },
          shipBy: { gte: cutoff.from, lte: cutoff.to },
        },
      }),
      this.client.pickWave.groupBy({
        by: ['status'],
        where: { warehouseId: warehouse.id },
        _count: { _all: true },
      }),
      this.client.shipment.groupBy({
        by: ['status'],
        where: { warehouseId: warehouse.id },
        _count: { _all: true },
      }),
      this.client.carrierTrackingEvent.count({
        where: {
          warehouseId: warehouse.id,
          status: 'EXCEPTION',
          occurredAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.client.wmsException.groupBy({
        by: ['severity'],
        where: { warehouseId: warehouse.id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        _count: { _all: true },
      }),
      this.client.slottingRecommendation.count({
        where: { warehouseId: warehouse.id, status: 'OPEN' },
      }),
      this.client.outboundOrder.count({
        where: {
          warehouseId: warehouse.id,
          status: { notIn: ['SHIPPED', 'CANCELLED'] },
          shipBy: { lt: now },
        },
      }),
      this.client.dockDoor.findMany({
        where: { warehouseId: warehouse.id },
        orderBy: [{ code: 'asc' }],
        take: 16,
      }),
      this.client.dockAppointment.findMany({
        where: {
          warehouseId: warehouse.id,
          status: { notIn: ['CANCELLED', 'COMPLETED'] },
          plannedEndAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
          plannedStartAt: { lte: new Date(now.getTime() + cutoffWindowHours * 60 * 60 * 1000) },
        },
        orderBy: [{ plannedStartAt: 'asc' }],
        take: 64,
      }),
      this.client.yardTrailer.findMany({
        where: {
          warehouseId: warehouse.id,
          status: { notIn: ['CHECKED_OUT', 'DEPARTED', 'CANCELLED'] },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 64,
      }),
    ]);

    const tasksByStatus = summarizeCounts(tasksByStatusRows);
    const tasksByType = summarizeCounts(tasksByTypeRows);
    const ordersByStatus = summarizeCounts(ordersByStatusRows);
    const wavesByStatus = summarizeCounts(wavesByStatusRows);
    const shipmentsByStatus = summarizeCounts(shipmentsByStatusRows);
    const exceptionsBySeverity = summarizeCounts(exceptionsBySeverityRows);

    const openTasks = countByKey(tasksByStatus, ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED']);
    const exceptionOrders = countByKey(ordersByStatus, ['EXCEPTION']);
    const activeWaves = countByKey(wavesByStatus, ['RELEASED', 'PICKING']);
    const unreleasedWaves = countByKey(wavesByStatus, ['DRAFT', 'PLANNED']);
    const openExceptions = exceptionsBySeverity.reduce((sum, row) => sum + row.count, 0);
    const criticalOpenExceptions = countByKey(exceptionsBySeverity, ['CRITICAL']);
    const dockBoard = buildDockBoard(dockDoors, dockAppointments, yardTrailers);
    const slaMonitor = buildSlaMonitor({
      dueSoonOrders: cutoffRiskOrders,
      overdueOrders,
      staleTasks,
      carrierExceptions,
    });

    return {
      warehouseId: warehouse.id,
      generatedAt: now.toISOString(),
      windows: { cutoffWindowHours, staleTaskMinutes },
      backlog: { openTasks, staleTasks, tasksByStatus, tasksByType },
      outbound: { ordersByStatus, cutoffRiskOrders, exceptionOrders },
      waves: { wavesByStatus, activeWaves, unreleasedWaves },
      shipping: { shipmentsByStatus, carrierExceptions },
      exceptions: { openExceptions, criticalOpenExceptions, exceptionsBySeverity },
      slotting: { openRecommendations: openSlottingRecommendations },
      dockBoard,
      slaMonitor,
      risks: buildControlTowerRisks({
        openTasks,
        staleTasks,
        cutoffRiskOrders,
        carrierExceptions,
        criticalOpenExceptions,
        unreleasedWaves,
        openSlottingRecommendations,
      }),
    };
  }

  private async resolveWarehouse(reference: string): Promise<WarehouseRecord> {
    const warehouse = await this.client.warehouse.findFirst({ where: warehouseWhere(reference) });
    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found.');
    }
    return warehouse;
  }

  private get client(): ControlTowerPrismaClient {
    return this.prisma as unknown as ControlTowerPrismaClient;
  }
}

function warehouseWhere(reference: string): Record<string, unknown> {
  return isUuid(reference)
    ? { OR: [{ id: reference }, { code: normalizeCode(reference) }] }
    : { code: normalizeCode(reference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildDockBoard(
  doors: DockDoorRecord[],
  appointments: DockAppointmentRecord[],
  trailers: YardTrailerRecord[],
): ControlTowerOverviewResponse['dockBoard'] {
  const appointmentsByDoor = new Map<string, DockAppointmentRecord>();
  const trailersByDoor = new Map<string, YardTrailerRecord>();

  for (const appointment of appointments) {
    if (appointment.dockDoorId && !appointmentsByDoor.has(appointment.dockDoorId)) {
      appointmentsByDoor.set(appointment.dockDoorId, appointment);
    }
  }

  for (const trailer of trailers) {
    if (trailer.dockDoorId && !trailersByDoor.has(trailer.dockDoorId)) {
      trailersByDoor.set(trailer.dockDoorId, trailer);
    }
  }

  return {
    doors: doors.map((door) => ({
      id: door.id,
      code: door.code,
      status: door.status,
      doorType: door.doorType,
      zone: door.zone,
      activeAppointmentNumber: appointmentsByDoor.get(door.id)?.appointmentNumber ?? null,
      activeTrailerNumber: trailersByDoor.get(door.id)?.trailerNumber ?? null,
    })),
    scheduledAppointments: appointments.length,
    waitingTrailers: trailers.filter((trailer) => ['EXPECTED', 'CHECKED_IN', 'WAITING'].includes(trailer.status)).length,
    dwellRiskTrailers: trailers.filter((trailer) => Number(trailer.dwellMinutes ?? 0) >= 120).length,
    unavailableDoors: doors.filter((door) => door.status !== 'ACTIVE').length,
  };
}

function buildSlaMonitor(input: {
  dueSoonOrders: number;
  overdueOrders: number;
  staleTasks: number;
  carrierExceptions: number;
}): ControlTowerOverviewResponse['slaMonitor'] {
  const status = input.overdueOrders > 0 || input.carrierExceptions >= 10
    ? 'CRITICAL'
    : input.dueSoonOrders > 0 || input.staleTasks > 0 || input.carrierExceptions > 0
      ? 'WARNING'
      : 'OK';

  return { ...input, status };
}

interface WarehouseRecord {
  id: string;
  code: string;
}

interface GroupByModel {
  groupBy(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  count(args: Record<string, unknown>): Promise<number>;
}

interface FindManyModel<TRecord> {
  findMany(args: Record<string, unknown>): Promise<TRecord[]>;
}

interface DockDoorRecord {
  id: string;
  code: string;
  status: string;
  doorType: string;
  zone: string | null;
}

interface DockAppointmentRecord {
  id: string;
  appointmentNumber: string;
  status: string;
  dockDoorId: string | null;
}

interface YardTrailerRecord {
  id: string;
  trailerNumber: string;
  status: string;
  dockDoorId: string | null;
  dwellMinutes: number | null;
}

interface ControlTowerPrismaClient {
  warehouse: { findFirst(args: Record<string, unknown>): Promise<WarehouseRecord | null> };
  warehouseTask: GroupByModel;
  outboundOrder: GroupByModel;
  pickWave: GroupByModel;
  shipment: GroupByModel;
  carrierTrackingEvent: GroupByModel;
  wmsException: GroupByModel;
  slottingRecommendation: GroupByModel;
  dockDoor: FindManyModel<DockDoorRecord>;
  dockAppointment: FindManyModel<DockAppointmentRecord>;
  yardTrailer: FindManyModel<YardTrailerRecord>;
}
