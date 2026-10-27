export interface OffsetPaginationInput {
  take?: number | null;
  skip?: number | null;
}

export interface OffsetPaginationOptions {
  defaultTake?: number;
  maxTake?: number;
}

export interface NormalizedOffsetPagination {
  take: number;
  skip: number;
  nextSkip: number;
}

export interface PageEnvelopeInput<T> {
  items: T[];
  take: number;
  skip: number;
  total?: number | null;
}

export interface PageEnvelope<T> {
  items: T[];
  page: {
    take: number;
    skip: number;
    returned: number;
    total: number | null;
    hasNext: boolean;
    nextSkip: number | null;
  };
}

const DEFAULT_TAKE = 100;
const DEFAULT_MAX_TAKE = 500;

export function normalizeOffsetPagination(
  input: OffsetPaginationInput = {},
  options: OffsetPaginationOptions = {},
): NormalizedOffsetPagination {
  const maxTake = positiveOrDefault(options.maxTake, DEFAULT_MAX_TAKE);
  const defaultTake = Math.min(positiveOrDefault(options.defaultTake, DEFAULT_TAKE), maxTake);
  const take = clampPositiveInteger(input.take, defaultTake, maxTake);
  const skip = clampNonNegativeInteger(input.skip, 0);

  return {
    take,
    skip,
    nextSkip: skip + take,
  };
}

export function makePageEnvelope<T>(input: PageEnvelopeInput<T>): PageEnvelope<T> {
  const total = typeof input.total === 'number' && Number.isFinite(input.total) ? input.total : null;
  const returned = input.items.length;
  const nextSkip = input.skip + returned;
  const hasNext = total === null ? returned >= input.take : nextSkip < total;

  return {
    items: input.items,
    page: {
      take: input.take,
      skip: input.skip,
      returned,
      total,
      hasNext,
      nextSkip: hasNext ? nextSkip : null,
    },
  };
}

function positiveOrDefault(value: number | null | undefined, fallback: number): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    return fallback;
  }

  return value as number;
}

function clampPositiveInteger(
  value: number | null | undefined,
  fallback: number,
  max: number,
): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    return fallback;
  }

  return Math.min(value as number, max);
}

function clampNonNegativeInteger(value: number | null | undefined, fallback: number): number {
  if (!Number.isInteger(value) || (value ?? -1) < 0) {
    return fallback;
  }

  return value as number;
}
