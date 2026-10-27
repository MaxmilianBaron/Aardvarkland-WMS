import assert from 'node:assert/strict';
import test from 'node:test';

import { pingHttpIntegrationEndpoint } from '../src/integrations/http-integration-adapter';

test('outbound integration ping enforces EXTERNAL_HTTP_ALLOWED_HOSTS in production', async () => {
  const previousEnv = process.env['NODE_ENV'];
  const previousAllowedHosts = process.env['EXTERNAL_HTTP_ALLOWED_HOSTS'];

  process.env['NODE_ENV'] = 'production';
  delete process.env['EXTERNAL_HTTP_ALLOWED_HOSTS'];

  try {
    await assert.rejects(
      () => pingHttpIntegrationEndpoint({
        id: 'endpoint-1',
        code: 'ERP',
        type: 'WEBHOOK',
        baseUrl: 'https://erp.example.invalid',
        authType: 'NONE',
      }),
      /EXTERNAL_HTTP_ALLOWED_HOSTS/,
    );
  } finally {
    restoreEnv('NODE_ENV', previousEnv);
    restoreEnv('EXTERNAL_HTTP_ALLOWED_HOSTS', previousAllowedHosts);
  }
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

test('outbound HTTP integrations reject automatic redirects and oversized response bodies', async () => {
  const previousFetch = globalThis.fetch;
  const previousEnv = process.env['NODE_ENV'];
  const previousAllowedHosts = process.env['EXTERNAL_HTTP_ALLOWED_HOSTS'];
  process.env['NODE_ENV'] = 'production';
  process.env['EXTERNAL_HTTP_ALLOWED_HOSTS'] = 'erp.example.invalid';
  const args: RequestInit[] = [];
  globalThis.fetch = async (_url, options) => {
    args.push(options ?? {});
    return new Response('x'.repeat(70 * 1024), { status: 200 });
  };
  try {
    await assert.rejects(() => pingHttpIntegrationEndpoint({
      id: 'endpoint-redirect', code: 'ERP', type: 'WEBHOOK',
      baseUrl: 'https://erp.example.invalid', authType: 'API_KEY',
      config: { apiKey: 'test-value-only' },
    }), /size limit/);
    assert.equal(args.length, 1);
    assert.equal(args[0].redirect, 'error');
  } finally {
    globalThis.fetch = previousFetch;
    restoreEnv('NODE_ENV', previousEnv);
    restoreEnv('EXTERNAL_HTTP_ALLOWED_HOSTS', previousAllowedHosts);
  }
});
