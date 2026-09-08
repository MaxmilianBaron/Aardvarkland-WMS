export interface TransactionRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
  shouldRetry?: (error: unknown) => boolean;
}

export interface TransactionRetryAttempt {
  attempt: number;
  retryable: boolean;
  delayMs: number | null;
  error: unknown;
}

export interface TransactionRetryState {
  attempts: TransactionRetryAttempt[];
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 25;
const DEFAULT_MAX_DELAY_MS = 500;
const RETRYABLE_PRISMA_CODES = new Set(['P2034']);
const RETRYABLE_DATABASE_CODES = new Set(['40001', '40P01']);

export async function withTransactionRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: TransactionRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const sleep = options.sleep ?? defaultSleep;
  const shouldRetry = options.shouldRetry ?? isRetryableTransactionError;

  if (!Number.isInteger(maxAttempts) || maxAttempts <= 0) {
    throw new Error('maxAttempts must be a positive integer.');
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = shouldRetry(error);
      const hasAttemptsLeft = attempt < maxAttempts;

      if (!retryable || !hasAttemptsLeft) {
        throw error;
      }

      await sleep(
        getTransactionRetryDelayMs(attempt, {
          baseDelayMs: options.baseDelayMs,
          maxDelayMs: options.maxDelayMs,
        }),
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Transaction retry failed.');
}

export function getTransactionRetryDelayMs(
  attempt: number,
  input: { baseDelayMs?: number; maxDelayMs?: number } = {},
): number {
  if (!Number.isInteger(attempt) || attempt <= 0) {
    throw new Error('attempt must be a positive integer.');
  }

  const baseDelayMs = input.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = input.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const exponentialDelay = baseDelayMs * 2 ** (attempt - 1);

  return Math.min(exponentialDelay, maxDelayMs);
}

export function isRetryableTransactionError(error: unknown): boolean {
  const record = toErrorRecord(error);

  if (!record) {
    return false;
  }

  if (isRetryableCode(record['code'])) {
    return true;
  }

  if (isRetryableCode(record['sqlState'])) {
    return true;
  }

  if (isRetryableCode(record['errcode'])) {
    return true;
  }

  const meta = toErrorRecord(record['meta']);

  if (meta && (isRetryableCode(meta['code']) || isRetryableCode(meta['sqlState']))) {
    return true;
  }

  const cause = toErrorRecord(record['cause']);

  if (cause && (isRetryableCode(cause['code']) || isRetryableCode(cause['sqlState']))) {
    return true;
  }

  const message = typeof record['message'] === 'string' ? record['message'].toLowerCase() : '';

  return (
    message.includes('could not serialize access') ||
    message.includes('deadlock detected') ||
    message.includes('serialization failure')
  );
}

function isRetryableCode(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  return RETRYABLE_PRISMA_CODES.has(value) || RETRYABLE_DATABASE_CODES.has(value);
}

function toErrorRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
