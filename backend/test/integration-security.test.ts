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
