import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

import { createIdempotencyKeyRequiredMiddleware, isIdempotencyKeyRequired } from '../src/common';
import { buildApiErrorResponse } from '../src/common/api-error.helpers';
import { redactLogValue, redactUrlQuery } from '../src/common/log-redaction.helpers';
import { withDatabaseSessionOptions } from '../src/database/prisma.service';

test('critical write routes with implemented idempotency require Idempotency-Key', () => {
  const protectedRoutes = [
    ['POST', '/api/warehouses/MAIN/inbound-shipments/ASN-1/receive'],
    ['POST', '/api/warehouses/MAIN/inventory/quants/receive'],
    ['POST', '/api/warehouses/MAIN/print-jobs'],
    ['POST', '/api/warehouses/MAIN/print-jobs/JOB-1/reprint'],
    ['POST', '/api/warehouses/MAIN/parcels/P0001/labels/print-jobs'],
  ] as const;

  for (const [method, path] of protectedRoutes) {
    assert.equal(isIdempotencyKeyRequired(method, path), true, `${method} ${path}`);
  }

  assert.equal(isIdempotencyKeyRequired('GET', '/api/warehouses/MAIN/inventory/quants'), false);
  assert.equal(isIdempotencyKeyRequired('POST', '/api/auth/login'), false);
  assert.equal(isIdempotencyKeyRequired('POST', '/api/warehouses/MAIN/label-templates/TPL/render-preview'), false);
});

test('routes without end-to-end idempotency are not falsely gated or mutated', () => {
  const routes = [
    ['POST', '/api/products'],
    ['POST', '/api/products/skus'],
    ['PATCH', '/api/products/PROD-1'],
    ['POST', '/api/product-master/skus/SKU-1/barcodes'],
    ['POST', '/api/integrations/enterprise/reconciliation/run'],
    ['POST', '/api/integrations/enterprise/dead-letters/DL-1/replay'],
    ['POST', '/api/outbox/events/dispatch'],
    ['POST', '/api/outbox/events/dead-letter/EVENT-1/requeue'],
    ['POST', '/api/warehouses/MAIN/rf/sessions'],
    ['POST', '/api/warehouses/MAIN/rf/sessions/SESSION-1/scan'],
    ['POST', '/api/warehouses/MAIN/rf/sessions/SESSION-1/resume'],
    ['POST', '/api/warehouses/MAIN/rf/sessions/SESSION-1/heartbeat'],
    ['POST', '/api/warehouses/MAIN/operations-runtime/rf/sessions'],
    ['POST', '/api/warehouses/MAIN/operations-runtime/rf/scans'],
    ['POST', '/api/warehouses/MAIN/tasks/claim-next'],
    ['POST', '/api/warehouses/MAIN/tasks/TASK-1/start'],
    ['POST', '/api/warehouses/MAIN/tasks/TASK-1/confirm'],
    ['POST', '/api/warehouses/MAIN/tasks/TASK-1/confirm-pick'],
    ['POST', '/api/warehouses/MAIN/outbound-orders/ORDER-1/release-picking'],
    ['POST', '/api/warehouses/MAIN/packing/ORDER-1/pack'],
    ['POST', '/api/warehouses/MAIN/shipping/ORDER-1/ship'],
    ['POST', '/api/warehouses/MAIN/shipments'],
    ['POST', '/api/warehouses/MAIN/shipments/SHP-1/packages'],
    ['POST', '/api/warehouses/MAIN/shipments/SHP-1/labels'],
    ['POST', '/api/warehouses/MAIN/shipments/SHP-1/stage'],
    ['POST', '/api/warehouses/MAIN/shipments/SHP-1/ship'],
    ['POST', '/api/warehouses/MAIN/connectors/shop/orders/import'],
  ] as const;

  for (const [method, path] of routes) {
    assert.equal(isIdempotencyKeyRequired(method, path), false, `${method} ${path}`);
  }

  const middleware = createIdempotencyKeyRequiredMiddleware();
  for (const path of [
    '/api/products',
    '/api/integrations/enterprise/reconciliation/run',
    '/api/outbox/events/dispatch',
    '/api/warehouses/MAIN/rf/sessions/SESSION-1/scan',
    '/api/warehouses/MAIN/operations-runtime/rf/scans',
    '/api/warehouses/MAIN/tasks/claim-next',
    '/api/warehouses/MAIN/shipments/SHP-1/ship',
    '/api/warehouses/MAIN/connectors/shop/orders/import',
  ]) {
    let nextCalled = false;
    const request = {
      method: 'POST',
      originalUrl: path,
      url: path,
      headers: { 'idempotency-key': 'header-that-must-not-be-injected' },
      body: { metadata: { source: 'test' } },
    };
    middleware(request, responseRecorder(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal('idempotencyKey' in request.body, false);
  }
});

test('idempotency middleware copies the header into compatible DTO bodies', () => {
  const middleware = createIdempotencyKeyRequiredMiddleware();
  let nextCalled = false;
  const request = {
    method: 'POST',
    originalUrl: '/api/warehouses/MAIN/inventory/quants/receive',
    url: '/api/warehouses/MAIN/inventory/quants/receive',
    headers: { 'idempotency-key': 'ui-test-key' },
    body: { skuReference: 'SKU-1' },
  };

  middleware(request, responseRecorder(), () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(request.body.idempotencyKey, 'ui-test-key');
});

test('idempotency middleware rejects missing keys on critical writes', () => {
  const middleware = createIdempotencyKeyRequiredMiddleware();
  const response = responseRecorder();

  middleware({
    method: 'POST',
    originalUrl: '/api/warehouses/MAIN/inventory/quants/receive',
    url: '/api/warehouses/MAIN/inventory/quants/receive',
    headers: {},
    body: {},
  }, response, () => {
    throw new Error('next should not be called');
  });

  assert.equal(response.statusCode, 428);
  assert.match(JSON.stringify(response.body), /idempotency_key_required/);
});

test('global validation pipe blocks unknown DTO fields', () => {
  const bootstrapText = readFileSync(join(cwd(), 'src', 'bootstrap', 'configure-wms-app.ts'), 'utf8');

  assert.match(bootstrapText, /new ValidationPipe\(\{[^}]*forbidNonWhitelisted:\s*true/s);
  assert.match(bootstrapText, /new ValidationPipe\(\{[^}]*whitelist:\s*true/s);
});

test('global error payload hides unexpected 500 details', () => {
  const response = buildApiErrorResponse({
    error: new Error('database password leaked in stack detail'),
    path: '/api/warehouses/MAIN/inventory/quants',
    method: 'GET',
    requestId: 'test-request',
    timestamp: new Date('2026-05-22T00:00:00.000Z'),
  });

  assert.equal(response.error.statusCode, 500);
  assert.equal(response.error.message, 'Unexpected server error');
  assert.deepEqual(response.error.details, []);
});

test('structured log redaction removes sensitive fields and query values', () => {
  assert.deepEqual(
    redactLogValue({
      authorization: 'Bearer secret',
      nested: {
        password: 'pw',
        safe: 'visible',
      },
      items: [{ refreshToken: 'rt_secret' }],
    }),
    {
      authorization: '[redacted]',
      nested: {
        password: '[redacted]',
        safe: 'visible',
      },
      items: [{ refreshToken: '[redacted]' }],
    },
  );

  assert.equal(
    redactUrlQuery('/api/auth/callback?token=abc&warehouse=MAIN&apiKey=secret'),
    '/api/auth/callback?token=%5Bredacted%5D&warehouse=MAIN&apiKey=%5Bredacted%5D',
  );
});

test('database session options append statement and lock timeouts', () => {
  const url = withDatabaseSessionOptions(
    'postgresql://user:pass@localhost:5432/wms?schema=public',
    { statementTimeoutMs: 60000, lockTimeoutMs: 10000 },
  );

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('schema'), 'public');
  assert.match(parsed.searchParams.get('options') ?? '', /statement_timeout=60000/);
  assert.match(parsed.searchParams.get('options') ?? '', /lock_timeout=10000/);
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

test('critical DTOs do not expose tenant ownership fields', () => {
  const dtoFiles = [
    'src/inventory/dto/receive-stock.dto.ts',
    'src/inventory/dto/move-stock.dto.ts',
    'src/inbound/dto/receive-inbound-line.dto.ts',
    'src/shipping/dto/create-shipment.dto.ts',
    'src/shipping/dto/add-shipment-package.dto.ts',
    'src/shipping/dto/generate-carrier-label.dto.ts',
    'src/labels/dto/create-runtime-print-job.dto.ts',
  ];

  for (const relativePath of dtoFiles) {
    const text = readFileSync(join(cwd(), relativePath), 'utf8');
    assert.doesNotMatch(text, /\bwarehouseId[?!]?\s*:/, `${relativePath} must take warehouseId from route/auth scope`);
    assert.doesNotMatch(text, /\bownerClientId[?!]?\s*:/, `${relativePath} must resolve ownerClientId server-side`);
    assert.doesNotMatch(text, /\bpermissions[?!]?\s*:/, `${relativePath} must not accept permissions`);
    assert.doesNotMatch(text, /\brole(Code|Id|s)?[?!]?\s*:/, `${relativePath} must not accept roles`);
  }
});

test('distributed rate limiting does not run retention deletes in the request path', () => {
  const source = readFileSync(join(cwd(), 'src/common/rate-limit.middleware.ts'), 'utf8');
  assert.doesNotMatch(source, /Math\.random\(\)\s*<\s*0\.005/);
  assert.doesNotMatch(source, /DELETE FROM rate_limit_buckets WHERE reset_at/);
});

test('authentication audit failures are observable', () => {
  const source = readFileSync(join(cwd(), 'src/auth/auth.service.ts'), 'utf8');
  assert.match(source, /security_audit_write_failed/);
  assert.match(source, /this\.logger\.error/);
});

test('successful warehouse mutations publish a realtime invalidation event', () => {
  const source = readFileSync(join(cwd(), 'src/realtime/mutation-realtime.interceptor.ts'), 'utf8');
  const module = readFileSync(join(cwd(), 'src/realtime/realtime.module.ts'), 'utf8');
  assert.match(source, /warehouse\.mutation/);
  assert.match(source, /tap\(\(\) =>/);
  assert.match(module, /APP_INTERCEPTOR/);
  assert.match(module, /MutationRealtimeInterceptor/);
});

test('typed scanner codes from another warehouse are rejected and audited', () => {
  const source = readFileSync(join(cwd(), 'src/labels/labels.service.ts'), 'utf8');
  assert.match(
    source,
    /parsed\.kind === 'AARD1' && !matchesAardvarkWarehouse\(parsed, warehouse\.code\)/,
  );
  assert.match(source, /await this\.writeScanAudit\(actor, warehouse\.id, parsed, resolved, dto\)/);
  assert.match(source, /throw new BadRequestException\('Scanned code belongs to a different warehouse\.'\)/);
});

test('development queue worker preserves Nest decorator metadata', () => {
  const packageJson = JSON.parse(readFileSync(join(cwd(), 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const workerCommand = packageJson.scripts?.['worker:queue'] ?? '';
  assert.match(workerCommand, /ts-node\/register/);
  assert.doesNotMatch(workerCommand, /tsx/);
});

test('packing locks the outbound order and counts packages across all shipments', () => {
  const source = readFileSync(join(cwd(), 'src/shipping/shipping.service.ts'), 'utf8');
  assert.match(source, /lockPostgresRowById\(tx, 'outbound_orders', shipment\.outboundOrderId\)/);
  assert.match(source, /where: \{ outboundOrderId: shipment\.outboundOrderId \}/);
  assert.match(source, /this\.buildPackageContentPlan\(\s*tx,\s*shipment,\s*existingOrderPackages/s);
});
