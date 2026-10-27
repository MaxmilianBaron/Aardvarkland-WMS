export type DynamicWhere = Record<string, unknown>;

export interface RuntimeCountArgs {
  where?: DynamicWhere;
}

export interface RuntimeFindManyArgs {
  orderBy?: Record<string, unknown> | Record<string, unknown>[];
  take?: number;
  where?: DynamicWhere;
}

export interface RuntimeCountDelegate {
  count(args?: RuntimeCountArgs): Promise<number>;
}

export interface RuntimeFindManyDelegate {
  findMany(args?: RuntimeFindManyArgs): Promise<unknown[]>;
}

export type RuntimeModelDelegate = Partial<RuntimeCountDelegate & RuntimeFindManyDelegate>;

export function getRuntimeDelegate(
  source: object,
  delegateName: string,
): RuntimeModelDelegate | null {
  const value = (source as unknown as Record<string, unknown>)[delegateName];

  if (!isRecord(value)) {
    return null;
  }

  if (typeof value['count'] !== 'function' && typeof value['findMany'] !== 'function') {
    return null;
  }

  return value;
}

export async function safeRuntimeCount(
  delegate: RuntimeModelDelegate | null,
  where: DynamicWhere,
): Promise<number | null> {
  if (!delegate?.count) {
    return null;
  }

  try {
    return await delegate.count({ where });
  } catch {
    return null;
  }
}

export async function safeRuntimeFindMany(
  delegate: RuntimeModelDelegate | null,
  args: RuntimeFindManyArgs,
): Promise<unknown[] | null> {
  if (!delegate?.findMany) {
    return null;
  }

  try {
    return await delegate.findMany(args);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
