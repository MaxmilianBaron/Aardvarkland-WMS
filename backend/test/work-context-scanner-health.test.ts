import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException } from '@nestjs/common';

import { AuthenticatedUser } from '../src/access-control/types';
import { AuthService } from '../src/auth/auth.service';
import { WorkContextRfMode } from '../src/auth/dto/update-work-context.dto';
import { PrismaService } from '../src/database';
import { ScannersService } from '../src/scanners/scanners.service';

test('work context rejects warehouses outside the authenticated user scope', async () => {
  const service = new AuthService({} as never, {} as never, {} as never, {
    $queryRawUnsafe: async () => [],
    $executeRawUnsafe: async () => 0,
  } as unknown as PrismaService);

  await assert.rejects(
    () => service.updateWorkContext(worker(), {
      warehouseId: 'OTHER',
      rfMode: WorkContextRfMode.TERMINAL,
    }),
    (error) => error instanceof ForbiddenException,
  );
});

test('work context persists selected warehouse, RF mode, zone, shift, and scanner reference', async () => {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const service = new AuthService({} as never, {} as never, {} as never, {
    $queryRawUnsafe: async (query: string, ...values: unknown[]) => {
      calls.push({ query, values });
      if (query.includes('FROM user_work_contexts')) {
        return [{
          user_id: 'worker-1',
          warehouse_id: 'warehouse-1',
          warehouse_code: 'MAIN',
          warehouse_name: 'Main',
          zone: 'PICK-A',
          shift_code: 'SHIFT-A',
          rf_mode: 'TERMINAL',
          scanner_device_reference: 'RF-01',
          metadata: { source: 'test' },
          updated_at: new Date('2026-05-25T20:00:00.000Z'),
        }];
      }
      return [];
    },
    $executeRawUnsafe: async (query: string, ...values: unknown[]) => {
      calls.push({ query, values });
      return 1;
    },
    auditLog: { create: async () => ({ id: 'audit-1' }) },
  } as unknown as PrismaService);

  const result = await service.updateWorkContext(worker(), {
    warehouseId: 'MAIN',
    zone: 'PICK-A',
    shiftCode: 'SHIFT-A',
    rfMode: WorkContextRfMode.TERMINAL,
    scannerDeviceReference: 'RF-01',
    metadata: { source: 'test' },
  });

  assert.equal(result.warehouse.code, 'MAIN');
  assert.equal(result.zone, 'PICK-A');
  assert.equal(result.shiftCode, 'SHIFT-A');
  assert.equal(result.rfMode, 'TERMINAL');
  assert.equal(result.scannerDeviceReference, 'RF-01');
  assert.equal(calls.some((call) => call.query.includes('INSERT INTO user_work_contexts')), true);
});

test('scanner telemetry updates last seen and exposes fleet health fields', async () => {
  const calls: Array<{ data?: Record<string, unknown> }> = [];
  const warehouse = { id: 'warehouse-1', code: 'MAIN', name: 'Main' };
  const existingScanner = {
    id: 'scanner-1',
    warehouseId: warehouse.id,
    code: 'RF-01',
    name: 'RF terminal',
    status: 'ACTIVE',
    assignedZone: 'PICK-A',
    lastSeenAt: null,
    metadata: { assignedWorkerId: 'worker-1' },
    createdAt: new Date('2026-05-25T19:00:00.000Z'),
    updatedAt: new Date('2026-05-25T19:00:00.000Z'),
  };
  const prisma = {
    warehouse: { findFirst: async () => warehouse },
    parcel: { findFirst: async () => null },
    scannerDevice: {
      findFirst: async () => existingScanner,
      update: async (args: { data: Record<string, unknown> }) => {
        calls.push(args);
        return {
          ...existingScanner,
          ...args.data,
          metadata: args.data.metadata,
          updatedAt: new Date('2026-05-25T20:00:00.000Z'),
        };
      },
    },
    auditLog: { create: async (args: { data: Record<string, unknown> }) => {
      calls.push(args);
      return { id: 'audit-1' };
    } },
  };
  const service = new ScannersService(prisma as unknown as PrismaService);

  const result = await service.updateTelemetry('MAIN', 'RF-01', {
    batteryLevel: 18,
    signalStrength: 42,
    deviceMode: 'TERMINAL',
    appVersion: '1.0.0',
  }, worker());

  assert.equal(result.batteryLevel, 18);
  assert.equal(result.signalStrength, 42);
  assert.equal(result.assignedWorkerId, 'worker-1');
  assert.equal(result.deviceMode, 'TERMINAL');
  assert.equal(result.appVersion, '1.0.0');
  assert.ok(result.lastSeenAt);
  assert.equal(calls.some((call) => call.data?.['action'] === 'scanner.telemetry_reported'), true);
});

function worker(): AuthenticatedUser {
  return {
    id: 'worker-1',
    email: 'worker@example.com',
    displayName: 'Worker',
    status: 'ACTIVE',
    permissions: ['rf.manage'],
    warehouses: [
      {
        warehouseId: 'warehouse-1',
        warehouseCode: 'MAIN',
        warehouseName: 'Main',
        roleCodes: ['WAREHOUSE_WORKER'],
        permissionCodes: ['rf.manage', 'scanner.read'],
      },
    ],
    clientAccess: [],
  };
}
