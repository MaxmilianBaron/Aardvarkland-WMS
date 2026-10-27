export const OWNER_CLIENT_MIRROR_RESOURCES = {
  INBOUND_SHIPMENT: 'inboundShipment',
  OUTBOUND_ORDER: 'outboundOrder',
  HANDLING_UNIT: 'handlingUnit',
  STOCK_QUANT: 'stockQuant',
  RESERVATION: 'reservation',
  WAREHOUSE_TASK: 'warehouseTask',
  STOCK_MOVEMENT: 'stockMovement',
  SHIPMENT: 'shipment',
  SHIPMENT_PACKAGE: 'shipmentPackage',
  CARRIER_LABEL: 'carrierLabel',
  PICK_WAVE: 'pickWave',
} as const;

export type OwnerClientMirrorResourceType = keyof typeof OWNER_CLIENT_MIRROR_RESOURCES;
export type OwnerClientMirrorDelegateName = (typeof OWNER_CLIENT_MIRROR_RESOURCES)[OwnerClientMirrorResourceType];

export interface OwnerClientMirrorDelegate {
  update(args: { where: { id: string }; data: { ownerClientId: string | null } }): Promise<unknown>;
}

export interface OwnerClientMirrorClient {
  [delegateName: string]: unknown;
}

export interface MirrorOwnerClientInput {
  resourceType: string;
  resourceId: string | null | undefined;
  clientId: string | null;
}

export function getOwnerClientMirrorDelegateName(resourceType: string): OwnerClientMirrorDelegateName | null {
  const normalized = normalizeOwnerClientResourceType(resourceType);
  return (OWNER_CLIENT_MIRROR_RESOURCES as Record<string, OwnerClientMirrorDelegateName>)[normalized] ?? null;
}

export function isOwnerClientMirrorResource(resourceType: string): resourceType is OwnerClientMirrorResourceType {
  return getOwnerClientMirrorDelegateName(resourceType) !== null;
}

export async function mirrorOwnerClientIdToResource(
  client: OwnerClientMirrorClient,
  input: MirrorOwnerClientInput,
): Promise<boolean> {
  if (!input.resourceId) return false;
  const delegateName = getOwnerClientMirrorDelegateName(input.resourceType);
  if (!delegateName) return false;

  const delegate = client[delegateName];
  if (!isOwnerClientMirrorDelegate(delegate)) return false;

  await delegate.update({ where: { id: input.resourceId }, data: { ownerClientId: input.clientId } });
  return true;
}

export function buildOwnerClientBackfillResourceTypes(): OwnerClientMirrorResourceType[] {
  return Object.keys(OWNER_CLIENT_MIRROR_RESOURCES) as OwnerClientMirrorResourceType[];
}

function normalizeOwnerClientResourceType(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function isOwnerClientMirrorDelegate(value: unknown): value is OwnerClientMirrorDelegate {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'update' in value &&
      typeof (value as { update?: unknown }).update === 'function',
  );
}
