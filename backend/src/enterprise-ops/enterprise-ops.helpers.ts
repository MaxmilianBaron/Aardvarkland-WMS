import { createHash } from 'node:crypto';

import { createWebhookSignature, stableJsonStringify } from '../common/webhook-signature.helpers';
import {
  AutomationCommandStatus,
  CrossDockPlanStatus,
  DockAppointmentStatus,
  DomainEventDeliveryStatus,
  VasTaskStatus,
  YardTrailerStatus,
} from './enterprise-ops.types';

export interface CrossDockSupplyInput {
  inboundLineId: string;
  skuId: string;
  quantity: number;
  lotId?: string | null;
  expiryDate?: Date | string | null;
}

export interface CrossDockDemandInput {
  outboundLineId: string;
  skuId: string;
  quantity: number;
  priority?: number;
  lotId?: string | null;
}

export interface CrossDockOpportunity {
  inboundLineId: string;
  outboundLineId: string;
  skuId: string;
  lotId: string | null;
  quantity: number;
  priority: number;
}

export interface KitComponentInput {
  componentSkuId: string;
  quantityPerKit: number;
  scrapPercent?: number | null;
}

export interface KitComponentDemand {
  componentSkuId: string;
  requiredQuantity: number;
}

export interface DomainEventKeyInput {
  eventType: string;
  resourceType: string;
  resourceId: string;
  schemaVersion?: number;
  payload?: unknown;
}

export interface WebhookDeliveryEnvelopeInput {
  event: DomainEventKeyInput & { id: string; occurredAt?: Date | string | null };
  secret: string;
  timestampSeconds?: number;
}

export function normalizeEnterpriseCode(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

export function calculateYardDwellMinutes(input: {
  checkedInAt?: Date | string | null;
  checkedOutAt?: Date | string | null;
  now?: Date | string;
}): number | null {
  const checkedInAt = parseDate(input.checkedInAt);
  if (!checkedInAt) return null;
  const end = parseDate(input.checkedOutAt) ?? parseDate(input.now) ?? new Date();
  return Math.max(0, Math.floor((end.getTime() - checkedInAt.getTime()) / 60_000));
}

export function nextDockAppointmentStatus(
  action: 'CHECK_IN' | 'ASSIGN_DOCK' | 'START' | 'COMPLETE' | 'CANCEL' | 'NO_SHOW',
): DockAppointmentStatus {
  switch (action) {
    case 'CHECK_IN':
      return DockAppointmentStatus.CHECKED_IN;
    case 'ASSIGN_DOCK':
      return DockAppointmentStatus.DOCK_ASSIGNED;
    case 'START':
      return DockAppointmentStatus.IN_PROGRESS;
    case 'COMPLETE':
      return DockAppointmentStatus.COMPLETED;
    case 'CANCEL':
      return DockAppointmentStatus.CANCELLED;
    case 'NO_SHOW':
      return DockAppointmentStatus.NO_SHOW;
  }
}

export function nextYardTrailerStatus(
  action: 'CHECK_IN' | 'ASSIGN_DOCK' | 'START_LOAD' | 'START_UNLOAD' | 'CHECK_OUT' | 'CANCEL',
): YardTrailerStatus {
  switch (action) {
    case 'CHECK_IN':
      return YardTrailerStatus.CHECKED_IN;
    case 'ASSIGN_DOCK':
      return YardTrailerStatus.DOCKED;
    case 'START_LOAD':
      return YardTrailerStatus.LOADING;
    case 'START_UNLOAD':
      return YardTrailerStatus.UNLOADING;
    case 'CHECK_OUT':
      return YardTrailerStatus.CHECKED_OUT;
    case 'CANCEL':
      return YardTrailerStatus.CANCELLED;
  }
}

export function nextAutomationCommandStatus(input: {
  current: AutomationCommandStatus;
  action: 'CLAIM' | 'SEND' | 'COMPLETE' | 'FAIL' | 'DEAD_LETTER' | 'CANCEL';
}): AutomationCommandStatus {
  if (input.action === 'CANCEL') return AutomationCommandStatus.CANCELLED;
  if (input.action === 'DEAD_LETTER') return AutomationCommandStatus.DEAD_LETTER;

  const allowed: Record<
    AutomationCommandStatus,
    Partial<Record<typeof input.action, AutomationCommandStatus>>
  > = {
    [AutomationCommandStatus.QUEUED]: {
      CLAIM: AutomationCommandStatus.CLAIMED,
      FAIL: AutomationCommandStatus.FAILED,
    },
    [AutomationCommandStatus.CLAIMED]: {
      SEND: AutomationCommandStatus.SENT,
      COMPLETE: AutomationCommandStatus.COMPLETED,
      FAIL: AutomationCommandStatus.FAILED,
    },
    [AutomationCommandStatus.SENT]: {
      COMPLETE: AutomationCommandStatus.COMPLETED,
      FAIL: AutomationCommandStatus.FAILED,
    },
    [AutomationCommandStatus.FAILED]: {
      CLAIM: AutomationCommandStatus.CLAIMED,
    },
    [AutomationCommandStatus.COMPLETED]: {},
    [AutomationCommandStatus.DEAD_LETTER]: {},
    [AutomationCommandStatus.CANCELLED]: {},
  };

  const next = allowed[input.current][input.action];
  if (!next) {
    throw new Error(`Invalid automation command transition: ${input.current} -> ${input.action}`);
  }
  return next;
}

export function nextCrossDockPlanStatus(
  action: 'RELEASE' | 'START' | 'COMPLETE' | 'CANCEL' | 'EXCEPTION',
): CrossDockPlanStatus {
  switch (action) {
    case 'RELEASE':
      return CrossDockPlanStatus.RELEASED;
    case 'START':
      return CrossDockPlanStatus.IN_PROGRESS;
    case 'COMPLETE':
      return CrossDockPlanStatus.COMPLETED;
    case 'CANCEL':
      return CrossDockPlanStatus.CANCELLED;
    case 'EXCEPTION':
      return CrossDockPlanStatus.EXCEPTION;
  }
}

export function nextVasTaskStatus(
  action: 'ASSIGN' | 'START' | 'COMPLETE' | 'CANCEL' | 'FAIL',
): VasTaskStatus {
  switch (action) {
    case 'ASSIGN':
      return VasTaskStatus.ASSIGNED;
    case 'START':
      return VasTaskStatus.IN_PROGRESS;
    case 'COMPLETE':
      return VasTaskStatus.COMPLETED;
    case 'CANCEL':
      return VasTaskStatus.CANCELLED;
    case 'FAIL':
      return VasTaskStatus.FAILED;
  }
}

export function detectCrossDockOpportunities(input: {
  supplies: CrossDockSupplyInput[];
  demands: CrossDockDemandInput[];
}): CrossDockOpportunity[] {
  const remainingSupply = input.supplies
    .filter((supply) => supply.quantity > 0)
    .map((supply) => ({ ...supply, remainingQuantity: supply.quantity }));
  const demands = [...input.demands]
    .filter((demand) => demand.quantity > 0)
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  const opportunities: CrossDockOpportunity[] = [];

  for (const demand of demands) {
    let remainingDemand = demand.quantity;
    const candidateSupplies = remainingSupply
      .filter(
        (supply) =>
          supply.skuId === demand.skuId &&
          supply.remainingQuantity > 0 &&
          (!demand.lotId || supply.lotId === demand.lotId),
      )
      .sort((left, right) => compareExpiry(left.expiryDate, right.expiryDate));

    for (const supply of candidateSupplies) {
      if (remainingDemand <= 0) break;
      const quantity = Math.min(remainingDemand, supply.remainingQuantity);
      if (quantity <= 0) continue;

      opportunities.push({
        inboundLineId: supply.inboundLineId,
        outboundLineId: demand.outboundLineId,
        skuId: demand.skuId,
        lotId: supply.lotId ?? null,
        quantity,
        priority: demand.priority ?? 0,
      });
      supply.remainingQuantity -= quantity;
      remainingDemand -= quantity;
    }
  }

  return opportunities;
}

export function calculateKitComponentDemand(input: {
  kitQuantity: number;
  components: KitComponentInput[];
}): KitComponentDemand[] {
  if (!Number.isInteger(input.kitQuantity) || input.kitQuantity <= 0) {
    throw new Error('kitQuantity must be a positive integer.');
  }

  return input.components.map((component) => {
    if (!Number.isInteger(component.quantityPerKit) || component.quantityPerKit <= 0) {
      throw new Error('quantityPerKit must be a positive integer.');
    }
    const scrapMultiplier = 1 + Math.max(0, component.scrapPercent ?? 0) / 100;
    return {
      componentSkuId: component.componentSkuId,
      requiredQuantity: Math.ceil(input.kitQuantity * component.quantityPerKit * scrapMultiplier),
    };
  });
}

export function buildDomainEventKey(input: DomainEventKeyInput): string {
  const normalized = [
    normalizeEnterpriseCode(input.eventType),
    normalizeEnterpriseCode(input.resourceType),
    input.resourceId.trim(),
    String(input.schemaVersion ?? 1),
    hashJson(input.payload ?? {}),
  ].join(':');

  return createHash('sha256').update(normalized).digest('hex');
}

export function buildWebhookDeliveryEnvelope(input: WebhookDeliveryEnvelopeInput) {
  const timestampSeconds = input.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const payload = {
    id: input.event.id,
    type: normalizeEnterpriseCode(input.event.eventType),
    resourceType: normalizeEnterpriseCode(input.event.resourceType),
    resourceId: input.event.resourceId,
    schemaVersion: input.event.schemaVersion ?? 1,
    occurredAt: input.event.occurredAt ?? null,
    payload: input.event.payload ?? {},
  };

  return {
    timestampSeconds,
    payload,
    signature: createWebhookSignature({ payload, secret: input.secret, timestampSeconds }),
  };
}

export function shouldRetryWebhookDelivery(input: {
  status: DomainEventDeliveryStatus;
  attemptNumber: number;
  maxAttempts?: number;
}): boolean {
  const maxAttempts = input.maxAttempts ?? 5;
  return input.status === DomainEventDeliveryStatus.FAILED && input.attemptNumber < maxAttempts;
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(stableJsonStringify(value)).digest('hex').slice(0, 16);
}

function parseDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareExpiry(
  left: Date | string | null | undefined,
  right: Date | string | null | undefined,
): number {
  const leftDate = parseDate(left);
  const rightDate = parseDate(right);
  if (!leftDate && !rightDate) return 0;
  if (!leftDate) return 1;
  if (!rightDate) return -1;
  return leftDate.getTime() - rightDate.getTime();
}
