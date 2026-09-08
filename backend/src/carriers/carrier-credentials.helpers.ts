import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { normalizeCarrierCode } from './carriers.helpers';

export const CARRIER_CREDENTIAL_ALGORITHM = 'aes-256-gcm';
export const DEFAULT_CARRIER_CREDENTIAL_KEY_VERSION = 'v1';

export interface EncryptedCarrierSecretBundle {
  algorithm: typeof CARRIER_CREDENTIAL_ALGORITHM;
  keyVersion: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  fingerprint: string;
  last4: string | null;
  encryptedAt: string;
}

export interface EncryptCarrierSecretsInput {
  secrets: Record<string, unknown>;
  encryptionKey: string;
  keyVersion?: string | null;
  now?: Date;
}

export function normalizeCarrierCredentialEnvironment(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() || 'TEST';
  return normalized.replace(/[^A-Z0-9_-]/g, '_').slice(0, 32) || 'TEST';
}

export function normalizeCarrierCredentialStatus(value: string | null | undefined): 'ACTIVE' | 'INACTIVE' | 'ROTATED' | 'REVOKED' {
  const normalized = value?.trim().toUpperCase() || 'ACTIVE';
  if (['ACTIVE', 'INACTIVE', 'ROTATED', 'REVOKED'].includes(normalized)) {
    return normalized as 'ACTIVE' | 'INACTIVE' | 'ROTATED' | 'REVOKED';
  }
  return 'ACTIVE';
}

export function normalizeCarrierCredentialSecrets(secrets: Record<string, unknown>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(secrets)) {
    const secretKey = key.trim();
    if (!secretKey) continue;
    if (typeof value !== 'string') continue;
    const secretValue = value.trim();
    if (!secretValue) continue;
    normalized[secretKey] = secretValue;
  }
  return normalized;
}

export function encryptCarrierSecrets(input: EncryptCarrierSecretsInput): EncryptedCarrierSecretBundle {
  const secrets = normalizeCarrierCredentialSecrets(input.secrets);
  const serialized = stableJsonStringify(secrets);
  const iv = randomBytes(12);
  const key = deriveCarrierCredentialKey(input.encryptionKey);
  const cipher = createCipheriv(CARRIER_CREDENTIAL_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const keyVersion = normalizeKeyVersion(input.keyVersion);

  return {
    algorithm: CARRIER_CREDENTIAL_ALGORITHM,
    keyVersion,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    fingerprint: fingerprintSecrets(secrets),
    last4: getSecretsLast4(secrets),
    encryptedAt: (input.now ?? new Date()).toISOString(),
  };
}

export function decryptCarrierSecrets(bundle: EncryptedCarrierSecretBundle, encryptionKey: string): Record<string, string> {
  if (bundle.algorithm !== CARRIER_CREDENTIAL_ALGORITHM) {
    throw new Error(`Unsupported carrier credential algorithm: ${bundle.algorithm}`);
  }

  const decipher = createDecipheriv(
    CARRIER_CREDENTIAL_ALGORITHM,
    deriveCarrierCredentialKey(encryptionKey),
    Buffer.from(bundle.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(bundle.authTag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(bundle.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
  const parsed = JSON.parse(plaintext) as Record<string, unknown>;
  return normalizeCarrierCredentialSecrets(parsed);
}

export function summarizeCarrierCredential(input: {
  carrier: string;
  environment?: string | null;
  secrets?: Record<string, unknown> | null;
}): { carrier: string; environment: string; secretKeys: string[] } {
  return {
    carrier: normalizeCarrierCode(input.carrier),
    environment: normalizeCarrierCredentialEnvironment(input.environment),
    secretKeys: Object.keys(normalizeCarrierCredentialSecrets(input.secrets ?? {})).sort(),
  };
}

export function maskCarrierSecret(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const visible = normalized.slice(-4);
  return `${'*'.repeat(Math.max(4, Math.min(12, normalized.length - visible.length)))}${visible}`;
}

function deriveCarrierCredentialKey(value: string): Buffer {
  const normalized = value.trim();
  if (normalized.length < 32) {
    throw new Error('CARRIER_CREDENTIAL_ENCRYPTION_KEY must be at least 32 characters long');
  }
  return createHash('sha256').update(normalized, 'utf8').digest();
}

function normalizeKeyVersion(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized.slice(0, 40) : DEFAULT_CARRIER_CREDENTIAL_KEY_VERSION;
}

function fingerprintSecrets(secrets: Record<string, string>): string {
  return createHash('sha256').update(stableJsonStringify(secrets), 'utf8').digest('hex');
}

function getSecretsLast4(secrets: Record<string, string>): string | null {
  const values = Object.values(secrets).filter((value) => value.length > 0).sort();
  return values.length ? values.at(-1)!.slice(-4) : null;
}

function stableJsonStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortJsonValue(nested)]),
    );
  }
  return value;
}
