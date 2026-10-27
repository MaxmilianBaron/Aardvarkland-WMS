import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import {
  isPrintAgentAuthLocked,
  PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD,
  PRINT_AGENT_TOKEN_LOCK_SECONDS,
} from '../src/labels/print-agent-auth.helpers';
import { LabelsService } from '../src/labels/labels.service';

const WAREHOUSE_ID = '00000000-0000-4000-8000-000000000001';
const VALID_TOKEN = 'print-agent-token-with-at-least-32-characters';
const INVALID_TOKEN = 'wrong-print-agent-token-with-at-least-32-characters';

test('print agent token failures are audited and lock the agent after repeated failures', async () => {
  const fixture = createPrintAgentFixture();

  for (let attempt = 1; attempt < PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD; attempt += 1) {
    await assert.rejects(
      () => fixture.service.claimPrintJobs('MAIN', {
        agentCode: 'pack-pc-01',
        token: INVALID_TOKEN,
      }),
      UnauthorizedException,
    );
    assert.equal(fixture.agent.auth_failed_count, attempt);
  }

  await assert.rejects(
    () => fixture.service.claimPrintJobs('MAIN', {
      agentCode: 'pack-pc-01',
      token: INVALID_TOKEN,
    }),
    ForbiddenException,
  );

  assert.equal(fixture.agent.auth_failed_count, PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD);
  assert.equal(isPrintAgentAuthLocked(fixture.agent.auth_locked_until), true);
  assert.equal(
    fixture.audits.filter((audit) => audit.action === 'print_agent.auth_failed').length,
    PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD,
  );
  assert.equal(fixture.audits.filter((audit) => audit.action === 'print_agent.auth_locked').length, 1);
  assert.doesNotMatch(JSON.stringify(fixture.audits), new RegExp(INVALID_TOKEN));

  await assert.rejects(
    () => fixture.service.claimPrintJobs('MAIN', {
      agentCode: 'PACK-PC-01',
      token: VALID_TOKEN,
    }),
    ForbiddenException,
  );
  assert.equal(fixture.audits.some((audit) => audit.action === 'print_agent.auth_locked_rejected'), true);
});

test('valid print agent tokens clear previous failure counters', async () => {
  const fixture = createPrintAgentFixture({
    auth_failed_count: 2,
    token_last_failed_at: new Date(Date.now() - 60_000),
  });

  const result = await fixture.service.claimPrintJobs('MAIN', {
    agentCode: 'PACK-PC-01',
    token: VALID_TOKEN,
  });

  assert.deepEqual(result.jobs, []);
  assert.equal(fixture.agent.auth_failed_count, 0);
  assert.equal(fixture.agent.auth_locked_until, null);
  assert.equal(fixture.agent.token_last_failed_at, null);
  assert.equal(fixture.agent.status, 'ONLINE');
});

interface FakeAgent {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  token_hash: string;
  status: string;
  version: string | null;
  hostname: string | null;
  metadata: Record<string, unknown>;
  auth_failed_count: number;
  auth_locked_until: Date | null;
  token_last_failed_at: Date | null;
  last_seen_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface AuditRecord {
  action: string;
  metadata: unknown;
}

function createPrintAgentFixture(overrides: Partial<FakeAgent> = {}) {
  const agent: FakeAgent = {
    id: '00000000-0000-4000-8000-000000000011',
    warehouse_id: WAREHOUSE_ID,
    code: 'PACK-PC-01',
    name: 'Packing PC 01',
    token_hash: hashToken(VALID_TOKEN),
    status: 'OFFLINE',
    version: null,
    hostname: null,
    metadata: {},
    auth_failed_count: 0,
    auth_locked_until: null,
    token_last_failed_at: null,
    last_seen_at: null,
    created_at: new Date('2026-05-22T00:00:00.000Z'),
    updated_at: new Date('2026-05-22T00:00:00.000Z'),
    ...overrides,
  };
  const audits: AuditRecord[] = [];
  const prisma = {
    warehouse: {
      findFirst: async () => ({ id: WAREHOUSE_ID, code: 'MAIN', name: 'Main warehouse' }),
    },
    auditLog: {
      create: async ({ data }: { data: AuditRecord }) => {
        audits.push(data);
        return data;
      },
    },
    labelTemplate: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => { throw new Error('not implemented'); },
    },
    labelPrintJob: {
      findMany: async () => [],
      create: async () => { throw new Error('not implemented'); },
    },
    parcel: {
      findFirst: async () => null,
    },
    $executeRawUnsafe: async (sql: string) => {
      if (sql.includes("SET status = 'ONLINE'")) {
        agent.status = 'ONLINE';
        agent.last_seen_at = new Date();
      }
      if (sql.includes('auth_failed_count = 0')) {
        agent.auth_failed_count = 0;
        agent.auth_locked_until = null;
        agent.token_last_failed_at = null;
      }
      return 1;
    },
    $queryRawUnsafe: async <T>(sql: string, ...params: unknown[]): Promise<T> => {
      if (sql.includes('SELECT * FROM wms_print_agents')) {
        return (params[1] === agent.code ? [agent] : []) as T;
      }
      if (sql.includes('auth_failed_count = auth_failed_count + 1')) {
        agent.auth_failed_count += 1;
        agent.token_last_failed_at = new Date();
        if (agent.auth_failed_count >= PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD) {
          agent.auth_locked_until = new Date(Date.now() + PRINT_AGENT_TOKEN_LOCK_SECONDS * 1000);
        }
        return ([{
          auth_failed_count: agent.auth_failed_count,
          auth_locked_until: agent.auth_locked_until,
        }] as unknown) as T;
      }
      if (sql.includes('SELECT * FROM wms_print_jobs')) {
        return [] as T;
      }
      return [] as T;
    },
  };

  return {
    agent,
    audits,
    service: new LabelsService(prisma as never, {} as never),
  };
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
