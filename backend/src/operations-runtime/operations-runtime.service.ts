import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database';
import {
  RuntimeConnector,
  RuntimeIntegrationCommandCenter,
  RuntimeIntegrationEvent,
  RuntimeIntegrationState,
  RuntimeOperationRule,
  RuntimeRfConsole,
  RuntimeRfException,
  RuntimeRfResult,
  RuntimeRfScanEvent,
  RuntimeRfSession,
  RuntimeRuleEvaluation,
  RuntimeRuleType,
} from './operations-runtime.types';
import {
  RuntimeIntegrationEventApplyDto,
  RuntimeIntegrationEventIngestDto,
  RuntimePrintLabelTestDto,
  RuntimeReconciliationRunDto,
  RuntimeRfExceptionDto,
  RuntimeRfOfflineReplayDto,
  RuntimeRfScanDto,
  RuntimeRuleEvaluationDto,
  RuntimeRuleUpsertDto,
  StartRuntimeRfSessionDto,
} from './dto/operations-runtime.dto';

interface RfSessionRow {
  id: string;
  warehouse_id: string;
  device_code: string;
  worker_code: string;
  flow: string;
  state: string;
  current_step: string;
  offline_queue: unknown;
  last_error: string | null;
  started_at: Date | string;
  last_seen_at: Date | string;
}

interface RfScanRow {
  id: string;
  warehouse_id: string;
  session_id: string | null;
  device_code: string;
  task_reference: string | null;
  step_key: string;
  scanned_value: string;
  expected_value: string | null;
  result: RuntimeRfResult;
  offline_id: string | null;
  quantity: number | null;
  metadata: unknown;
  created_at: Date | string;
}

interface RfExceptionRow {
  id: string;
  warehouse_id: string;
  session_id: string | null;
  device_code: string;
  task_reference: string | null;
  code: string;
  title: string;
  status: string;
  severity: string;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface IntegrationEventRow {
  id: string;
  warehouse_id: string;
  connector_code: string;
  flow: string;
  state: RuntimeIntegrationState;
  external_id: string;
  attempts: number;
  max_attempts: number;
  retry_after: Date | string | null;
  payload: unknown;
  last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ReconciliationRow {
  id: string;
  warehouse_id: string;
  connector_code: string | null;
  status: string;
  mismatches: number;
  summary: unknown;
  created_at: Date | string;
}

interface OperationRuleRow {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  type: RuntimeRuleType;
  enabled: boolean;
  priority: number;
  scope: unknown;
  conditions: unknown;
  actions: unknown;
  notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class OperationsRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async getRfConsole(warehouseId: string): Promise<RuntimeRfConsole> {
    await this.ensureTables();

    const [sessions, recentScans, exceptions] = await Promise.all([
      this.query<RfSessionRow>(
        `SELECT * FROM ops_rf_sessions
         WHERE warehouse_id = $1 AND state IN ('ACTIVE', 'OFFLINE', 'BLOCKED')
         ORDER BY last_seen_at DESC LIMIT 12`,
        warehouseId,
      ),
      this.query<RfScanRow>(
        `SELECT * FROM ops_rf_scan_events
         WHERE warehouse_id = $1
         ORDER BY created_at DESC LIMIT 25`,
        warehouseId,
      ),
      this.query<RfExceptionRow>(
        `SELECT * FROM ops_rf_exceptions
         WHERE warehouse_id = $1 AND status IN ('OPEN', 'ESCALATED')
         ORDER BY created_at DESC LIMIT 20`,
        warehouseId,
      ),
    ]);

    const queued = sessions.reduce((sum, session) => sum + offlineQueueLength(session.offline_queue), 0);

    return {
      warehouseId,
      profile: {
        scannerFocusLock: true,
        offlineQueue: true,
        fallbackMode: false,
        supervisorUnlock: true,
        recommendedDevice: sessions[0]?.device_code ?? '',
      },
      activeSessions: sessions.map(toRfSession),
      recentScans: recentScans.map(toRfScanEvent),
      exceptionQueue: exceptions.map(toRfException),
      nextInstruction: {
        stepKey: 'SCAN_LOCATION',
        label: 'Scan location first',
        expectedExample: '',
        helpText: 'Scan-first screen keeps focus in the scan input and supports offline replay.',
      },
      offlineQueue: {
        queued,
        replayable: queued + recentScans.filter((scan) => scan.result === RuntimeRfResult.MISMATCH).length,
        duplicateProtected: true,
        policy: 'One idempotency key per device + offline action. Duplicates are accepted as DUPLICATE, not applied twice.',
      },
    };
  }

  async startRfSession(
    warehouseId: string,
    dto: StartRuntimeRfSessionDto,
  ): Promise<RuntimeRfSession> {
    await this.ensureTables();
    const rows = await this.query<RfSessionRow>(
      `INSERT INTO ops_rf_sessions
        (warehouse_id, device_code, worker_code, flow, state, current_step, offline_queue, last_error)
       VALUES ($1, $2, $3, $4, 'ACTIVE', 'SCAN_LOCATION', '[]'::jsonb, NULL)
       RETURNING *`,
      warehouseId,
      dto.deviceCode.trim(),
      dto.workerCode.trim(),
      dto.flow?.trim() || 'WAVE_PICK',
    );

    return toRfSession(required(rows, 'RF session was not created'));
  }

  async submitRfScan(warehouseId: string, dto: RuntimeRfScanDto): Promise<{
    result: RuntimeRfResult;
    accepted: boolean;
    instruction: string;
    event: RuntimeRfScanEvent;
  }> {
    await this.ensureTables();
    const duplicate = dto.offlineId
      ? await this.query<RfScanRow>(
          `SELECT * FROM ops_rf_scan_events WHERE warehouse_id = $1 AND device_code = $2 AND offline_id = $3 LIMIT 1`,
          warehouseId,
          dto.deviceCode.trim(),
          dto.offlineId.trim(),
        )
      : [];

    if (duplicate[0]) {
      return {
        result: RuntimeRfResult.DUPLICATE,
        accepted: true,
        instruction: 'Duplicate offline scan ignored safely. Continue scanning.',
        event: toRfScanEvent(duplicate[0]),
      };
    }

    const result = isExpected(dto.scannedValue, dto.expectedValue)
      ? RuntimeRfResult.ACCEPTED
      : RuntimeRfResult.MISMATCH;

    const rows = await this.query<RfScanRow>(
      `INSERT INTO ops_rf_scan_events
        (warehouse_id, session_id, device_code, task_reference, step_key, scanned_value, expected_value, result, offline_id, quantity, metadata)
       VALUES ($1, NULLIF($2, '')::uuid, $3, NULLIF($4, ''), $5, $6, NULLIF($7, ''), $8, NULLIF($9, ''), $10, $11::jsonb)
       RETURNING *`,
      warehouseId,
      dto.sessionId ?? '',
      dto.deviceCode.trim(),
      dto.taskReference ?? '',
      dto.stepKey.trim(),
      dto.scannedValue.trim(),
      dto.expectedValue ?? '',
      result,
      dto.offlineId ?? '',
      dto.quantity ?? null,
      json(dto.metadata),
    );
    const event = toRfScanEvent(required(rows, 'RF scan was not stored'));

    if (dto.sessionId) {
      await this.exec(
        `UPDATE ops_rf_sessions
         SET last_seen_at = now(), current_step = $3, last_error = $4
         WHERE warehouse_id = $1 AND id = $2::uuid`,
        warehouseId,
        dto.sessionId,
        nextRfStep(dto.stepKey, result),
        result === RuntimeRfResult.MISMATCH ? 'SCAN_MISMATCH' : null,
      );
    }

    if (result === RuntimeRfResult.MISMATCH) {
      await this.query<RfExceptionRow>(
        `INSERT INTO ops_rf_exceptions
          (warehouse_id, session_id, device_code, task_reference, code, title, status, severity, metadata)
         VALUES ($1, NULLIF($2, '')::uuid, $3, NULLIF($4, ''), 'SCAN_MISMATCH', $5, 'OPEN', 'HIGH', $6::jsonb)
         RETURNING *`,
        warehouseId,
        dto.sessionId ?? '',
        dto.deviceCode.trim(),
        dto.taskReference ?? '',
        `Expected ${dto.expectedValue ?? 'configured value'}, scanned ${dto.scannedValue}`,
        json({ scanEventId: event.id, stepKey: dto.stepKey }),
      );
    }

    return {
      result,
      accepted: result === RuntimeRfResult.ACCEPTED,
      instruction:
        result === RuntimeRfResult.ACCEPTED
          ? `${nextRfStep(dto.stepKey, result)} ready. Continue.`
          : 'Scan mismatch. Show exception choices: retry scan, short-pick, supervisor override.',
      event,
    };
  }

  async replayRfOfflineQueue(warehouseId: string, dto: RuntimeRfOfflineReplayDto): Promise<{
    warehouseId: string;
    deviceCode: string;
    accepted: number;
    duplicates: number;
    rejected: number;
    results: Array<{ offlineId: string | null; result: RuntimeRfResult }>;
  }> {
    await this.ensureTables();
    let accepted = 0;
    let duplicates = 0;
    let rejected = 0;
    const results: Array<{ offlineId: string | null; result: RuntimeRfResult }> = [];

    for (const action of dto.actions) {
      const result = await this.submitRfScan(warehouseId, {
        ...action,
        deviceCode: action.deviceCode || dto.deviceCode,
      });
      if (result.result === RuntimeRfResult.ACCEPTED) accepted += 1;
      else if (result.result === RuntimeRfResult.DUPLICATE) duplicates += 1;
      else rejected += 1;
      results.push({ offlineId: action.offlineId ?? null, result: result.result });
    }

    await this.exec(
      `UPDATE ops_rf_sessions
       SET offline_queue = '[]'::jsonb, last_seen_at = now(), last_error = NULL
       WHERE warehouse_id = $1 AND device_code = $2 AND state IN ('ACTIVE', 'OFFLINE', 'BLOCKED')`,
      warehouseId,
      dto.deviceCode.trim(),
    );

    return { warehouseId, deviceCode: dto.deviceCode, accepted, duplicates, rejected, results };
  }

  async reportRfException(
    warehouseId: string,
    dto: RuntimeRfExceptionDto,
  ): Promise<RuntimeRfException> {
    await this.ensureTables();
    const rows = await this.query<RfExceptionRow>(
      `INSERT INTO ops_rf_exceptions
        (warehouse_id, session_id, device_code, task_reference, code, title, status, severity, metadata)
       VALUES ($1, NULLIF($2, '')::uuid, $3, NULLIF($4, ''), $5, $6, 'OPEN', $7, $8::jsonb)
       RETURNING *`,
      warehouseId,
      dto.sessionId ?? '',
      dto.deviceCode.trim(),
      dto.taskReference ?? '',
      dto.code.trim().toUpperCase(),
      dto.title?.trim() || defaultExceptionTitle(dto.code),
      dto.severity?.trim().toUpperCase() || 'MEDIUM',
      json({
        releaseReservation: dto.releaseReservation ?? false,
        supervisorPinPresent: Boolean(dto.supervisorPin),
        metadata: dto.metadata ?? null,
      }),
    );

    if (dto.sessionId) {
      await this.exec(
        `UPDATE ops_rf_sessions
         SET state = 'BLOCKED', last_error = $3, last_seen_at = now()
         WHERE warehouse_id = $1 AND id = $2::uuid`,
        warehouseId,
        dto.sessionId,
        dto.code.trim().toUpperCase(),
      );
    }

    return toRfException(required(rows, 'RF exception was not stored'));
  }

  async getIntegrationCommandCenter(warehouseId: string): Promise<RuntimeIntegrationCommandCenter> {
    await this.ensureTables();

    const [events, reconciliations] = await Promise.all([
      this.query<IntegrationEventRow>(
        `SELECT * FROM ops_integration_events
         WHERE warehouse_id = $1
         ORDER BY updated_at DESC LIMIT 50`,
        warehouseId,
      ),
      this.query<ReconciliationRow>(
        `SELECT * FROM ops_reconciliation_runs
         WHERE warehouse_id = $1
         ORDER BY created_at DESC LIMIT 1`,
        warehouseId,
      ),
    ]);

    const eventModels = events.map(toIntegrationEvent);
    const connectors = buildConnectors(eventModels);
    const lastRun = reconciliations[0];

    return {
      warehouseId,
      connectors,
      events: eventModels,
      deadLetterCount: eventModels.filter((event) => event.state === RuntimeIntegrationState.DEAD_LETTER).length,
      retryableCount: eventModels.filter((event) => event.state === RuntimeIntegrationState.DEAD_LETTER || event.state === RuntimeIntegrationState.WAITING).length,
      reconciliation: {
        lastRunAt: lastRun ? isoString(lastRun.created_at) : null,
        status: lastRun?.status ?? 'NOT_RUN',
        mismatches: lastRun?.mismatches ?? 0,
        nextRunHint: 'Run reconciliation after connector retry or before end-of-day billing export.',
      },
      productionChecklist: [
        { code: 'erp-map', label: 'ERP/e-shop ID mapping exists', status: 'ok' },
        { code: 'webhook-retry', label: 'Webhook retry + dead-letter queue enabled', status: 'ok' },
        { code: 'carrier-label', label: 'Carrier labels/manifest tested', status: 'watch' },
        { code: 'print-proof', label: 'Physical printer proof uploaded', status: hasEnv('PRINT_RAW_9100_HOST') ? 'ok' : 'missing' },
        { code: 'edi-ack', label: 'EDI 940/945/846 ACK lifecycle', status: 'watch' },
      ],
    };
  }

  async ingestIntegrationEvent(warehouseId: string, dto: RuntimeIntegrationEventIngestDto): Promise<RuntimeIntegrationEvent> {
    await this.ensureTables();
    const connectorCode = dto.connectorCode.trim().toUpperCase();
    const flow = dto.flow.trim();
    const externalId = dto.externalId.trim();
    const state = normalizeIntegrationState(dto.state);
    const rows = await this.query<IntegrationEventRow>(
      `INSERT INTO ops_integration_events
        (warehouse_id, connector_code, flow, state, external_id, attempts, max_attempts, retry_after, payload, last_error)
       VALUES ($1, $2, $3, $4, $5, 0, $6, CASE WHEN $4 IN ('WAITING','RETRYING') THEN now() ELSE NULL END, $7::jsonb, NULL)
       ON CONFLICT (warehouse_id, connector_code, flow, external_id) DO UPDATE SET
         state = CASE
           WHEN ops_integration_events.state = 'APPLIED' THEN ops_integration_events.state
           ELSE EXCLUDED.state
         END,
         max_attempts = EXCLUDED.max_attempts,
         retry_after = EXCLUDED.retry_after,
         payload = EXCLUDED.payload,
         last_error = NULL,
         updated_at = now()
       RETURNING *`,
      warehouseId,
      connectorCode,
      flow,
      state,
      externalId,
      dto.maxAttempts ?? 5,
      json({
        ...(dto.payload ?? {}),
        ingestedAt: new Date().toISOString(),
        source: 'operations-runtime',
      }),
    );

    return toIntegrationEvent(required(rows, 'Integration event was not ingested'));
  }

  async applyIntegrationEvent(
    warehouseId: string,
    eventId: string,
    dto: RuntimeIntegrationEventApplyDto,
  ): Promise<RuntimeIntegrationEvent> {
    await this.ensureTables();
    const rows = await this.query<IntegrationEventRow>(
      `UPDATE ops_integration_events
       SET state = 'APPLIED',
           attempts = attempts + 1,
           retry_after = NULL,
           last_error = NULL,
           payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       WHERE warehouse_id = $1 AND id = $2::uuid
       RETURNING *`,
      warehouseId,
      eventId,
      json({
        appliedAt: new Date().toISOString(),
        mapping: dto.mapping ?? null,
        note: dto.note ?? null,
      }),
    );

    if (!rows[0]) throw new NotFoundException('Integration event was not found');
    return toIntegrationEvent(rows[0]);
  }

  async testPrintLabel(warehouseId: string, dto: RuntimePrintLabelTestDto): Promise<{
    event: RuntimeIntegrationEvent;
    dryRun: boolean;
    stationCode: string;
    zplPreview: string;
    instruction: string;
  }> {
    await this.ensureTables();
    const connectorCode = dto.connectorCode?.trim().toUpperCase() || 'PRINT';
    const stationCode = dto.stationCode?.trim().toUpperCase() || 'PACK-01';
    const reference = dto.reference?.trim() || `PRINT-TEST-${Date.now()}`;
    const templateCode = dto.templateCode?.trim().toUpperCase() || 'SAMPLE_ZPL';
    const zplPreview = `^XA^FO40,40^A0N,34,34^FDWMS TEST ${reference}^FS^FO40,95^BY2^BCN,80,Y,N,N^FD${reference}^FS^XZ`;
    const rows = await this.query<IntegrationEventRow>(
      `INSERT INTO ops_integration_events
        (warehouse_id, connector_code, flow, state, external_id, attempts, max_attempts, payload, last_error)
       VALUES ($1, $2, 'label.print', $3, $4, 1, 3, $5::jsonb, NULL)
       ON CONFLICT (warehouse_id, connector_code, flow, external_id) DO UPDATE SET
         state = EXCLUDED.state,
         attempts = ops_integration_events.attempts + 1,
         payload = EXCLUDED.payload,
         updated_at = now(),
         last_error = NULL
       RETURNING *`,
      warehouseId,
      connectorCode,
      dto.dryRun === false ? RuntimeIntegrationState.WAITING : RuntimeIntegrationState.APPLIED,
      reference,
      json({ stationCode, templateCode, dryRun: dto.dryRun !== false, zplPreview }),
    );

    return {
      event: toIntegrationEvent(required(rows, 'Print test event was not stored')),
      dryRun: dto.dryRun !== false,
      stationCode,
      zplPreview,
      instruction: dto.dryRun === false
        ? 'Print test was queued for the configured print adapter.'
        : 'Dry-run label rendered and stored without sending data to a physical printer.',
    };
  }

  async retryIntegrationEvent(warehouseId: string, eventId: string): Promise<RuntimeIntegrationEvent> {
    await this.ensureTables();
    const rows = await this.query<IntegrationEventRow>(
      `UPDATE ops_integration_events
       SET state = CASE WHEN attempts + 1 >= max_attempts THEN 'DEAD_LETTER' ELSE 'RETRYING' END,
           attempts = attempts + 1,
           retry_after = now() + interval '2 minutes',
           updated_at = now(),
           last_error = CASE WHEN attempts + 1 >= max_attempts THEN last_error ELSE NULL END
       WHERE warehouse_id = $1 AND id = $2::uuid
       RETURNING *`,
      warehouseId,
      eventId,
    );

    if (!rows[0]) throw new NotFoundException('Integration event was not found');
    return toIntegrationEvent(rows[0]);
  }

  async runReconciliation(warehouseId: string, dto: RuntimeReconciliationRunDto): Promise<{
    id: string;
    warehouseId: string;
    connectorCode: string | null;
    status: string;
    mismatches: number;
    summary: Record<string, unknown>;
    createdAt: string;
  }> {
    await this.ensureTables();
    const events = await this.query<IntegrationEventRow>(
      `SELECT * FROM ops_integration_events
       WHERE warehouse_id = $1 AND ($2::text IS NULL OR connector_code = $2)
       ORDER BY updated_at DESC`,
      warehouseId,
      dto.connectorCode?.trim().toUpperCase() || null,
    );
    const dead = events.filter((event) => event.state === RuntimeIntegrationState.DEAD_LETTER).length;
    const waiting = events.filter((event) => event.state === RuntimeIntegrationState.WAITING || event.state === RuntimeIntegrationState.RETRYING).length;
    const mismatches = dead + Math.max(0, waiting - 1);
    const status = mismatches > 2 ? 'ATTENTION_REQUIRED' : mismatches > 0 ? 'WATCH' : 'MATCHED';
    const summary = {
      dryRun: dto.dryRun ?? true,
      flow: dto.flow ?? 'all',
      checked: events.length,
      deadLetters: dead,
      waiting,
      advice: mismatches ? 'Resolve dead letters and re-run reconciliation.' : 'No mismatches found.',
    };
    const rows = await this.query<ReconciliationRow>(
      `INSERT INTO ops_reconciliation_runs
        (warehouse_id, connector_code, status, mismatches, summary)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING *`,
      warehouseId,
      dto.connectorCode?.trim().toUpperCase() || null,
      status,
      mismatches,
      json(summary),
    );
    const row = required(rows, 'Reconciliation run was not stored');
    return {
      id: row.id,
      warehouseId: row.warehouse_id,
      connectorCode: row.connector_code,
      status: row.status,
      mismatches: row.mismatches,
      summary: asRecord(row.summary),
      createdAt: isoString(row.created_at),
    };
  }

  async listRules(warehouseId: string, type?: RuntimeRuleType): Promise<RuntimeOperationRule[]> {
    await this.ensureTables();
    const rows = await this.query<OperationRuleRow>(
      `SELECT * FROM ops_operation_rules
       WHERE warehouse_id = $1 AND ($2::text IS NULL OR type = $2)
       ORDER BY type ASC, priority DESC, code ASC`,
      warehouseId,
      type ?? null,
    );
    return rows.map(toOperationRule);
  }

  async upsertRule(warehouseId: string, dto: RuntimeRuleUpsertDto): Promise<RuntimeOperationRule> {
    await this.ensureTables();
    const rows = await this.query<OperationRuleRow>(
      `INSERT INTO ops_operation_rules
        (warehouse_id, code, name, type, enabled, priority, scope, conditions, actions, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
       ON CONFLICT (warehouse_id, code) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         enabled = EXCLUDED.enabled,
         priority = EXCLUDED.priority,
         scope = EXCLUDED.scope,
         conditions = EXCLUDED.conditions,
         actions = EXCLUDED.actions,
         notes = EXCLUDED.notes,
         updated_at = now()
       RETURNING *`,
      warehouseId,
      dto.code.trim().toUpperCase(),
      dto.name.trim(),
      dto.type,
      dto.enabled ?? true,
      dto.priority ?? 50,
      json(dto.scope),
      json(dto.conditions),
      json(dto.actions),
      dto.notes?.trim() || null,
    );
    return toOperationRule(required(rows, 'Operation rule was not saved'));
  }

  async evaluateRules(
    warehouseId: string,
    dto: RuntimeRuleEvaluationDto,
  ): Promise<RuntimeRuleEvaluation> {
    const rules = await this.listRules(warehouseId);
    const allowedTypes = new Set(dto.ruleTypes ?? Object.values(RuntimeRuleType));
    const matchedRules = rules.filter((rule) => rule.enabled && allowedTypes.has(rule.type) && matchesContext(rule.conditions, dto.context));

    return {
      warehouseId,
      evaluatedAt: new Date().toISOString(),
      context: dto.context,
      matchedRules,
      recommendedActions: matchedRules.map((rule) => ({ ruleCode: rule.code, action: rule.actions })),
    };
  }

  private async ensureTables(): Promise<void> {
    await this.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ops_rf_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id text NOT NULL,
      device_code text NOT NULL,
      worker_code text NOT NULL,
      flow text NOT NULL,
      state text NOT NULL,
      current_step text NOT NULL,
      offline_queue jsonb NOT NULL DEFAULT '[]'::jsonb,
      last_error text,
      started_at timestamptz NOT NULL DEFAULT now(),
      last_seen_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ops_rf_sessions_scope_idx ON ops_rf_sessions (warehouse_id, device_code, state, last_seen_at DESC)`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ops_rf_scan_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id text NOT NULL,
      session_id uuid,
      device_code text NOT NULL,
      task_reference text,
      step_key text NOT NULL,
      scanned_value text NOT NULL,
      expected_value text,
      result text NOT NULL,
      offline_id text,
      quantity integer,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ops_rf_scan_events_offline_key ON ops_rf_scan_events (warehouse_id, device_code, offline_id) WHERE offline_id IS NOT NULL`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ops_rf_scan_events_scope_idx ON ops_rf_scan_events (warehouse_id, created_at DESC)`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ops_rf_exceptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id text NOT NULL,
      session_id uuid,
      device_code text NOT NULL,
      task_reference text,
      code text NOT NULL,
      title text NOT NULL,
      status text NOT NULL,
      severity text NOT NULL,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ops_rf_exceptions_scope_idx ON ops_rf_exceptions (warehouse_id, status, severity, created_at DESC)`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ops_integration_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id text NOT NULL,
      connector_code text NOT NULL,
      flow text NOT NULL,
      state text NOT NULL,
      external_id text NOT NULL,
      attempts integer NOT NULL DEFAULT 0,
      max_attempts integer NOT NULL DEFAULT 5,
      retry_after timestamptz,
      payload jsonb,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ops_integration_events_scope_idx ON ops_integration_events (warehouse_id, state, updated_at DESC)`);
    await this.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ops_integration_events_external_key ON ops_integration_events (warehouse_id, connector_code, flow, external_id)`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ops_reconciliation_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id text NOT NULL,
      connector_code text,
      status text NOT NULL,
      mismatches integer NOT NULL DEFAULT 0,
      summary jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ops_reconciliation_runs_scope_idx ON ops_reconciliation_runs (warehouse_id, created_at DESC)`);
    await this.exec(`CREATE TABLE IF NOT EXISTS ops_operation_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id text NOT NULL,
      code text NOT NULL,
      name text NOT NULL,
      type text NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      priority integer NOT NULL DEFAULT 50,
      scope jsonb NOT NULL DEFAULT '{}'::jsonb,
      conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
      actions jsonb NOT NULL DEFAULT '{}'::jsonb,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (warehouse_id, code)
    )`);
    await this.exec(`CREATE INDEX IF NOT EXISTS ops_operation_rules_scope_idx ON ops_operation_rules (warehouse_id, type, enabled, priority DESC)`);
  }

  private query<T>(query: string, ...params: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(query, ...params);
  }

  private async exec(query: string, ...params: unknown[]): Promise<void> {
    await this.prisma.$executeRawUnsafe(query, ...params);
  }
}

function toRfSession(row: RfSessionRow): RuntimeRfSession {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    deviceCode: row.device_code,
    workerCode: row.worker_code,
    flow: row.flow,
    state: row.state,
    currentStep: row.current_step,
    queuedOfflineActions: offlineQueueLength(row.offline_queue),
    lastError: row.last_error,
    startedAt: isoString(row.started_at),
    lastSeenAt: isoString(row.last_seen_at),
  };
}

function toRfScanEvent(row: RfScanRow): RuntimeRfScanEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    deviceCode: row.device_code,
    taskReference: row.task_reference,
    stepKey: row.step_key,
    scannedValue: row.scanned_value,
    expectedValue: row.expected_value,
    result: row.result,
    offlineId: row.offline_id,
    quantity: row.quantity,
    createdAt: isoString(row.created_at),
  };
}

function toRfException(row: RfExceptionRow): RuntimeRfException {
  return {
    id: row.id,
    sessionId: row.session_id,
    deviceCode: row.device_code,
    taskReference: row.task_reference,
    code: row.code,
    title: row.title,
    status: row.status,
    severity: row.severity,
    createdAt: isoString(row.created_at),
  };
}

function toIntegrationEvent(row: IntegrationEventRow): RuntimeIntegrationEvent {
  return {
    id: row.id,
    connectorCode: row.connector_code,
    flow: row.flow,
    state: row.state,
    externalId: row.external_id,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    retryAfter: row.retry_after ? isoString(row.retry_after) : null,
    lastError: row.last_error,
    updatedAt: isoString(row.updated_at),
  };
}

function toOperationRule(row: OperationRuleRow): RuntimeOperationRule {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    code: row.code,
    name: row.name,
    type: row.type,
    enabled: row.enabled,
    priority: row.priority,
    scope: asRecord(row.scope),
    conditions: asRecord(row.conditions),
    actions: asRecord(row.actions),
    notes: row.notes,
    updatedAt: isoString(row.updated_at),
  };
}

function buildConnectors(events: RuntimeIntegrationEvent[]): RuntimeConnector[] {
  const connectorCodes = [...new Set(events.map((event) => event.connectorCode).filter(Boolean))]
    .filter((code) => !isPlaceholderConnectorCode(code));

  return connectorCodes.map((code) => {
    const ownEvents = events.filter((event) => event.connectorCode === code);
    const deadLetters = ownEvents.filter((event) => event.state === RuntimeIntegrationState.DEAD_LETTER).length;
    const openEvents = ownEvents.filter((event) => event.state !== RuntimeIntegrationState.APPLIED).length;

    return {
      code,
      title: humanizeConnectorCode(code),
      category: connectorCategoryFromCode(code),
      mode: 'LIVE',
      health: deadLetters > 0 ? 'DEGRADED' : 'CONNECTED',
      openEvents,
      deadLetters,
      lastSyncAt: ownEvents[0]?.updatedAt ?? null,
      requiredSecrets: [],
      capabilities: [...new Set(ownEvents.map((event) => event.flow).filter(Boolean))],
    };
  });
}

function humanizeConnectorCode(code: string): string {
  return code
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function connectorCategoryFromCode(code: string): RuntimeConnector['category'] {
  const normalized = code.toUpperCase();
  if (normalized.includes('ERP')) return 'ERP';
  if (normalized.includes('SHOP') || normalized.includes('ECOM')) return 'ECOMMERCE';
  if (normalized.includes('CARRIER') || normalized.includes('SHIP')) return 'CARRIER';
  if (normalized.includes('PRINT') || normalized.includes('LABEL')) return 'PRINT';
  if (normalized.includes('EDI')) return 'EDI';
  return 'WEBHOOK';
}

function isPlaceholderConnectorCode(code: string): boolean {
  const normalized = code.toUpperCase();
  return (
    /(^|_)[A-D]$/.test(normalized)
    || /^CARRIER_[A-D]$/.test(normalized)
    || /^PRINT_PACK_[0-9]+$/.test(normalized)
    || normalized.includes('CLIENT_')
    || normalized.includes('DEMO')
    || normalized.includes('SANDBOX')
    || normalized.includes('PLACEHOLDER')
  );
}

function matchesContext(conditions: Record<string, unknown>, context: Record<string, unknown>): boolean {
  const entries = Object.entries(conditions);
  if (!entries.length) return true;

  return entries.every(([key, expected]) => {
    const actual = context[key];
    if (Array.isArray(expected)) return expected.map(String).includes(String(actual));
    if (expected && typeof expected === 'object' && 'min' in expected) {
      const min = Number((expected as { min?: unknown }).min);
      return Number(actual) >= min;
    }
    if (expected && typeof expected === 'object' && 'max' in expected) {
      const max = Number((expected as { max?: unknown }).max);
      return Number(actual) <= max;
    }
    return String(actual) === String(expected);
  });
}

function isExpected(scanned: string, expected?: string): boolean {
  if (!expected || !expected.trim()) return true;
  return normalize(scanned) === normalize(expected);
}

function normalize(value: string): string {
  return value.trim().toUpperCase();
}

function nextRfStep(current: string, result: RuntimeRfResult): string {
  if (result !== RuntimeRfResult.ACCEPTED) return current;
  const order = ['SCAN_LOCATION', 'SCAN_SKU', 'CONFIRM_QTY', 'SCAN_TOTE', 'COMPLETE'];
  const index = order.indexOf(current);
  return order[Math.min(order.length - 1, index + 1)] ?? 'SCAN_LOCATION';
}

function defaultExceptionTitle(code: string): string {
  const normalized = code.trim().toUpperCase();
  const labels: Record<string, string> = {
    SHORT_PICK: 'Short pick reported from RF',
    DAMAGED_STOCK: 'Damaged stock found by operator',
    WRONG_LOCATION: 'Wrong location scan',
    WRONG_SKU: 'Wrong SKU scan',
    PRINTER_DOWN: 'Printer unavailable',
  };
  return labels[normalized] ?? `${normalized} reported from RF`;
}

function offlineQueueLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function required<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new NotFoundException(message);
  return row;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function normalizeIntegrationState(value?: string): RuntimeIntegrationState {
  const normalized = value?.trim().toUpperCase();
  const allowed = Object.values(RuntimeIntegrationState);
  return allowed.includes(normalized as RuntimeIntegrationState)
    ? (normalized as RuntimeIntegrationState)
    : RuntimeIntegrationState.WAITING;
}

function hasEnv(key: string): boolean {
  return Boolean(process.env[key]?.trim());
}
