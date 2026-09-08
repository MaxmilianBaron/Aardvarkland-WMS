const SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `aardvarkland-wms-shell:${SCOPE.pathname}:`;
const CACHE_NAME = `${CACHE_PREFIX}20260908`;
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.png'];
function safeRequest(request) {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)
    || url.search || request.headers.has('authorization') || request.cache === 'no-store') return false;
  const path = url.pathname.slice(SCOPE.pathname.length);
  return !/(^|\/)(api|auth)(\/|$)/.test(path) && path !== 'config.js'
    && (APP_SHELL.some(file => new URL(file, SCOPE).pathname === url.pathname)
      || /^(assets|fonts)\/.+\.(js|css|woff2?|png|svg|jpe?g|ico)$/.test(path));
}
function cacheable(response) {
  return response.ok && response.type !== 'opaque' && !response.redirected
    && !/\b(no-store|private)\b/i.test(response.headers.get('cache-control') || '');
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const file of APP_SHELL) {
      const request = new Request(new URL(file, SCOPE));
      const response = await fetch(request);
      if (cacheable(response)) await cache.put(request, response);
    }
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys
    .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
// Activation is explicitly requested by the existing update control, never on
// install. The client decides when its current work is safe to finish.
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)) return;
  if (url.pathname.endsWith('/config.js')) { event.respondWith(fetch(request, { cache: 'no-store' })); return; }
  if (!safeRequest(request)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (cacheable(response)) await cache.put(request, response.clone());
      return response;
    } catch {
      return await cache.match(request) || new Response('Offline resource unavailable.', { status: 503, headers: { 'content-type': 'text/plain' } });
    }
  })());
});
