import { ConflictException } from '@nestjs/common';

export interface TraceabilityPolicy {
  lotRequired: boolean;
  serialRequired: boolean;
  expiryRequired: boolean;
}

export interface TraceabilityCaptureInput {
  operation: string;
  quantity: number;
  policy: TraceabilityPolicy;
  serialNumbers?: readonly string[] | null;
  lotReference?: string | null;
  expiry?: Date | string | null;
}

const EMPTY_POLICY: TraceabilityPolicy = {
  lotRequired: false,
  serialRequired: false,
  expiryRequired: false,
};

export function resolveTraceabilityPolicy(...sources: readonly unknown[]): TraceabilityPolicy {
  return sources.reduce<TraceabilityPolicy>((policy, source) => mergePolicy(policy, readPolicy(source)), {
    ...EMPTY_POLICY,
  });
}

export function normalizeSerialNumbers(serialNumbers: readonly string[] | null | undefined): string[] {
  if (!serialNumbers) return [];

  const normalized = serialNumbers.map((value) => value.trim()).filter((value) => value.length > 0);
  const duplicates = findDuplicates(normalized.map((value) => value.toUpperCase()));

  if (duplicates.length > 0) {
    throw new ConflictException(`Duplicate serial numbers are not allowed: ${duplicates.join(', ')}`);
  }

  return normalized;
}

export function assertTraceabilityCapture(input: TraceabilityCaptureInput): string[] {
  const serialNumbers = normalizeSerialNumbers(input.serialNumbers);
  const quantity = Math.max(0, Math.trunc(input.quantity));
  const violations: string[] = [];

  if (input.policy.lotRequired && !hasValue(input.lotReference)) {
    violations.push(`${input.operation} requires a lot/batch reference for this SKU`);
  }

  if (input.policy.expiryRequired && !hasValue(input.expiry)) {
    violations.push(`${input.operation} requires an expiry date for this SKU`);
  }

  if (input.policy.serialRequired && serialNumbers.length !== quantity) {
    violations.push(`${input.operation} requires exactly ${quantity} serial number${quantity === 1 ? '' : 's'}; received ${serialNumbers.length}`);
  }

  if (!input.policy.serialRequired && serialNumbers.length > quantity) {
    violations.push(`${input.operation} received ${serialNumbers.length} serial numbers for quantity ${quantity}`);
  }

  if (violations.length > 0) {
    throw new ConflictException(violations.join('; '));
  }

  return serialNumbers;
}

function readPolicy(source: unknown): TraceabilityPolicy {
  const record = asRecord(source);
  if (!record) return EMPTY_POLICY;

  const nested = asRecord(record['traceability']) ?? asRecord(record['traceabilityPolicy']);

  return {
    lotRequired: readBoolean(record, nested, 'lotRequired', 'requiresLot', 'lotTrackingRequired'),
    serialRequired: readBoolean(record, nested, 'serialRequired', 'requiresSerial', 'serialTrackingRequired'),
    expiryRequired: readBoolean(record, nested, 'expiryRequired', 'requiresExpiry', 'expiryTrackingRequired'),
  };
}

function mergePolicy(left: TraceabilityPolicy, right: TraceabilityPolicy): TraceabilityPolicy {
  return {
    lotRequired: left.lotRequired || right.lotRequired,
    serialRequired: left.serialRequired || right.serialRequired,
    expiryRequired: left.expiryRequired || right.expiryRequired,
  };
}

function readBoolean(
  record: Record<string, unknown>,
  nested: Record<string, unknown> | null,
  ...keys: readonly string[]
): boolean {
  for (const key of keys) {
    const nestedValue = nested?.[key];
    if (typeof nestedValue === 'boolean') return nestedValue;
    if (typeof nestedValue === 'string') return parseBooleanString(nestedValue);

    const rootValue = record[key];
    if (typeof rootValue === 'boolean') return rootValue;
    if (typeof rootValue === 'string') return parseBooleanString(rootValue);
  }

  return false;
}

function parseBooleanString(value: string): boolean {
  return ['1', 'true', 'yes', 'required', 'enabled'].includes(value.trim().toLowerCase());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  return Array.from(duplicates).sort();
}
