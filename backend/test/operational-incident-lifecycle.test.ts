import assert from 'node:assert/strict';
import test from 'node:test';

import { AuthenticatedUser } from '../src/access-control';
import { OperationalIncidentLifecycleService } from '../src/reliability/operational-incident-lifecycle.service';

test('incident lifecycle acknowledgements are audited', async () => {
  const auditWrites: unknown[] = [];
  const service = new OperationalIncidentLifecycleService(prisma('ACKNOWLEDGED'), {
    writeAction: async (input: unknown) => {
      auditWrites.push(input);
    },
  } as never);

  const state = await service.acknowledgeIncident('queue-worker-stale', 'Restarting worker', actor());

  assert.equal(state.status, 'ACKNOWLEDGED');
  assert.equal(state.note, 'Restarting worker');
  assert.equal(auditWrites.length, 1);
  assert.deepEqual(auditWrites[0], {
    actorUserId: actor().id,
    action: 'reliability.incident_acknowledged',
    resourceType: 'operational_incident',
    resourceId: 'queue-worker-stale',
    metadata: { note: 'Restarting worker' },
  });
});

test('incident lifecycle resolutions are audited', async () => {
  const auditWrites: unknown[] = [];
  const service = new OperationalIncidentLifecycleService(prisma('RESOLVED'), {
    writeAction: async (input: unknown) => {
      auditWrites.push(input);
    },
  } as never);

  const state = await service.resolveIncident('print-queue-attention', 'Jobs retried', actor());

  assert.equal(state.status, 'RESOLVED');
  assert.equal(state.resolvedByDisplayName, 'Admin');
  assert.equal(auditWrites.length, 1);
  assert.deepEqual(auditWrites[0], {
    actorUserId: actor().id,
    action: 'reliability.incident_resolved',
    resourceType: 'operational_incident',
    resourceId: 'print-queue-attention',
    metadata: { note: 'Jobs retried' },
  });
});

function prisma(status: 'ACKNOWLEDGED' | 'RESOLVED') {
  return {
    $queryRawUnsafe: async (_sql: string, incidentKey: string, note: string | null, actorUserId: string) => [{
      incident_key: incidentKey,
      status,
      note,
      acknowledged_by_user_id: status === 'ACKNOWLEDGED' ? actorUserId : null,
      acknowledged_by_display_name: status === 'ACKNOWLEDGED' ? 'Admin' : null,
      acknowledged_at: status === 'ACKNOWLEDGED' ? new Date('2026-05-25T10:00:00.000Z') : null,
      resolved_by_user_id: status === 'RESOLVED' ? actorUserId : null,
      resolved_by_display_name: status === 'RESOLVED' ? 'Admin' : null,
      resolved_at: status === 'RESOLVED' ? new Date('2026-05-25T10:05:00.000Z') : null,
      updated_at: new Date('2026-05-25T10:05:00.000Z'),
    }],
  } as never;
}

function actor(): AuthenticatedUser {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'ACTIVE',
    permissions: ['*'],
    warehouses: [],
    clientAccess: [],
  };
}
