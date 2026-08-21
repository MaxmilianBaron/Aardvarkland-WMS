import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

import { isIdempotencyKeyRequired } from '../src/common';

test('RF write routes are not globally gated until their services implement idempotent replay', () => {
  const routes = [
    '/api/warehouses/MAIN/rf/sessions',
    '/api/warehouses/MAIN/rf/tasks/TASK-1/start',
    '/api/warehouses/MAIN/rf/sessions/SESSION-1/scan',
    '/api/warehouses/MAIN/rf/sessions/SESSION-1/cancel',
    '/api/warehouses/MAIN/rf/offline/sync',
    '/api/warehouses/MAIN/rf/tasks/TASK-1/report-exception',
    '/api/warehouses/MAIN/rf/sessions/SESSION-1/resume',
    '/api/warehouses/MAIN/rf/sessions/SESSION-1/heartbeat',
    '/api/warehouses/MAIN/operations-runtime/rf/sessions',
    '/api/warehouses/MAIN/operations-runtime/rf/scans',
    '/api/warehouses/MAIN/operations-runtime/rf/offline-queue/replay',
    '/api/warehouses/MAIN/operations-runtime/rf/exceptions',
  ];

  for (const path of routes) {
    assert.equal(isIdempotencyKeyRequired('POST', path), false, path);
  }
});

test('main RF service currently does not consume request DTO idempotencyKey values', () => {
  const source = readFileSync(join(cwd(), 'src', 'rf-workflows', 'rf-workflows.service.ts'), 'utf8');
  // The service may contain idempotency keys for individual offline-scan records;
  // the unsupported guarantee here is the top-level request DTO key.
  assert.doesNotMatch(source, /dto\.idempotencyKey/);
});

test('operations-runtime RF service currently deduplicates offlineId only, not DTO idempotencyKey', () => {
  const source = readFileSync(join(cwd(), 'src', 'operations-runtime', 'operations-runtime.service.ts'), 'utf8');
  assert.doesNotMatch(source, /dto\.idempotencyKey/);
  assert.match(source, /dto\.offlineId/);
  assert.match(source, /result:\s*RuntimeRfResult\.DUPLICATE/);
});
