export const PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD = 5;
export const PRINT_AGENT_TOKEN_LOCK_SECONDS = 15 * 60;

export function isPrintAgentAuthLocked(
  lockedUntil: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!lockedUntil) {
    return false;
  }

  const lockExpiresAt = lockedUntil instanceof Date ? lockedUntil : new Date(lockedUntil);

  return Number.isFinite(lockExpiresAt.getTime()) && lockExpiresAt.getTime() > now.getTime();
}
