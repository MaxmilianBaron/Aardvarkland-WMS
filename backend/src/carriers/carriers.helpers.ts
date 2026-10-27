import { createHash } from 'node:crypto';

import {
  CarrierAdapterCapability,
  CarrierLabelRequest,
  CarrierLabelResult,
  CarrierManifestResult,
  CarrierServiceProfile,
} from './carriers.types';

const INTERNAL_CARRIERS = new Set(['INTERNAL', 'PICKUP', 'WILL_CALL', 'CUSTOMER_PICKUP']);
const KNOWN_CARRIER_NAMES: Record<string, string> = {
  CARRIER_A: 'CARRIER_A',
  CARRIER_B: 'CARRIER_B',
  CARRIER_C: 'Carrier C',
  CARRIER_D: 'Carrier D',
  GLS: 'GLS',
  DPD: 'DPD',
  INTERNAL: 'Internal transfer',
  PICKUP: 'Customer pickup',
};

export function normalizeCarrierCode(value: string | null | undefined): string {
  const normalized = value?.trim().replace(/[\s-]+/g, '_').toUpperCase() ?? '';

  return normalized.length > 0 ? normalized : 'INTERNAL';
}

export function carrierRequiresLabel(carrier: string | null | undefined): boolean {
  return !INTERNAL_CARRIERS.has(normalizeCarrierCode(carrier));
}

export function getCarrierServiceProfile(carrierInput: string): CarrierServiceProfile {
  const carrier = normalizeCarrierCode(carrierInput);
  const requiresLabel = carrierRequiresLabel(carrier);
  const capabilities = requiresLabel
    ? [CarrierAdapterCapability.LABEL, CarrierAdapterCapability.VOID_LABEL, CarrierAdapterCapability.MANIFEST, CarrierAdapterCapability.TRACKING]
    : [CarrierAdapterCapability.TRACKING];

  return {
    carrier,
    displayName: KNOWN_CARRIER_NAMES[carrier] ?? carrier,
    requiresLabel,
    supportsManifest: requiresLabel,
    supportsVoid: requiresLabel,
    capabilities,
  };
}

export function listCarrierProfiles(carriers: string[] = Object.keys(KNOWN_CARRIER_NAMES)): CarrierServiceProfile[] {
  return Array.from(new Set(carriers.map(normalizeCarrierCode))).map(getCarrierServiceProfile);
}

export function validateCarrierLabelRequest(input: CarrierLabelRequest): string[] {
  const issues: string[] = [];
  const carrier = normalizeCarrierCode(input.carrier);

  if (!input.warehouseId) issues.push('WAREHOUSE_REQUIRED');
  if (!input.shipmentId || !input.shipmentNumber) issues.push('SHIPMENT_REQUIRED');
  if (carrierRequiresLabel(carrier) && !input.packageId) issues.push('PACKAGE_REQUIRED_FOR_CARRIER_LABEL');
  if (input.dimensions?.weightGrams !== undefined && input.dimensions.weightGrams !== null && input.dimensions.weightGrams <= 0) {
    issues.push('INVALID_WEIGHT');
  }

  return issues;
}

export function createCarrierLabelPayload(input: CarrierLabelRequest): CarrierLabelResult {
  const carrier = normalizeCarrierCode(input.carrier);
  const idempotencyKey = normalizeIdempotencyKey(input);
  const labelReference = `${carrier}-${shortHash(`${input.shipmentNumber}:${input.packageCode ?? input.packageId ?? 'SHIPMENT'}:${idempotencyKey}`)}`;
  const trackingNumber = `${carrier}-${shortHash(`${labelReference}:${input.warehouseId}`).slice(0, 14)}`;
  const labelFormat = carrier === 'CARRIER_D' ? 'PDF' : 'ZPL';
  const labelData = Buffer.from(JSON.stringify({ carrier, serviceLevel: input.serviceLevel ?? null, shipmentNumber: input.shipmentNumber, packageCode: input.packageCode ?? null, trackingNumber, testMode: true })).toString('base64');

  return { carrier, serviceLevel: input.serviceLevel ?? null, labelReference, trackingNumber, labelFormat, labelData, idempotencyKey, testMode: true };
}

export function createCarrierManifestPayload(input: { carrier: string; warehouseId: string; shipmentCount: number; packageCount: number; closedAt?: Date }): CarrierManifestResult {
  const carrier = normalizeCarrierCode(input.carrier);
  const closedAt = input.closedAt ?? new Date();

  return {
    carrier,
    manifestReference: `${carrier}-MAN-${shortHash(`${input.warehouseId}:${input.shipmentCount}:${input.packageCount}:${closedAt.toISOString()}`)}`,
    shipmentCount: input.shipmentCount,
    packageCount: input.packageCount,
    closedAt: closedAt.toISOString(),
    testMode: true,
  };
}

function normalizeIdempotencyKey(input: CarrierLabelRequest): string {
  return input.idempotencyKey?.trim() || shortHash(`${input.carrier}:${input.shipmentId}:${input.packageId ?? 'shipment'}`);
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16).toUpperCase();
}
