import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

import { createIdempotencyKeyRequiredMiddleware, isIdempotencyKeyRequired } from '../src/common';

const unsupportedDtoRoutes = [
  ['POST', '/api/products'],
  ['POST', '/api/products/skus'],
  ['PATCH', '/api/products/PROD-1'],
  ['POST', '/api/product-master/skus/SKU-1/barcodes'],
  ['POST', '/api/integrations/enterprise/reconciliation/run'],
  ['POST', '/api/integrations/enterprise/dead-letters/DL-1/replay'],
  ['POST', '/api/outbox/events/dispatch'],
  ['POST', '/api/outbox/events/dead-letter/EVENT-1/requeue'],
  ['POST', '/api/warehouses/MAIN/operations-runtime/integrations/events'],
  ['POST', '/api/warehouses/MAIN/operations-runtime/integrations/events/EVENT-1/apply'],
  ['POST', '/api/warehouses/MAIN/operations-runtime/integrations/reconciliation-runs'],
  ['POST', '/api/warehouses/MAIN/operations-runtime/integrations/print/test-label'],
] as const;

test('routes whose DTOs do not accept idempotencyKey are excluded from header-to-body injection', () => {
  for (const [method, path] of unsupportedDtoRoutes) {
    assert.equal(isIdempotencyKeyRequired(method, path), false, `${method} ${path}`);
  }
});

test('excluded routes are not mutated even when a client sends an Idempotency-Key header', () => {
  const middleware = createIdempotencyKeyRequiredMiddleware();

  for (const [, path] of unsupportedDtoRoutes) {
    let nextCalled = false;
    const request = {
      method: 'POST',
      originalUrl: path,
      url: path,
      headers: { 'idempotency-key': 'must-not-be-injected' },
      body: { metadata: { source: 'test' } },
    };

    middleware(request, responseRecorder(), () => { nextCalled = true; });
    assert.equal(nextCalled, true, path);
    assert.equal('idempotencyKey' in request.body, false, path);
  }
});

test('operations-runtime integration DTOs still do not expose idempotencyKey accidentally', () => {
  const source = readFileSync(
    join(cwd(), 'src', 'operations-runtime', 'dto', 'operations-runtime.dto.ts'),
    'utf8',
  );

  for (const className of [
    'RuntimeReconciliationRunDto',
    'RuntimeIntegrationEventIngestDto',
    'RuntimeIntegrationEventApplyDto',
    'RuntimePrintLabelTestDto',
  ]) {
    const start = source.indexOf(`export class ${className}`);
    assert.notEqual(start, -1, className);
    const nextClass = source.indexOf('export class ', start + 1);
    const body = source.slice(start, nextClass === -1 ? source.length : nextClass);
    assert.doesNotMatch(body, /\bidempotencyKey\??\s*:/, className);
  }
});

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return {
        json: (body: unknown) => {
          this.body = body;
        },
      };
    },
  };
}
