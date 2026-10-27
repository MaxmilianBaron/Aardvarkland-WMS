import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatAardvarkCode,
  matchesAardvarkWarehouse,
  parseScanCode,
} from '../src/labels/scan-code.helpers';
import { isPrintAgentStatusTransitionAllowed } from '../src/labels/print-job-state.helpers';
import { getScanOwnerClientIds } from '../src/labels/scan-access.helpers';
import {
  buildPrintAgentRouting,
  isRuntimePrintJobClaimableByAgent,
  normalizePrinterCodes,
  withConfiguredPrinterCodes,
} from '../src/labels/print-agent-routing.helpers';
import { renderZpl, validateZplDocument } from '../src/labels/zpl-renderer.helpers';

test('AARD1 scan codes are parsed as typed internal objects', () => {
  const parsed = parseScanCode('AARD1:LOC:MAIN:A-01-01');

  assert.equal(parsed.kind, 'AARD1');
  if (parsed.kind !== 'AARD1') throw new Error('Expected AARD1 parser result');
  assert.equal(parsed.objectType, 'LOC');
  assert.equal(parsed.warehouseCode, 'MAIN');
  assert.equal(parsed.reference, 'A-01-01');
  assert.equal(matchesAardvarkWarehouse(parsed, 'MAIN'), true);
  assert.equal(matchesAardvarkWarehouse(parsed, 'SECONDARY'), false);
  assert.equal(formatAardvarkCode('SKU', 'main', 'abc123'), 'AARD1:SKU:MAIN:ABC123');
});

test('basic GS1 values are parsed from parenthesized barcodes', () => {
  const parsed = parseScanCode('(00)123456789012345678(01)08501234567890(10)LOT1(17)260531(21)SERIAL1(37)12');

  assert.equal(parsed.kind, 'GS1');
  if (parsed.kind !== 'GS1') throw new Error('Expected GS1 parser result');
  assert.equal(parsed.sscc, '123456789012345678');
  assert.equal(parsed.gtin, '08501234567890');
  assert.equal(parsed.batch, 'LOT1');
  assert.equal(parsed.expiry, '260531');
  assert.equal(parsed.serial, 'SERIAL1');
  assert.equal(parsed.quantity, '12');
});

test('GS1 scanner prefixes and group separators are normalized', () => {
  const parsed = parseScanCode(']C1010850123456789010LOT-1<GS>17260531');

  assert.equal(parsed.kind, 'GS1');
  if (parsed.kind !== 'GS1') throw new Error('Expected GS1 parser result');
  assert.equal(parsed.symbologyIdentifier, ']C1');
  assert.equal(parsed.gtin, '08501234567890');
  assert.equal(parsed.batch, 'LOT-1');
  assert.equal(parsed.expiry, '260531');
  assert.deepEqual(parsed.warnings, []);
});

test('ZPL renderer emits supported barcode commands', () => {
  const result = renderZpl({
    widthMm: 100,
    heightMm: 150,
    dpi: 203,
    fields: [
      { type: 'qr', x: 5, y: 5, width: 25, height: 25, binding: 'internalCode' },
      { type: 'code128', x: 5, y: 40, width: 70, height: 14, binding: 'sku' },
      { type: 'gs1-128', x: 5, y: 60, width: 70, height: 14, binding: 'sscc' },
      { type: 'datamatrix', x: 5, y: 80, width: 20, height: 20, binding: 'serial' },
    ],
  }, {
    internalCode: 'AARD1:SKU:MAIN:ABC123',
    sku: 'ABC123',
    sscc: '00123456789012345678',
    serial: 'SERIAL1',
  });

  assert.match(result.zpl, /\^BQN/);
  assert.match(result.zpl, /\^BCN/);
  assert.match(result.zpl, /\^BXN/);
  assert.equal(result.zpl.trim().startsWith('^XA'), true);
  assert.equal(result.zpl.trim().endsWith('^XZ'), true);
  assert.equal(result.warnings.length, 0);
  assert.deepEqual(validateZplDocument(result.zpl), []);
});

test('ZPL validation catches non-printable documents before queueing', () => {
  assert.deepEqual(validateZplDocument(''), [
    'Rendered ZPL is empty.',
    'Rendered ZPL must start with ^XA.',
    'Rendered ZPL must end with ^XZ.',
    'Rendered ZPL does not contain a printable label command.',
  ]);
});

test('ZPL validation blocks additional documents and printer-management commands', () => {
  assert.match(
    validateZplDocument('^XA^FO10,10^FDOK^FS^XZ^XA^FO10,10^FDDUPLICATE^FS^XZ').join(' '),
    /exactly one label document/,
  );
  assert.match(
    validateZplDocument('^XA^DFR:EVIL.ZPL^FO10,10^FDOK^FS^XZ').join(' '),
    /printer-management or storage command/,
  );
});

test('print agent result transitions cannot overwrite terminal or administratively cancelled jobs', () => {
  assert.equal(isPrintAgentStatusTransitionAllowed('CLAIMED', 'PRINTING'), true);
  assert.equal(isPrintAgentStatusTransitionAllowed('PRINTING', 'PRINTED'), true);
  assert.equal(isPrintAgentStatusTransitionAllowed('PRINTED', 'PRINTED'), true);
  assert.equal(isPrintAgentStatusTransitionAllowed('PRINTED', 'FAILED'), false);
  assert.equal(isPrintAgentStatusTransitionAllowed('CANCELLED', 'PRINTING'), false);
  assert.equal(isPrintAgentStatusTransitionAllowed('QUEUED', 'PRINTED'), false);
});

test('scan resolver derives an owner-client scope for restricted users', () => {
  const baseUser = {
    id: 'user-1',
    email: 'worker@example.test',
    displayName: 'Worker',
    status: 'ACTIVE',
    permissions: [],
    warehouses: [],
  };

  assert.equal(getScanOwnerClientIds({ ...baseUser, clientAccess: [] }, 'warehouse-1', 'MAIN'), null);
  assert.deepEqual(getScanOwnerClientIds({
    ...baseUser,
    clientAccess: [
      {
        clientId: 'client-1',
        clientCode: 'CLIENT-1',
        clientName: 'Client 1',
        warehouseId: 'warehouse-1',
        warehouseCode: 'MAIN',
        isActive: true,
      },
      {
        clientId: 'client-2',
        clientCode: 'CLIENT-2',
        clientName: 'Client 2',
        warehouseId: 'warehouse-2',
        warehouseCode: 'SECONDARY',
        isActive: true,
      },
    ],
  }, 'warehouse-1', 'MAIN'), ['client-1']);
});

test('print agent routing limits claims to configured printer codes', () => {
  assert.deepEqual(normalizePrinterCodes(['pack-01', ' PACK-01 ', 'ship-01']), ['PACK-01', 'SHIP-01']);
  assert.deepEqual(withConfiguredPrinterCodes({ room: 'Packing' }, 'pack-01,ship-01'), {
    room: 'Packing',
    printerCodes: ['PACK-01', 'SHIP-01'],
  });

  const routing = buildPrintAgentRouting(['PACK-01'], ['SHIP-01'], false);
  assert.equal(routing.legacyWarehouseClaim, false);
  assert.equal(isRuntimePrintJobClaimableByAgent({ printerCode: 'PACK-01' }, 'PACK-PC-01', routing), true);
  assert.equal(isRuntimePrintJobClaimableByAgent({ printerCode: 'SHIP-01' }, 'PACK-PC-01', routing), false);
  assert.equal(isRuntimePrintJobClaimableByAgent({ agentCode: 'PACK-PC-01', printerCode: 'SHIP-01' }, 'PACK-PC-01', routing), true);
  assert.equal(isRuntimePrintJobClaimableByAgent({ printerCode: null }, 'PACK-PC-01', routing), false);

  const legacyRouting = buildPrintAgentRouting([], [], undefined);
  assert.equal(legacyRouting.legacyWarehouseClaim, true);
  assert.equal(isRuntimePrintJobClaimableByAgent({ printerCode: 'ANY-PRINTER' }, 'LEGACY-AGENT', legacyRouting), true);
});
