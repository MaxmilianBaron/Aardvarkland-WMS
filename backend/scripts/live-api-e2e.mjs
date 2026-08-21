import assert from 'node:assert/strict';

const apiBaseUrl = String(process.env.WMS_E2E_API_URL || 'http://127.0.0.1:4001/api').replace(/\/+$/, '');
const email = process.env.WMS_E2E_EMAIL || 'mcp-skladnik@aardvarkland.local';
const password = process.env.WMS_E2E_PASSWORD || 'Mcp-Local-42!';
const warehouse = process.env.WMS_E2E_WAREHOUSE || 'MAIN';

const firstLogin = await login();
assert.ok(firstLogin.accessToken, 'Login must return an access token');
assert.ok(firstLogin.refreshToken, 'Login must return a refresh token');

const currentUser = await api('/auth/me', { token: firstLogin.accessToken });
assert.equal(currentUser.email, email);

const queue = await api(`/warehouses/${encodeURIComponent(warehouse)}/rf/queue?limit=1`, {
  token: firstLogin.accessToken,
});
assert.ok(Array.isArray(queue.tasks), 'RF queue must return a task array');

const wrongWarehouseScan = await rawApi(`/warehouses/${encodeURIComponent(warehouse)}/scans/resolve`, {
  method: 'POST',
  token: firstLogin.accessToken,
  idempotencyKey: uniqueKey('wrong-warehouse-scan'),
  body: {
    scannedValue: 'AARD1:LOC:NOT-ASSIGNED:A-01-01',
    metadata: { source: 'live-api-e2e' },
  },
});
assert.ok([400, 403, 404].includes(wrongWarehouseScan.status), `Wrong warehouse scan must be rejected, got ${wrongWarehouseScan.status}`);

const refreshResponses = await Promise.all([
  rawApi('/auth/refresh', { method: 'POST', body: { refreshToken: firstLogin.refreshToken } }),
  rawApi('/auth/refresh', { method: 'POST', body: { refreshToken: firstLogin.refreshToken } }),
]);
assert.deepEqual(
  refreshResponses.map((response) => response.status).sort((left, right) => left - right),
  [201, 401],
  'One-time refresh rotation must allow exactly one concurrent request',
);

const realtimeLogin = await login();
const controller = new AbortController();
const realtimeResponse = await fetch(
  `${apiBaseUrl}/warehouses/${encodeURIComponent(warehouse)}/realtime/events`,
  {
    headers: {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${realtimeLogin.accessToken}`,
    },
    signal: controller.signal,
  },
);
assert.equal(realtimeResponse.status, 200);
assert.ok(realtimeResponse.body, 'Realtime response must expose a stream');

const realtimeEvents = createSseReader(realtimeResponse.body.getReader());
const connected = await realtimeEvents.read();
assert.equal(connected.type, 'realtime.connected');

await api('/auth/me/work-context', {
  method: 'PUT',
  token: realtimeLogin.accessToken,
  idempotencyKey: uniqueKey('work-context'),
  body: {
    warehouseId: warehouse,
    rfMode: 'DESKTOP',
    metadata: { source: 'live-api-e2e' },
  },
});

const mutation = await realtimeEvents.read('warehouse.mutation');
assert.equal(mutation.type, 'warehouse.mutation');
controller.abort();

console.log(JSON.stringify({
  ok: true,
  apiBaseUrl,
  checks: [
    'login-and-current-user',
    'rf-queue-real-database',
    'cross-warehouse-scan-rejected',
    'single-use-refresh-rotation',
    'authenticated-realtime-mutation',
  ],
}, null, 2));

async function login() {
  return api('/auth/login', {
    method: 'POST',
    idempotencyKey: uniqueKey('login'),
    body: { email, password },
  });
}

async function api(path, options = {}) {
  const response = await rawApi(path, options);
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed with ${response.status}: ${JSON.stringify(payload)}`);
  }
  return unwrap(payload);
}

async function rawApi(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Request-ID': uniqueKey('request'),
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  return fetch(`${apiBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function readPayload(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload ? payload.data : payload;
}

function createSseReader(reader) {
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    async read(expectedType) {
      const deadline = Date.now() + 10_000;

      while (Date.now() < deadline) {
        let boundary = buffer.indexOf('\n\n');
        while (boundary >= 0) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = parseSseBlock(block);
          if (event && (!expectedType || event.type === expectedType)) return event;
          boundary = buffer.indexOf('\n\n');
        }

        const remaining = Math.max(1, deadline - Date.now());
        const chunk = await Promise.race([
          reader.read(),
          new Promise((_, reject) => setTimeout(
            () => reject(new Error('Timed out waiting for realtime event')),
            remaining,
          )),
        ]);
        if (chunk.done) throw new Error('Realtime stream closed unexpectedly');
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      }

      throw new Error(`Timed out waiting for ${expectedType || 'realtime event'}`);
    },
  };
}

function parseSseBlock(block) {
  let type = 'message';
  const data = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) type = line.slice(6).trim() || type;
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (data.length === 0) return null;
  return { type, data: JSON.parse(data.join('\n')) };
}

function uniqueKey(prefix) {
  return `e2e-${prefix}-${Date.now().toString(36)}-${crypto.randomUUID()}`;
}
