import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export interface TotpVerifyOptions {
  periodSeconds?: number;
  digits?: number;
  window?: number;
  timestamp?: number;
}

export interface EncryptedMfaSecretPayload {
  alg: 'A256GCM';
  kid?: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export function generateTotpSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes));
}

export function buildOtpAuthUri(input: {
  issuer: string;
  accountName: string;
  secret: string;
}): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.accountName)}`;
  const params = new URLSearchParams({ issuer: input.issuer, secret: input.secret, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export function verifyTotpCode(secret: string, code: string, options: TotpVerifyOptions = {}): boolean {
  if (!/^\d{6}$/.test(code)) return false;

  const periodSeconds = options.periodSeconds ?? 30;
  const digits = options.digits ?? 6;
  const window = options.window ?? 1;
  const timestamp = options.timestamp ?? Date.now();
  const counter = Math.floor(timestamp / 1000 / periodSeconds);

  for (let offset = -window; offset <= window; offset += 1) {
    const expected = generateTotpCode(secret, counter + offset, digits);
    const expectedBuffer = Buffer.from(expected);
    const codeBuffer = Buffer.from(code);
    if (expectedBuffer.length === codeBuffer.length && timingSafeEqual(expectedBuffer, codeBuffer)) {
      return true;
    }
  }

  return false;
}

export function encryptMfaSecret(secret: string, encryptionSecret: string, keyId?: string): EncryptedMfaSecretPayload {
  const key = deriveKey(encryptionSecret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    alg: 'A256GCM',
    ...(keyId ? { kid: keyId } : {}),
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

export function decryptMfaSecret(payload: unknown, encryptionSecret: string): string {
  if (!isEncryptedMfaSecretPayload(payload)) {
    throw new Error('Unsupported MFA secret payload');
  }

  const key = deriveKey(encryptionSecret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function isEncryptedMfaSecretPayload(payload: unknown): payload is EncryptedMfaSecretPayload {
  return typeof payload === 'object' && payload !== null &&
    (payload as { alg?: unknown }).alg === 'A256GCM' &&
    typeof (payload as { iv?: unknown }).iv === 'string' &&
    typeof (payload as { tag?: unknown }).tag === 'string' &&
    typeof (payload as { ciphertext?: unknown }).ciphertext === 'string';
}

function generateTotpCode(secret: string, counter: number, digits: number): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary = ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(value: string): Buffer {
  const clean = value.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

function deriveKey(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
