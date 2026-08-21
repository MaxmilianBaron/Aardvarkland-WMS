import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

import { lockPostgresRowById } from '../src/database';
import { findInventoryInvariantViolations } from '../src/inventory/inventory-invariants.helpers';

const reservationSource = () =>
  readFileSync(join(cwd(), 'src', 'reservations', 'reservations.service.ts'), 'utf8');
const inventorySource = () =>
  readFileSync(join(cwd(), 'src', 'inventory', 'inventory.service.ts'), 'utf8');

function methodSlice(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing method start: ${start}`);
  assert.notEqual(endIndex, -1, `missing method end: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('reservation table is an explicit safe row-lock target', async () => {
  const queries: Array<{ sql: string; values: unknown[] }> = [];
  const id = '00000000-0000-4000-8000-000000000001';
  const client = {
    async $queryRawUnsafe(sql: string, ...values: unknown[]) {
      queries.push({ sql, values });
      return [];
    },
  };

  await lockPostgresRowById(client, 'reservations', id);

  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /SELECT id FROM reservations WHERE id = \$1::uuid FOR UPDATE/);
  assert.deepEqual(queries[0].values, [id]);
});

test('release/cancel locks and reloads reservation before releasing reserved stock', () => {
  const body = methodSlice(
    reservationSource(),
    'private async releaseReservationInTransaction(',
    'private async resolveWarehouse(',
  );
  const candidate = body.indexOf('const reservationCandidate = await this.resolveReservation');
  const lock = body.indexOf("await lockPostgresRowById(client, 'reservations', reservationId)");
  const reload = body.indexOf('const reservation = await this.resolveReservation(client, warehouseId, reservationId)');
  const statusCheck = body.indexOf('currentStatus !== ReservationStatus.ACTIVE');
  const reservedRelease = body.indexOf('await this.releaseReservedStockQuant(client, stockQuant, quantity)');

  assert.ok(candidate >= 0, 'reservation must first resolve to a stable id');
  assert.ok(lock > candidate, 'reservation row must be locked after resolving its id');
  assert.ok(reload > lock, 'reservation must be reloaded after waiting for the row lock');
  assert.ok(statusCheck > reload, 'ACTIVE status must be checked from the locked/reloaded row');
  assert.ok(reservedRelease > statusCheck, 'reserved stock must only be changed after lifecycle status validation');
});

test('reservation creation rechecks availability after the stock-quant row lock', () => {
  const body = methodSlice(
    reservationSource(),
    'private async reserveStockQuant(',
    'private async releaseReservedStockQuant(',
  );
  const lockAndReload = body.indexOf('const lockedStockQuant = await this.lockAndReloadStockQuant');
  const available = body.indexOf('const available = availableQuantity(lockedStockQuant');
  const check = body.indexOf('if (quantity > available)');
  const increment = body.indexOf('[quantityReservedField]: { increment: quantity }');

  assert.ok(lockAndReload >= 0);
  assert.ok(available > lockAndReload);
  assert.ok(check > available);
  assert.ok(increment > check);
});

test('inventory decrements lock and reload stock before enforcing on-hand and reserved invariants', () => {
  const body = methodSlice(
    inventorySource(),
    'private async decrementQuant(',
    'private async transferQuantStatus(',
  );
  const lock = body.indexOf('await this.lockQuantForUpdate(client, quant.id)');
  const reload = body.indexOf('const lockedQuant = await this.resolveQuant');
  const onHandCheck = body.indexOf('if (currentQuantity < quantity)');
  const reservedCheck = body.indexOf('if (currentQuantity - quantity < reservedQuantity)');
  const decrement = body.indexOf('data: { quantity: { decrement: quantity } }');

  assert.ok(lock >= 0);
  assert.ok(reload > lock);
  assert.ok(onHandCheck > reload);
  assert.ok(reservedCheck > onHandCheck);
  assert.ok(decrement > reservedCheck);
});

test('concurrent receive targets serialize quant identity before find-or-create', () => {
  const body = methodSlice(
    inventorySource(),
    'private async incrementOrCreateQuant(',
    'private async decrementQuant(',
  );
  const identityLock = body.indexOf('await lockStockQuantIdentity(client, input)');
  const lookup = body.indexOf('const existingQuant = await client.stockQuant.findFirst');
  const create = body.indexOf('return client.stockQuant.create');

  assert.ok(identityLock >= 0);
  assert.ok(lookup > identityLock);
  assert.ok(create > lookup);
});

test('inventory invariant detector catches the stale-reserved state caused by a double release', () => {
  const violations = findInventoryInvariantViolations({
    stockQuants: [{ id: 'quant-1', quantity: 10, reservedQuantity: 0 }],
    reservations: [
      { id: 'already-released', stockQuantId: 'quant-1', quantity: 5, status: 'RELEASED' },
      { id: 'still-active', stockQuantId: 'quant-1', quantity: 5, status: 'ACTIVE' },
    ],
  });

  assert.ok(violations.some((item) => item.code === 'RESERVED_QUANTITY_MISMATCH'));
});

test('inventory invariant detector rejects negative and over-reserved stock states', () => {
  const violations = findInventoryInvariantViolations({
    stockQuants: [
      { id: 'negative', quantity: -1, reservedQuantity: 0 },
      { id: 'over-reserved', quantity: 3, reservedQuantity: 4 },
    ],
  });
  const codes = new Set(violations.map((item) => item.code));

  assert.ok(codes.has('NEGATIVE_STOCK_QUANTITY'));
  assert.ok(codes.has('RESERVED_EXCEEDS_STOCK'));
});

test('inventory idempotency has a database uniqueness backstop inside the transactional movement write', () => {
  const service = inventorySource();
  const schema = readFileSync(join(cwd(), 'prisma', 'schema.prisma'), 'utf8');
  const receive = methodSlice(service, 'async receive(', 'async move(');

  assert.match(schema, /model StockMovement[\s\S]*@@unique\(\[sourceSystem, idempotencyKey\]\)/);
  assert.match(service, /sourceSystem:\s*input\.idempotencyKey \? 'WMS' : null/);
  assert.match(receive, /const result = await this\.transaction\(client, async \(tx\) =>/);
  assert.match(receive, /await this\.createStockMovement\(tx,/);
});
