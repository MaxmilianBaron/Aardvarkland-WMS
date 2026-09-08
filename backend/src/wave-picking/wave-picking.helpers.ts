import { PickWaveStatus } from './wave-picking.types';

export interface WaveCandidateOrder {
  id: string;
  orderNumber: string;
  status: string;
  carrier?: string | null;
  serviceLevel?: string | null;
  shipBy?: Date | string | null;
  priority?: number | null;
  zone?: string | null;
  createdAt?: Date | string | null;
}

export interface WavePlanningOptions {
  maxOrders?: number;
  carrier?: string | null;
  serviceLevel?: string | null;
  zone?: string | null;
  cutoffAt?: Date | string | null;
}

export interface WavePlanOrder {
  orderId: string;
  orderNumber: string;
  sequence: number;
  priorityScore: number;
}

export interface WavePlan {
  status: PickWaveStatus;
  orders: WavePlanOrder[];
  rejectedOrderIds: string[];
}

const allowedOutboundStatuses = new Set(['ALLOCATED', 'PICKING']);

export function normalizeWaveNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new Error('Wave number is required.');
  }
  return normalized;
}

export function makeWaveNumber(now: Date = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mi = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  return `WAVE-${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

export function buildWavePlan(
  candidates: WaveCandidateOrder[],
  options: WavePlanningOptions = {},
): WavePlan {
  const cutoffAt = options.cutoffAt ? new Date(options.cutoffAt).getTime() : null;
  const accepted = candidates.filter((order) => {
    if (!allowedOutboundStatuses.has(order.status)) {
      return false;
    }
    if (options.carrier && normalizeNullable(order.carrier) !== normalizeNullable(options.carrier)) {
      return false;
    }
    if (
      options.serviceLevel &&
      normalizeNullable(order.serviceLevel) !== normalizeNullable(options.serviceLevel)
    ) {
      return false;
    }
    if (options.zone && normalizeNullable(order.zone) !== normalizeNullable(options.zone)) {
      return false;
    }
    if (cutoffAt !== null && order.shipBy && new Date(order.shipBy).getTime() > cutoffAt) {
      return false;
    }
    return true;
  });

  const rejected = candidates
    .filter((order) => !accepted.some((acceptedOrder) => acceptedOrder.id === order.id))
    .map((order) => order.id);

  const limit = Math.max(1, Math.min(options.maxOrders ?? accepted.length, 500));
  const orders = accepted
    .map((order) => ({ order, priorityScore: calculateWavePriorityScore(order) }))
    .sort((a, b) => {
      if (a.priorityScore !== b.priorityScore) {
        return b.priorityScore - a.priorityScore;
      }
      const aShipBy = a.order.shipBy ? new Date(a.order.shipBy).getTime() : Number.MAX_SAFE_INTEGER;
      const bShipBy = b.order.shipBy ? new Date(b.order.shipBy).getTime() : Number.MAX_SAFE_INTEGER;
      if (aShipBy !== bShipBy) {
        return aShipBy - bShipBy;
      }
      return a.order.orderNumber.localeCompare(b.order.orderNumber);
    })
    .slice(0, limit)
    .map((entry, index) => ({
      orderId: entry.order.id,
      orderNumber: entry.order.orderNumber,
      sequence: index + 1,
      priorityScore: entry.priorityScore,
    }));

  return {
    status: orders.length > 0 ? PickWaveStatus.PLANNED : PickWaveStatus.DRAFT,
    orders,
    rejectedOrderIds: rejected,
  };
}

export function calculateWavePriorityScore(order: WaveCandidateOrder, now: Date = new Date()): number {
  const base = typeof order.priority === 'number' ? Math.max(0, 1000 - order.priority) : 100;
  const shipByBoost = order.shipBy
    ? Math.max(0, 720 - Math.floor((new Date(order.shipBy).getTime() - now.getTime()) / 60000))
    : 0;
  return base + shipByBoost;
}

export function calculatePickTaskSequence(tasks: Array<{ pickSequence?: number | null; priority?: number | null; createdAt?: Date | string | null; id: string }>): string[] {
  return [...tasks]
    .sort((a, b) => {
      const aPick = a.pickSequence ?? Number.MAX_SAFE_INTEGER;
      const bPick = b.pickSequence ?? Number.MAX_SAFE_INTEGER;
      if (aPick !== bPick) {
        return aPick - bPick;
      }
      const aPriority = a.priority ?? 100;
      const bPriority = b.priority ?? 100;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (aCreated !== bCreated) {
        return aCreated - bCreated;
      }
      return a.id.localeCompare(b.id);
    })
    .map((task) => task.id);
}

export function canReleaseWave(status: string): boolean {
  return status === PickWaveStatus.DRAFT || status === PickWaveStatus.PLANNED;
}

export function canCompleteWave(input: { openTaskCount: number; exceptionTaskCount: number; status: string }): boolean {
  return [PickWaveStatus.RELEASED, PickWaveStatus.PICKING].includes(input.status as PickWaveStatus) && input.openTaskCount === 0 && input.exceptionTaskCount === 0;
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}
