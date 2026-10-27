const SENSITIVE_KEY_PATTERN = /(authorization|cookie|password|secret|token|api[-_]?key|refresh|mfa|otp|credential)/i;

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > 8) {
    return '[redacted:depth]';
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactLogValue(item, depth + 1));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[redacted]'
      : redactLogValue(nested, depth + 1);
  }
  return redacted;
}

export function redactUrlQuery(value: string): string {
  const [path = '/', query = ''] = value.split('?', 2);
  if (!query) {
    return path;
  }

  const params = new URLSearchParams(query);
  for (const key of [...params.keys()]) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      params.set(key, '[redacted]');
    }
  }

  const serialized = params.toString();
  return serialized ? `${path}?${serialized}` : path;
}
