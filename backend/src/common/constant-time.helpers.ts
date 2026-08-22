import { createHash, timingSafeEqual } from 'node:crypto';

export function safeCompareSecrets(expected: string | null | undefined, received: string | null | undefined): boolean {
  if (!expected || !received) {
    return false;
  }

  const expectedHash = hashSecret(expected);
  const receivedHash = hashSecret(received);

  return timingSafeEqual(expectedHash, receivedHash);
}

function hashSecret(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
