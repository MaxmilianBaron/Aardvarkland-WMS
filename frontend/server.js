import { createServer, request as httpRequest } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(root, 'dist');
const port = Number(process.env.PORT || 4000);
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:4001';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function configuredApiOrigin() {
  const apiBaseUrl = process.env.API_BASE_URL || '/api';

  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return 'http://localhost:4001';
  }
}

function buildContentSecurityPolicy() {
  const connectSources = new Set(["'self'", configuredApiOrigin()]);

  if (connectSources.has('http://localhost:4001')) connectSources.add('http://127.0.0.1:4001');
  if (connectSources.has('http://127.0.0.1:4001')) connectSources.add('http://localhost:4001');

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${[...connectSources].join(' ')}`,
    "form-action 'self'",
  ].join('; ');
}

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': buildContentSecurityPolicy(),
};

if (!existsSync(dist)) {
  console.error('Chybí složka dist/. Spusť nejdřív: npm install && npm run build');
  process.exit(1);
}

function isInsideDist(candidate) {
  const rel = relative(dist, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !resolve(rel).startsWith('..'));
}

function safeDecode(urlPath) {
  try {
    return decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return '/';
  }
}

function safePath(urlPath) {
  const decoded = safeDecode(urlPath);
  const candidate = resolve(dist, decoded.replace(/^[/\\]+/, '') || 'index.html');
  return isInsideDist(candidate) ? candidate : join(dist, 'index.html');
}

function runtimeConfig() {
  const apiBaseUrl = process.env.API_BASE_URL || '/api';
  const enableMocks = String(process.env.VITE_ENABLE_MOCKS || process.env.ENABLE_MOCKS || 'false').toLowerCase() === 'true';
  const enableDemoMode = String(process.env.VITE_ENABLE_DEMO_MODE || process.env.ENABLE_DEMO_MODE || 'false').toLowerCase() === 'true';
  const defaultWarehouseId = process.env.VITE_DEFAULT_WAREHOUSE_ID || process.env.DEFAULT_WAREHOUSE_ID || 'MAIN';
  const apiRequestTimeoutMs = Number.parseInt(process.env.VITE_API_REQUEST_TIMEOUT_MS || process.env.API_REQUEST_TIMEOUT_MS || '12000', 10);
  return `window.__AARDVARKLAND_STORAGE_SYSTEM_CONFIG__ = ${JSON.stringify({ apiBaseUrl, apiRequestTimeoutMs, enableMocks, enableDemoMode, defaultWarehouseId })};\n`;
}

function write(res, status, headers, body) {
  res.writeHead(status, { ...securityHeaders, ...headers });
  res.end(body);
}

function proxyApi(req, res) {
  const target = new URL(req.url || '/api', backendOrigin);
  const headers = { ...req.headers, host: target.host };
  const proxyRequest = httpRequest(target, {
    method: req.method,
    headers,
  }, (proxyResponse) => {
    res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(res);
  });

  proxyRequest.on('error', (error) => {
    if (!res.headersSent) {
      write(res, 502, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({
        statusCode: 502,
        message: 'Backend WMS není dostupný.',
      }));
    } else {
      res.destroy(error);
    }
  });
  req.pipe(proxyRequest);
}

createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  if (pathname === '/healthz') {
    write(res, 200, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ ok: true, service: 'aardvarkland-storage-system-frontend', version: '1.0.0' }));
    return;
  }

  if (pathname === '/config.js' || pathname.endsWith('/config.js')) {
    write(res, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }, runtimeConfig());
    return;
  }

  const requested = safePath(req.url || '/');
  const file = existsSync(requested) && statSync(requested).isFile() ? requested : join(dist, 'index.html');
  const type = mime[extname(file)] || 'application/octet-stream';
  const cacheControl = file.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable';
  write(res, 200, { 'Content-Type': type, 'Cache-Control': cacheControl }, readFileSync(file));
}).listen(port, () => {
  console.log(`Aardvarkland Storage System UI běží na http://localhost:${port}`);
  console.log(`Health: http://localhost:${port}/healthz`);
});
