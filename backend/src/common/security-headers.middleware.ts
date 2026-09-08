export interface SecurityHeadersOptions {
  enableStrictTransportSecurity?: boolean;
  nodeEnv?: string;
  strictTransportSecurityMaxAgeSeconds?: number;
}

export interface SecurityHeadersResponse {
  setHeader(name: string, value: string): void;
}

export type SecurityHeadersNextFunction = () => void;

const BASE_SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['X-Content-Type-Options', 'nosniff'],
  ['X-Frame-Options', 'DENY'],
  ['X-XSS-Protection', '0'],
  ['Referrer-Policy', 'no-referrer'],
  ['Permissions-Policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Resource-Policy', 'same-site'],
];

export function createSecurityHeadersMiddleware(options: SecurityHeadersOptions = {}) {
  const hstsMaxAge = normalizeHstsMaxAge(options.strictTransportSecurityMaxAgeSeconds);
  const enableStrictTransportSecurity = options.enableStrictTransportSecurity ?? options.nodeEnv === 'production';
  const contentSecurityPolicy = buildContentSecurityPolicy(options.nodeEnv);

  return (_request: unknown, response: SecurityHeadersResponse, next: SecurityHeadersNextFunction): void => {
    for (const [name, value] of BASE_SECURITY_HEADERS) {
      response.setHeader(name, value);
    }
    response.setHeader('Content-Security-Policy', contentSecurityPolicy);

    if (enableStrictTransportSecurity) {
      response.setHeader('Strict-Transport-Security', `max-age=${hstsMaxAge}; includeSubDomains`);
    }

    next();
  };
}

function normalizeHstsMaxAge(value: number | undefined): number {
  if (!Number.isInteger(value) || (value ?? 0) <= 0) {
    return 31_536_000;
  }

  return Math.min(value as number, 63_072_000);
}

function buildContentSecurityPolicy(nodeEnv?: string): string {
  const connectSrc = nodeEnv === 'development' || nodeEnv === 'test'
    ? "'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:*"
    : "'self'";
  const scriptSrc = nodeEnv === 'development' || nodeEnv === 'test'
    ? "'self' 'unsafe-inline'"
    : "'self'";
  const styleSrc = nodeEnv === 'development' || nodeEnv === 'test'
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "form-action 'self'",
  ].join('; ');
}
