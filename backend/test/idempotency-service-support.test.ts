import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

import { isIdempotencyKeyRequired } from '../src/common';

function source(path: string): string {
  return readFileSync(join(cwd(), ...path.split('/')), 'utf8');
}

test('mandatory idempotency remains enabled only for service paths that consume the key', () => {
  for (const path of [
    '/api/warehouses/MAIN/inbound-shipments/ASN-1/receive',
    '/api/warehouses/MAIN/inventory/quants/receive',
    '/api/warehouses/MAIN/print-jobs',
    '/api/warehouses/MAIN/print-jobs/JOB-1/reprint',
  ]) {
    assert.equal(isIdempotencyKeyRequired('POST', path), true, path);
  }

  const inbound = source('src/inbound/inbound.service.ts');
  assert.match(inbound, /dto\.idempotencyKey/);
  assert.match(inbound, /findIdempotentReceive/);

  const inventory = source('src/inventory/inventory.service.ts');
  assert.match(inventory, /findIdempotentOperation/);
  assert.match(inventory, /sourceSystem:\s*input\.idempotencyKey \? 'WMS' : null/);

  const labels = source('src/labels/labels.service.ts');
  assert.match(labels, /idempotencyKey/);
  assert.match(labels, /findLegacyPrintJobByIdempotencyKey/);
  assert.match(labels, /resolveRuntimePrintJobReplay/);
});

test('task, fulfillment and shipping writes are not advertised as idempotent while services ignore the key', () => {
  const unsupported = [
    '/api/warehouses/MAIN/tasks/claim-next',
    '/api/warehouses/MAIN/tasks/TASK-1/start',
    '/api/warehouses/MAIN/tasks/TASK-1/confirm',
    '/api/warehouses/MAIN/tasks/TASK-1/confirm-pick',
    '/api/warehouses/MAIN/outbound-orders/ORDER-1/release-picking',
    '/api/warehouses/MAIN/packing/ORDER-1/pack',
    '/api/warehouses/MAIN/shipping/ORDER-1/ship',
    '/api/warehouses/MAIN/shipments',
    '/api/warehouses/MAIN/shipments/SHP-1/packages',
    '/api/warehouses/MAIN/shipments/SHP-1/labels',
    '/api/warehouses/MAIN/shipments/SHP-1/stage',
    '/api/warehouses/MAIN/shipments/SHP-1/ship',
  ];
  for (const path of unsupported) {
    assert.equal(isIdempotencyKeyRequired('POST', path), false, path);
  }

  assert.doesNotMatch(source('src/warehouse-tasks/warehouse-tasks.service.ts'), /\bdto\.idempotencyKey\b/);
  assert.doesNotMatch(source('src/fulfillment/fulfillment.service.ts'), /\bdto\.idempotencyKey\b/);
  assert.doesNotMatch(source('src/shipping/shipping.service.ts'), /\bdto\.idempotencyKey\b/);
});
