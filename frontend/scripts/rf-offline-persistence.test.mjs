import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/core/scanning/rfOfflineQueue.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ denyWrites = false } = {}) {
  const values = new Map();
  const storage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (denyWrites) throw new Error('QuotaExceededError');
      values.set(key, value);
    },
    removeItem(key) { values.delete(key); },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, window: { localStorage: storage }, Map, Date, Promise });
  return { api: exports, values };
}
function scan(n) {
  return {
    idempotencyKey: 'key-' + n, warehouseId: 'MAIN',
    scannedValue: 'SKU-' + n, recordedAt: new Date(2026, 9, 27, 0, 0, n).toISOString(),
    metadata: {},
  };
}

test('501 offline scans persist and recover without silently dropping the oldest', async () => {
  const { api } = harness();
  await api.saveRfOfflineQueue('MAIN', Array.from({ length: 501 }, (_, i) => scan(i)));
  const loaded = await api.loadRfOfflineQueue('MAIN');
  assert.equal(loaded.length, 501);
  assert.ok(loaded.some((item) => item.idempotencyKey === 'key-0'));
  await api.appendRfOfflineScan('MAIN', scan(501));
  assert.equal((await api.loadRfOfflineQueue('MAIN')).length, 502);
  await api.removeRfOfflineScans('MAIN', ['key-500']);
  const remaining = await api.loadRfOfflineQueue('MAIN');
  assert.equal(remaining.length, 501);
  assert.ok(remaining.some((item) => item.idempotencyKey === 'key-501'));
});

test('no local storage can accept writes: user must receive a persistence error', async () => {
  const { api } = harness({ denyWrites: true });
  await assert.rejects(api.saveRfOfflineQueue('MAIN', [scan(1)]));
});
