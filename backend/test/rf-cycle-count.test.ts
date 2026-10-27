import assert from 'node:assert/strict';
import test from 'node:test';

import { ConflictException } from '@nestjs/common';

import { AuthenticatedUser } from '../src/access-control/types';
import { PrismaService } from '../src/database';
import { RfWorkflowsService } from '../src/rf-workflows/rf-workflows.service';

interface WriteCall {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

interface RecordedCalls {
  auditCreates: WriteCall[];
  cycleCountPlanUpdates: WriteCall[];
  cycleCountTaskUpdates: WriteCall[];
  outboxCreates: WriteCall[];
  warehouseTaskUpdates: WriteCall[];
}

test('RF count completion submits the linked cycle-count task with counted variance', async () => {
  const { calls, service } = createRfCycleCountService();

  const result = await service.scan(
    'MAIN',
    'session-1',
    { scannedValue: '7', metadata: { deviceTime: '2026-05-22T10:00:00.000Z' } },
    actor(),
  );

  assert.equal(result.status, 'COMPLETED');
  assert.equal(calls.cycleCountTaskUpdates.length, 1);
  assert.equal(calls.cycleCountTaskUpdates[0]?.where?.['id'], 'count-task-1');
  assert.equal(calls.cycleCountTaskUpdates[0]?.data?.['countedQuantity'], 7);
  assert.equal(calls.cycleCountTaskUpdates[0]?.data?.['varianceQuantity'], -3);
  assert.equal(calls.cycleCountTaskUpdates[0]?.data?.['status'], 'SUBMITTED');
  assert.equal(calls.cycleCountTaskUpdates[0]?.data?.['countedByUserId'], 'worker-1');

  const countMetadata = calls.cycleCountTaskUpdates[0]?.data?.['metadata'] as
    | Record<string, unknown>
    | undefined;
  assert.equal(countMetadata?.['rfWarehouseTaskId'], 'task-1');
  assert.equal(countMetadata?.['rfQuantity'], 7);
  assert.deepEqual(countMetadata?.['rfMetadata'], {
    deviceTime: '2026-05-22T10:00:00.000Z',
  });

  assert.equal(calls.warehouseTaskUpdates.length, 1);
  assert.equal(calls.warehouseTaskUpdates[0]?.where?.['id'], 'task-1');
  assert.equal(calls.warehouseTaskUpdates[0]?.data?.['status'], 'DONE');
  assert.equal(calls.cycleCountPlanUpdates[0]?.where?.['id'], 'plan-1');
  assert.equal(calls.cycleCountPlanUpdates[0]?.data?.['status'], 'RECONCILING');
  assert.equal(calls.auditCreates[0]?.data?.['action'], 'cycle_count.rf_submitted');
  assert.equal(
    calls.outboxCreates.some((call) => call.data?.['type'] === 'CYCLE_COUNT_SUBMITTED'),
    true,
  );
  assert.equal(
    calls.outboxCreates.some((call) => call.data?.['type'] === 'RF_WORKFLOW_COMPLETED'),
    true,
  );
});

test('RF count completion rejects a linked cycle-count task without a counted quantity', async () => {
  const { calls, service } = createRfCycleCountService();

  await assert.rejects(
    () => service.scan('MAIN', 'session-1', { scannedValue: 'not-a-count' }, actor()),
    (error) =>
      error instanceof ConflictException &&
      error.message === 'RF cycle count requires a counted quantity',
  );

  assert.equal(calls.cycleCountTaskUpdates.length, 0);
  assert.equal(calls.warehouseTaskUpdates.length, 0);
});

function createRfCycleCountService(): {
  calls: RecordedCalls;
  service: RfWorkflowsService;
} {
  const calls: RecordedCalls = {
    auditCreates: [],
    cycleCountPlanUpdates: [],
    cycleCountTaskUpdates: [],
    outboxCreates: [],
    warehouseTaskUpdates: [],
  };
  const warehouse = { id: 'warehouse-1', code: 'MAIN' };
  const session = {
    id: 'session-1',
    warehouseId: warehouse.id,
    scannerDeviceId: null,
    userId: 'worker-1',
    taskId: 'task-1',
    workflow: 'COUNT',
    status: 'ACTIVE',
    currentStepKey: 'CONFIRM_QUANTITY',
    metadata: null,
  };
  const task = {
    id: 'task-1',
    warehouseId: warehouse.id,
    type: 'COUNT',
    status: 'IN_PROGRESS',
    assignedUserId: 'worker-1',
    assignedAt: new Date('2026-05-22T09:00:00.000Z'),
    startedAt: new Date('2026-05-22T09:00:00.000Z'),
    quantity: 10,
    skuId: 'sku-1',
    fromLocationId: 'loc-1',
    toLocationId: null,
    outboundOrderId: null,
    outboundOrderLineId: null,
    reservationId: null,
    metadata: { cycleCountPlanId: 'plan-1', stockQuantId: 'quant-1' },
    priority: 80,
    dueAt: null,
    externalReference: null,
    fromLocation: { code: 'A-01-01', barcode: null, zone: 'A' },
    toLocation: null,
    sku: { code: 'SKU-1', barcode: '859000000001' },
    handlingUnit: null,
  };
  const step = {
    id: 'step-quantity',
    sessionId: session.id,
    stepKey: 'CONFIRM_QUANTITY',
    sequence: 3,
    status: 'OPEN',
    instruction: 'Potvrd mnozstvi 10',
    expectedType: 'QUANTITY',
    expectedValue: '10',
    errorCode: null,
    metadata: null,
  };
  const countTask = {
    id: 'count-task-1',
    warehouseId: warehouse.id,
    planId: 'plan-1',
    warehouseTaskId: task.id,
    expectedQuantity: 10,
    countedQuantity: null,
    varianceQuantity: null,
    status: 'OPEN',
    metadata: { blindCount: true },
  };

  const prisma = {
    $queryRawUnsafe: async () => [],
    $executeRawUnsafe: async () => 0,
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(prisma),
    warehouse: {
      findFirst: async () => warehouse,
    },
    scannerSession: {
      findFirst: async () => session,
      update: async (args: WriteCall) => ({ ...session, ...(args.data ?? {}) }),
    },
    scannerWorkflowStep: {
      findFirst: async () => step,
      update: async (args: WriteCall) => ({ ...step, ...(args.data ?? {}) }),
    },
    warehouseTask: {
      findFirst: async () => task,
      findMany: async () => [task],
      update: async (args: WriteCall) => {
        calls.warehouseTaskUpdates.push(args);
        return { ...task, ...(args.data ?? {}) };
      },
    },
    scannerDevice: {
      findFirst: async () => null,
      update: async (args: WriteCall) => args.data ?? {},
    },
    cycleCountTask: {
      findFirst: async () => countTask,
      update: async (args: WriteCall) => {
        calls.cycleCountTaskUpdates.push(args);
        return { ...countTask, ...(args.data ?? {}) };
      },
    },
    cycleCountPlan: {
      update: async (args: WriteCall) => {
        calls.cycleCountPlanUpdates.push(args);
        return { id: 'plan-1', ...(args.data ?? {}) };
      },
    },
    auditLog: {
      create: async (args: WriteCall) => {
        calls.auditCreates.push(args);
        return { id: `audit-${calls.auditCreates.length}` };
      },
    },
    outboxEvent: {
      create: async (args: WriteCall) => {
        calls.outboxCreates.push(args);
        return { id: `outbox-${calls.outboxCreates.length}` };
      },
    },
  };

  return {
    calls,
    service: new RfWorkflowsService(prisma as unknown as PrismaService),
  };
}

function actor(): AuthenticatedUser {
  return {
    id: 'worker-1',
    email: 'worker@example.com',
    displayName: 'Worker',
    status: 'ACTIVE',
    permissions: [],
    warehouses: [],
    clientAccess: [],
  };
}
