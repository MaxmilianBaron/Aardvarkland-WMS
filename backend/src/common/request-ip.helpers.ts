export interface ClientIpRequestShape {
  headers: Record<string, string | string[] | undefined>;
  ip?: string | null;
  socket?: { remoteAddress?: string | null } | null;
}

export interface ClientIpOptions {
  trustProxyHops?: number;
}

export function getClientIpAddress(
  request: ClientIpRequestShape,
  options: ClientIpOptions = {},
): string {
  const trustProxyHops = clampTrustProxyHops(options.trustProxyHops ?? 0);
  const forwardedChain = trustProxyHops > 0 ? parseForwardedFor(readHeader(request.headers, 'x-forwarded-for')) : [];
  const forwardedIp = selectForwardedClientIp(forwardedChain, trustProxyHops);
  return forwardedIp ?? normalizeIp(request.ip) ?? normalizeIp(request.socket?.remoteAddress) ?? 'unknown';
}

export function parseForwardedFor(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => normalizeIp(part))
    .filter((part): part is string => Boolean(part));
}

function selectForwardedClientIp(chain: string[], trustProxyHops: number): string | null {
  if (chain.length === 0 || trustProxyHops <= 0) {
    return null;
  }

  return chain[Math.max(0, chain.length - trustProxyHops - 1)] ?? null;
}

function normalizeIp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('::ffff:')) {
    return trimmed.slice('::ffff:'.length);
  }

  return trimmed;
}

function readHeader(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const direct = headers[key];
  const lower = headers[key.toLowerCase()];
  const value = direct ?? lower;
  return Array.isArray(value) ? value[0] : value;
}

function clampTrustProxyHops(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(10, Math.max(0, Math.trunc(value)));
}
