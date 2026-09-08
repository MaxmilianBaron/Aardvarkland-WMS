export const CLIENT_RESOURCE_TYPES = {
  INBOUND_SHIPMENT: 'INBOUND_SHIPMENT',
  STOCK_QUANT: 'STOCK_QUANT',
  OUTBOUND_ORDER: 'OUTBOUND_ORDER',
  RESERVATION: 'RESERVATION',
  WAREHOUSE_TASK: 'WAREHOUSE_TASK',
  STOCK_MOVEMENT: 'STOCK_MOVEMENT',
  SHIPMENT: 'SHIPMENT',
  SHIPMENT_PACKAGE: 'SHIPMENT_PACKAGE',
  CARRIER_LABEL: 'CARRIER_LABEL',
  PICK_WAVE: 'PICK_WAVE',
  PICK_CART: 'PICK_CART',
  PICK_TOTE: 'PICK_TOTE',
  BILLING_EVENT: 'BILLING_EVENT',
  BILLING_INVOICE: 'BILLING_INVOICE',
} as const;

export type ClientResourceType = (typeof CLIENT_RESOURCE_TYPES)[keyof typeof CLIENT_RESOURCE_TYPES] | string;

export interface OwnershipCandidate {
  resourceType: ClientResourceType;
  resourceId?: string | null;
}

export interface OwnershipMetadataInput {
  source?: string | null;
  reason?: string | null;
  sourceResourceType?: string | null;
  sourceResourceId?: string | null;
  inheritedFrom?: OwnershipCandidate | null;
  metadata?: Record<string, unknown> | null;
}

export function normalizeClientResourceType(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/[\s-]+/g, '_').toUpperCase();
  return normalized || null;
}

export function buildOwnershipMetadata(input: OwnershipMetadataInput = {}): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    ownershipSource: input.source ?? 'runtime',
  };

  if (input.reason) metadata['reason'] = input.reason;
  if (input.sourceResourceType) metadata['sourceResourceType'] = normalizeClientResourceType(input.sourceResourceType);
  if (input.sourceResourceId) metadata['sourceResourceId'] = input.sourceResourceId;
  if (input.inheritedFrom?.resourceType) {
    metadata['inheritedFromResourceType'] = normalizeClientResourceType(input.inheritedFrom.resourceType);
  }
  if (input.inheritedFrom?.resourceId) metadata['inheritedFromResourceId'] = input.inheritedFrom.resourceId;

  return mergeOwnershipMetadata(metadata, input.metadata ?? null);
}

export function mergeOwnershipMetadata(
  existing: unknown,
  next: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return {
    ...toPlainObject(existing),
    ...(next ?? {}),
  };
}

export function shouldTransferOwnership(input: {
  existingClientId?: string | null;
  requestedClientId?: string | null;
  allowOwnerTransfer?: boolean | null;
}): boolean {
  if (!input.existingClientId || !input.requestedClientId) return false;
  if (input.existingClientId === input.requestedClientId) return false;
  return input.allowOwnerTransfer === true;
}

export function isOwnershipConflict(input: {
  existingClientId?: string | null;
  requestedClientId?: string | null;
  allowOwnerTransfer?: boolean | null;
}): boolean {
  if (!input.existingClientId || !input.requestedClientId) return false;
  if (input.existingClientId === input.requestedClientId) return false;
  return input.allowOwnerTransfer !== true;
}

export function uniqueOwnershipCandidates(candidates: OwnershipCandidate[]): OwnershipCandidate[] {
  const seen = new Set<string>();
  const unique: OwnershipCandidate[] = [];
  for (const candidate of candidates) {
    const resourceType = normalizeClientResourceType(candidate.resourceType);
    const resourceId = candidate.resourceId?.trim();
    if (!resourceType || !resourceId) continue;
    const key = `${resourceType}:${resourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ resourceType, resourceId });
  }
  return unique;
}

function toPlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
