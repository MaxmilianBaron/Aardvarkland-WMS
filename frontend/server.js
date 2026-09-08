import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(root, 'dist');
const port = Number(process.env.PORT || 4000);
const backendOrigin = new URL(process.env.BACKEND_ORIGIN || 'http://127.0.0.1:4001');
if (!['http:', 'https:'].includes(backendOrigin.protocol) || backendOrigin.username || backendOrigin.password
  || backendOrigin.pathname !== '/' || backendOrigin.search || backendOrigin.hash) {
  throw new Error('BACKEND_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment.');
}
const apiBaseUrl = process.env.API_BASE_URL || '/api';
const apiUrl = new URL(apiBaseUrl, 'https://frontend.invalid');
if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password
  || apiBaseUrl.startsWith('//') || apiUrl.hash || apiUrl.search) throw new Error('API_BASE_URL is invalid.');
const proxyTimeoutMs = 15_000;
const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
};
const connectSources = ["'self'"];
if (apiUrl.origin !== 'https://frontend.invalid') connectSources.push(apiUrl.origin);
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
  'Content-Security-Policy': ["default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'none'",
    "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`, "form-action 'self'"].join('; '),
};
if (!existsSync(dist)) throw new Error('Missing dist/. Run npm ci and npm run build first.');

function cleanHeaders(headers) {
  const connectionTokens = String(headers.connection || '').toLowerCase().split(',').map(x => x.trim());
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !hopHeaders.has(key.toLowerCase()) && !connectionTokens.includes(key.toLowerCase())));
}
function write(req, res, status, headers, body) {
  res.writeHead(status, { ...securityHeaders, 'Cache-Control': 'no-store', ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
}
function runtimeConfig() {
  const enableMocks = String(process.env.VITE_ENABLE_MOCKS || process.env.ENABLE_MOCKS || 'false').toLowerCase() === 'true';
  const enableDemoMode = String(process.env.VITE_ENABLE_DEMO_MODE || process.env.ENABLE_DEMO_MODE || 'false').toLowerCase() === 'true';
  const defaultWarehouseId = process.env.VITE_DEFAULT_WAREHOUSE_ID || process.env.DEFAULT_WAREHOUSE_ID || 'MAIN';
  const candidateTimeout = Number(process.env.VITE_API_REQUEST_TIMEOUT_MS || process.env.API_REQUEST_TIMEOUT_MS || '12000');
  const apiRequestTimeoutMs = Number.isFinite(candidateTimeout) && candidateTimeout >= 1000 && candidateTimeout <= 60000 ? candidateTimeout : 12000;
  return `window.__AARDVARKLAND_STORAGE_SYSTEM_CONFIG__ = ${JSON.stringify({ apiBaseUrl, apiRequestTimeoutMs, enableMocks, enableDemoMode, defaultWarehouseId })};\n`;
}
function proxyApi(req, res, url) {
  const target = new URL(backendOrigin.origin);
  target.pathname = url.pathname;
  target.search = url.search;
  const transport = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const headers = { ...cleanHeaders(req.headers), host: target.host };
  delete headers['x-forwarded-host']; delete headers['x-forwarded-proto']; delete headers['x-forwarded-for'];
  const upstream = transport(target, { method: req.method, headers }, response => {
    res.writeHead(response.statusCode || 502, { ...securityHeaders, ...cleanHeaders(response.headers), 'Cache-Control': 'no-store, private' });
    response.on('error', error => res.destroy(error));
    response.pipe(res);
  });
  const deadline = setTimeout(() => upstream.destroy(new Error('Backend request timed out.')), proxyTimeoutMs);
  const cleanup = () => clearTimeout(deadline);
  res.once('finish', cleanup);
  res.once('close', () => { cleanup(); if (!res.writableFinished) upstream.destroy(); });
  req.once('aborted', () => upstream.destroy());
  upstream.on('error', () => {
    cleanup();
    if (!res.headersSent) write(req, res, 502, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ statusCode: 502, message: 'Warehouse backend is unavailable.' }));
    else res.destroy();
  });
  req.pipe(upstream);
}
const server = createServer((req, res) => {
  let url, pathname;
  try {
    const raw = req.url || '/';
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) throw new Error('Invalid request target');
    url = new URL(raw, 'http://frontend.invalid');
    pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid path');
  } catch { write(req, res, 400, { 'Content-Type': 'text/plain' }, 'Invalid request path.'); return; }
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(req.method)) {
      write(req, res, 405, { Allow: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS' }, 'Method not allowed.'); return;
    }
    proxyApi(req, res, url); return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { write(req, res, 405, { Allow: 'GET, HEAD' }, 'Method not allowed.'); return; }
  if (pathname === '/healthz') { write(req, res, 200, { 'Content-Type': 'application/json' }, JSON.stringify({ ok: true })); return; }
  if (pathname === '/config.js') { write(req, res, 200, { 'Content-Type': mime['.js'] }, runtimeConfig()); return; }
  const candidate = resolve(dist, pathname.replace(/^\/+/, '') || 'index.html');
  const rel = relative(dist, candidate);
  if (rel.startsWith('..') || rel.startsWith(sep) || pathname.split('/').some(part => part.startsWith('.'))) {
    write(req, res, 404, {}, 'Not found.'); return;
  }
  const found = existsSync(candidate) && statSync(candidate).isFile();
  if (!found && extname(pathname)) { write(req, res, 404, {}, 'Not found.'); return; }
  const file = found ? candidate : join(dist, 'index.html');
  // Only content-hashed build assets may be immutable. Worker/config/manifest
  // responses must always be revalidated, otherwise updates can be delayed a year.
  const hashed = /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(relative(dist, file));
  const cache = hashed ? 'public, max-age=31536000, immutable' : 'no-cache, max-age=0, must-revalidate';
  write(req, res, 200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'Cache-Control': cache }, readFileSync(file));
});
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.listen(port, () => console.log(`Aardvarkland WMS UI listening on port ${port}`));
const shutdown = () => { server.close(); server.closeIdleConnections(); setTimeout(() => process.exit(0), 10_000).unref(); };
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
