import { NotImplementedException } from '@nestjs/common';

export interface RuntimeDelegate<Model> {
  findFirst(args: Record<string, unknown>): Promise<Model | null>;
  findMany(args: Record<string, unknown>): Promise<Model[]>;
  create(args: Record<string, unknown>): Promise<Model>;
  update(args: Record<string, unknown>): Promise<Model>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
}

interface RuntimeModelField {
  kind?: string;
  name: string;
}

interface RuntimeModel {
  fields?: RuntimeModelField[];
}

interface RuntimeDataModel {
  models?: Record<string, RuntimeModel | undefined>;
}

interface RuntimeDataModelCarrier {
  _runtimeDataModel?: RuntimeDataModel;
}

export function getDelegate<Model>(
  client: unknown,
  delegateName: string,
  modelLabel: string,
): RuntimeDelegate<Model> {
  const delegate = readDelegate<Model>(client, delegateName);

  if (!delegate) {
    throw new NotImplementedException(
      `${modelLabel} Prisma model is not available. Run the inventory/reservation migration and prisma generate first.`,
    );
  }

  return delegate;
}

export function maybeDelegate<Model>(
  client: unknown,
  delegateName: string,
): RuntimeDelegate<Model> | undefined {
  return readDelegate<Model>(client, delegateName);
}

export function getModelFields(client: unknown, modelName: string): Set<string> {
  const carrier = client as RuntimeDataModelCarrier;
  const fields = carrier._runtimeDataModel?.models?.[modelName]?.fields ?? [];

  return new Set(fields.filter((field) => field.kind !== 'object').map((field) => field.name));
}

export function firstField(fields: Set<string>, candidates: readonly string[]): string | undefined {
  return candidates.find((candidate) => fields.has(candidate));
}

export function pickModelData(
  fields: Set<string>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && fields.has(key)) {
      data[key] = value;
    }
  }

  return data;
}

export function modelHasAnyField(fields: Set<string>, candidates: readonly string[]): boolean {
  return candidates.some((candidate) => fields.has(candidate));
}

export function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readNullableString(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = record[key];

  if (value === null) {
    return null;
  }

  return typeof value === 'string' ? value : undefined;
}

export function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readDate(record: Record<string, unknown>, key: string): Date | null | undefined {
  const value = record[key];

  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'string') {
    const date = new Date(value);

    return Number.isNaN(date.valueOf()) ? undefined : date;
  }

  return undefined;
}

function readDelegate<Model>(
  client: unknown,
  delegateName: string,
): RuntimeDelegate<Model> | undefined {
  const delegate = (client as Record<string, unknown>)[delegateName];

  if (!isRuntimeDelegate(delegate)) {
    return undefined;
  }

  return delegate as RuntimeDelegate<Model>;
}

function isRuntimeDelegate(value: unknown): value is RuntimeDelegate<unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const delegate = value as Partial<RuntimeDelegate<unknown>>;

  return (
    typeof delegate.findFirst === 'function' &&
    typeof delegate.findMany === 'function' &&
    typeof delegate.create === 'function' &&
    typeof delegate.update === 'function' &&
    typeof delegate.updateMany === 'function'
  );
}
