import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { CreateExternalSystemDto } from './dto/create-external-system.dto';
import { ReplayDeadLetterDto } from './dto/replay-dead-letter.dto';
import { ResolveDeadLetterDto } from './dto/resolve-dead-letter.dto';
import { RunReconciliationDto } from './dto/run-reconciliation.dto';
import { UpsertExternalIdMappingDto } from './dto/upsert-external-id-mapping.dto';
import { deadLetterFingerprint, normalizeExternalSystemCode, normalizeResourceType } from './integration-enterprise.helpers';
import {
  ExternalIdMappingResponse,
  ExternalSystemResponse,
  ExternalSystemStatus,
  IntegrationDeadLetterDashboardResponse,
  IntegrationDeadLetterResponse,
  IntegrationOperationsSummaryResponse,
  IntegrationReconciliationResponse,
  IntegrationReplayResponse,
  IntegrationDeadLetterStatus,
} from './integration-enterprise.types';

@Injectable()
export class IntegrationEnterpriseService {
  constructor(private readonly prisma: PrismaService) {}

  async getOperationsSummary(): Promise<IntegrationOperationsSummaryResponse> {
    const [endpointRows, systemRows, outboxRows, deadLetterRows, dispatchRows] = await Promise.all([
      this.query<EndpointOpsRow>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'ACTIVE') AS active,
                count(*) FILTER (WHERE status = 'ERROR') AS error,
                count(*) FILTER (WHERE status = 'INACTIVE') AS inactive
         FROM integration_endpoints`,
      ),
      this.query<SystemOpsRow>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE status = 'ACTIVE') AS active
         FROM external_systems`,
      ),
      this.query<OutboxOpsRow>(
        `SELECT status, count(*) AS count, COALESCE(sum(attempts), 0) AS total_attempts
         FROM outbox_events
         GROUP BY status
         ORDER BY status ASC`,
      ),
      this.query<DeadLetterOpsRow>(
        `SELECT count(*) FILTER (WHERE status = 'OPEN') AS open,
                count(*) FILTER (WHERE status = 'RETRYING') AS retrying,
                count(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
                count(*) FILTER (WHERE status = 'IGNORED') AS ignored
         FROM integration_dead_letters`,
      ),
      this.query<DispatchOpsRow>(
        `SELECT count(*) AS total,
                count(*) FILTER (WHERE success = false) AS failures
         FROM integration_dispatch_logs
         WHERE created_at >= now() - interval '24 hours'`,
      ),
    ]);
    const endpoints = endpointRows[0] ?? emptyEndpointOps();
    const systems = systemRows[0] ?? { total: 0, active: 0 };
    const deadLetters = deadLetterRows[0] ?? { open: 0, retrying: 0, resolved: 0, ignored: 0 };
    const dispatch = dispatchRows[0] ?? { total: 0, failures: 0 };
    const dispatchTotal = toNumber(dispatch.total);
    const dispatchFailures = toNumber(dispatch.failures);
    const openDeadLetters = toNumber(deadLetters.open) + toNumber(deadLetters.retrying);
    const recommendedActions = [
      ...(openDeadLetters > 0 ? [`Replay or resolve ${openDeadLetters} open integration dead letter(s).`] : []),
      ...(toNumber(endpoints.error) > 0 ? [`Fix ${toNumber(endpoints.error)} endpoint(s) in ERROR state.`] : []),
      ...(dispatchFailures > 0 ? [`Review ${dispatchFailures} dispatch failure(s) from the last 24h.`] : []),
      ...(openDeadLetters === 0 && dispatchFailures === 0 ? ['Integration runtime is clean. Keep reconciliation on the daily checklist.'] : []),
    ];

    return {
      generatedAt: new Date(),
      endpoints: {
        total: toNumber(endpoints.total),
        active: toNumber(endpoints.active),
        error: toNumber(endpoints.error),
        inactive: toNumber(endpoints.inactive),
      },
      externalSystems: {
        total: toNumber(systems.total),
        active: toNumber(systems.active),
      },
      outbox: outboxRows.map((row) => ({
        status: row.status,
        count: toNumber(row.count),
        totalAttempts: toNumber(row.total_attempts),
      })),
      deadLetters: {
        open: toNumber(deadLetters.open),
        retrying: toNumber(deadLetters.retrying),
        resolved: toNumber(deadLetters.resolved),
        ignored: toNumber(deadLetters.ignored),
      },
      dispatch: {
        last24h: dispatchTotal,
        failures24h: dispatchFailures,
        successRate24h: dispatchTotal === 0 ? 1 : Number(((dispatchTotal - dispatchFailures) / dispatchTotal).toFixed(4)),
      },
      recommendedActions,
    };
  }

  async replayDeadLetter(
    deadLetterReference: string,
    dto: ReplayDeadLetterDto,
    actor: AuthenticatedUser,
  ): Promise<IntegrationReplayResponse> {
    const existing = await this.findDeadLetter(deadLetterReference);
    let outboxEventId = existing.outbox_event_id;
    let replayCreated = false;

    if (existing.status === IntegrationDeadLetterStatus.RESOLVED && !dto.force) {
      throw new ConflictException('Dead letter is already resolved. Use force=true to replay anyway.');
    }

    if (outboxEventId) {
      await this.execute(
        `UPDATE outbox_events
         SET status = 'PENDING', attempts = 0, last_error = NULL, available_at = now(), updated_at = now()
         WHERE id = $1::uuid`,
        outboxEventId,
      );
    } else {
      const rows = await this.query<{ id: string }>(
        `INSERT INTO outbox_events (type, aggregate_type, aggregate_id, payload, status, attempts, available_at)
         VALUES ($1, $2, $3, $4::jsonb, 'PENDING', 0, now())
         RETURNING id`,
        existing.event_type,
        existing.resource_type ?? 'integration_dead_letter',
        existing.resource_id ?? existing.id,
        json({ replayedDeadLetterId: existing.id, originalPayload: existing.payload ?? null }),
      );
      outboxEventId = rows[0]?.id ?? null;
      replayCreated = true;
    }

    const rows = await this.query<IntegrationDeadLetterRow>(
      `UPDATE integration_dead_letters SET
         status = $1,
         replayed_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
       WHERE id = $3::uuid
       RETURNING *`,
      IntegrationDeadLetterStatus.REPLAYED,
      json({ ...(dto.metadata ?? {}), note: dto.note ?? null, replayedByUserId: actor.id, outboxEventId }),
      existing.id,
    );
    const updated = requiredRow(rows, 'Dead letter was not replayed');
    await this.writeAudit(actor, 'integration_dead_letter.replayed', 'integration_dead_letter', updated.id, null, {
      outboxEventId,
      replayCreated,
      note: dto.note ?? null,
    });

    return {
      deadLetterId: updated.id,
      status: updated.status as IntegrationDeadLetterStatus,
      outboxEventId,
      replayCreated,
      replayedAt: updated.replayed_at ?? new Date(),
    };
  }

  async runReconciliation(
    dto: RunReconciliationDto,
    actor: AuthenticatedUser,
  ): Promise<IntegrationReconciliationResponse> {
    const system = dto.externalSystemReference
      ? await this.resolveExternalSystem(dto.externalSystemReference)
      : null;
    const warehouse = dto.warehouseReference ? await this.resolveWarehouse(dto.warehouseReference) : null;
    const ownerClient = dto.ownerClientReference ? await this.resolveClient(dto.ownerClientReference) : null;
    const resourceTypes = dto.resourceType
      ? [normalizeResourceType(dto.resourceType)]
      : ['OUTBOUND_ORDER', 'WAREHOUSE_TASK', 'SHIPMENT', 'STOCK_QUANT'];
    const resources = [];

    for (const resourceType of resourceTypes) {
      resources.push(
        await this.buildReconciliationBucket({
          resourceType,
          externalSystemId: system?.id ?? null,
          warehouseId: warehouse?.id ?? null,
          ownerClientId: ownerClient?.id ?? null,
        }),
      );
    }

    const [deadLetters, outbox] = await Promise.all([
      this.query<{ count: number | string | bigint }>(
        `SELECT count(*) AS count FROM integration_dead_letters WHERE status IN ('OPEN', 'RETRYING')`,
      ),
      this.query<{ count: number | string | bigint }>(
        `SELECT count(*) AS count FROM outbox_events WHERE status IN ('PENDING', 'FAILED')`,
      ),
    ]);
    const responseWithoutAudit = {
      generatedAt: new Date(),
      externalSystemId: system?.id ?? null,
      externalSystemCode: system?.code ?? null,
      warehouseId: warehouse?.id ?? null,
      ownerClientId: ownerClient?.id ?? null,
      resources,
      openDeadLetters: toNumber(deadLetters[0]?.count ?? 0),
      pendingOutboxEvents: toNumber(outbox[0]?.count ?? 0),
      auditLogId: null,
    };
    const auditRows = await this.query<{ id: string }>(
      `INSERT INTO audit_logs (actor_user_id, warehouse_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, $2::uuid, 'integration.reconciliation_run', 'integration_reconciliation', $3, $4::jsonb)
       RETURNING id`,
      actor.id,
      warehouse?.id ?? null,
      system?.id ?? 'all',
      json({ ...responseWithoutAudit, requestedMetadata: dto.metadata ?? {} }),
    );

    return { ...responseWithoutAudit, auditLogId: auditRows[0]?.id ?? null };
  }

  async getLastReconciliationReport(): Promise<IntegrationReconciliationResponse | null> {
    const rows = await this.query<{ id: string; metadata: unknown }>(
      `SELECT id, metadata FROM audit_logs
       WHERE action = 'integration.reconciliation_run'
       ORDER BY created_at DESC
       LIMIT 1`,
    );
    const row = rows[0];
    if (!row) return null;
    const metadata = toObject(row.metadata) as Partial<IntegrationReconciliationResponse>;

    return {
      generatedAt: metadata.generatedAt ? new Date(metadata.generatedAt) : new Date(),
      externalSystemId: metadata.externalSystemId ?? null,
      externalSystemCode: metadata.externalSystemCode ?? null,
      warehouseId: metadata.warehouseId ?? null,
      ownerClientId: metadata.ownerClientId ?? null,
      resources: Array.isArray(metadata.resources) ? metadata.resources : [],
      openDeadLetters: Number(metadata.openDeadLetters ?? 0),
      pendingOutboxEvents: Number(metadata.pendingOutboxEvents ?? 0),
      auditLogId: row.id,
    };
  }

  async listExternalSystems(): Promise<ExternalSystemResponse[]> {
    const rows = await this.query<ExternalSystemRow>(`SELECT * FROM external_systems ORDER BY code ASC`);
    return rows.map(toExternalSystemResponse);
  }

  async createExternalSystem(
    dto: CreateExternalSystemDto,
    actor: AuthenticatedUser,
  ): Promise<ExternalSystemResponse> {
    const ownerClient = dto.ownerClientReference ? await this.resolveClient(dto.ownerClientReference) : null;
    const rows = await this.query<ExternalSystemRow>(
      `INSERT INTO external_systems (code, name, system_type, status, owner_client_id, config)
       VALUES ($1, $2, $3, $4, $5::uuid, $6::jsonb)
       ON CONFLICT (code) DO UPDATE SET
         name = EXCLUDED.name,
         system_type = EXCLUDED.system_type,
         status = EXCLUDED.status,
         owner_client_id = EXCLUDED.owner_client_id,
         config = EXCLUDED.config,
         updated_at = now()
       RETURNING *`,
      normalizeExternalSystemCode(dto.code),
      dto.name.trim(),
      normalizeResourceType(dto.systemType),
      dto.status ?? ExternalSystemStatus.ACTIVE,
      ownerClient?.id ?? null,
      json(dto.config),
    );
    const system = requiredRow(rows, 'External system was not saved');
    await this.writeAudit(actor, 'external_system.upserted', 'external_system', system.id, null, {
      code: system.code,
      systemType: system.system_type,
    });
    return toExternalSystemResponse(system);
  }

  async upsertExternalIdMapping(
    dto: UpsertExternalIdMappingDto,
    actor: AuthenticatedUser,
  ): Promise<ExternalIdMappingResponse> {
    const system = await this.resolveExternalSystem(dto.externalSystemReference);
    const warehouse = dto.warehouseReference ? await this.resolveWarehouse(dto.warehouseReference) : null;
    const ownerClient = dto.ownerClientReference ? await this.resolveClient(dto.ownerClientReference) : null;
    const rows = await this.query<ExternalIdMappingRow>(
      `INSERT INTO external_id_mappings
        (external_system_id, warehouse_id, owner_client_id, resource_type, resource_id, external_id, external_type, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (external_system_id, resource_type, external_id) DO UPDATE SET
         warehouse_id = EXCLUDED.warehouse_id,
         owner_client_id = EXCLUDED.owner_client_id,
         resource_id = EXCLUDED.resource_id,
         external_type = EXCLUDED.external_type,
         metadata = EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      system.id,
      warehouse?.id ?? null,
      ownerClient?.id ?? null,
      normalizeResourceType(dto.resourceType),
      dto.resourceId,
      dto.externalId.trim(),
      nullable(dto.externalType),
      json(dto.metadata),
    );
    const mapping = requiredRow(rows, 'External ID mapping was not saved');
    await this.writeAudit(actor, 'external_id_mapping.upserted', 'external_id_mapping', mapping.id, warehouse?.id ?? null, {
      externalSystemId: system.id,
      resourceType: mapping.resource_type,
      resourceId: mapping.resource_id,
    });
    return toExternalIdMappingResponse(mapping);
  }

  async resolveExternalIdMapping(input: {
    externalSystemReference: string;
    resourceType: string;
    externalId: string;
  }): Promise<ExternalIdMappingResponse> {
    const system = await this.resolveExternalSystem(input.externalSystemReference);
    const rows = await this.query<ExternalIdMappingRow>(
      `SELECT * FROM external_id_mappings
       WHERE external_system_id = $1::uuid AND resource_type = $2 AND external_id = $3
       LIMIT 1`,
      system.id,
      normalizeResourceType(input.resourceType),
      input.externalId.trim(),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('External ID mapping was not found');
    return toExternalIdMappingResponse(row);
  }

  async listDeadLetters(status?: string): Promise<IntegrationDeadLetterResponse[]> {
    const rows = await this.query<IntegrationDeadLetterRow>(
      `SELECT * FROM integration_dead_letters
       WHERE ($1::text IS NULL OR status = $1)
       ORDER BY created_at DESC LIMIT 200`,
      status ? normalizeResourceType(status) : null,
    );
    return rows.map(toDeadLetterResponse);
  }

  async getDeadLetterDashboard(): Promise<IntegrationDeadLetterDashboardResponse> {
    const [byStatus, byEventType, topFingerprints] = await Promise.all([
      this.query<DeadLetterDashboardRow>(
        `SELECT status AS key,
                count(*) AS count,
                count(*) FILTER (WHERE status IN ('OPEN', 'RETRYING')) AS open_count,
                COALESCE(sum(attempts), 0) AS total_attempts,
                max(updated_at) AS last_seen_at
         FROM integration_dead_letters
         GROUP BY status
         ORDER BY count DESC`,
      ),
      this.query<DeadLetterDashboardRow>(
        `SELECT event_type AS key,
                count(*) AS count,
                count(*) FILTER (WHERE status IN ('OPEN', 'RETRYING')) AS open_count,
                COALESCE(sum(attempts), 0) AS total_attempts,
                max(updated_at) AS last_seen_at
         FROM integration_dead_letters
         GROUP BY event_type
         ORDER BY count DESC
         LIMIT 20`,
      ),
      this.query<DeadLetterDashboardRow>(
        `SELECT fingerprint AS key,
                count(*) AS count,
                count(*) FILTER (WHERE status IN ('OPEN', 'RETRYING')) AS open_count,
                COALESCE(sum(attempts), 0) AS total_attempts,
                max(updated_at) AS last_seen_at
         FROM integration_dead_letters
         GROUP BY fingerprint
         ORDER BY open_count DESC, count DESC, last_seen_at DESC
         LIMIT 20`,
      ),
    ]);
    const statusBuckets = byStatus.map(toDashboardBucket);
    const byStatusMap = new Map(statusBuckets.map((bucket) => [bucket.key, bucket]));

    return {
      generatedAt: new Date(),
      totalCount: statusBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
      openCount: byStatusMap.get(IntegrationDeadLetterStatus.OPEN)?.count ?? 0,
      retryingCount: byStatusMap.get(IntegrationDeadLetterStatus.RETRYING)?.count ?? 0,
      resolvedCount: byStatusMap.get(IntegrationDeadLetterStatus.RESOLVED)?.count ?? 0,
      ignoredCount: byStatusMap.get(IntegrationDeadLetterStatus.IGNORED)?.count ?? 0,
      byStatus: statusBuckets,
      byEventType: byEventType.map(toDashboardBucket),
      topFingerprints: topFingerprints.map(toDashboardBucket),
    };
  }

  async recordDeadLetter(input: {
    endpointId?: string | null;
    outboxEventId?: string | null;
    inboxEventId?: string | null;
    eventType: string;
    resourceType?: string | null;
    resourceId?: string | null;
    errorMessage: string;
    attempts?: number;
    nextRetryAt?: Date | null;
    payload?: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<IntegrationDeadLetterResponse> {
    const fingerprint = deadLetterFingerprint(input);
    const rows = await this.query<IntegrationDeadLetterRow>(
      `INSERT INTO integration_dead_letters
        (endpoint_id, outbox_event_id, inbox_event_id, event_type, resource_type, resource_id, status, error_message, attempts, next_retry_at, payload, metadata, fingerprint)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13)
       ON CONFLICT (fingerprint) DO UPDATE SET
         attempts = integration_dead_letters.attempts + 1,
         error_message = EXCLUDED.error_message,
         status = 'OPEN',
         next_retry_at = EXCLUDED.next_retry_at,
         payload = EXCLUDED.payload,
         metadata = COALESCE(integration_dead_letters.metadata, '{}'::jsonb) || EXCLUDED.metadata,
         updated_at = now()
       RETURNING *`,
      input.endpointId ?? null,
      input.outboxEventId ?? null,
      input.inboxEventId ?? null,
      normalizeResourceType(input.eventType),
      input.resourceType ? normalizeResourceType(input.resourceType) : null,
      input.resourceId ?? null,
      IntegrationDeadLetterStatus.OPEN,
      input.errorMessage.slice(0, 4000),
      Math.max(1, Math.trunc(input.attempts ?? 1)),
      input.nextRetryAt ?? null,
      json(input.payload),
      json(input.metadata),
      fingerprint,
    );
    return toDeadLetterResponse(requiredRow(rows, 'Integration dead letter was not recorded'));
  }

  async resolveDeadLetter(
    deadLetterReference: string,
    dto: ResolveDeadLetterDto,
    actor: AuthenticatedUser,
  ): Promise<IntegrationDeadLetterResponse> {
    const existing = await this.findDeadLetter(deadLetterReference);
    const timestampColumn = dto.status === IntegrationDeadLetterStatus.REPLAYED ? 'replayed_at' : 'resolved_at';
    const rows = await this.query<IntegrationDeadLetterRow>(
      `UPDATE integration_dead_letters SET
         status = $1,
         ${timestampColumn} = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
         updated_at = now()
       WHERE id = $3::uuid
       RETURNING *`,
      dto.status,
      json({ ...(dto.metadata ?? {}), note: dto.note ?? null, resolvedByUserId: actor.id }),
      existing.id,
    );
    const deadLetter = requiredRow(rows, 'Integration dead letter was not updated');
    await this.writeAudit(actor, 'integration_dead_letter.resolved', 'integration_dead_letter', deadLetter.id, null, {
      status: deadLetter.status,
      note: dto.note ?? null,
    });
    return toDeadLetterResponse(deadLetter);
  }


  private async buildReconciliationBucket(input: {
    resourceType: string;
    externalSystemId: string | null;
    warehouseId: string | null;
    ownerClientId: string | null;
  }): Promise<IntegrationReconciliationResponse['resources'][number]> {
    const resource = RECONCILIATION_RESOURCES[input.resourceType];
    const mappedRows = await this.query<{ count: number | string | bigint }>(
      `SELECT count(*) AS count
       FROM external_id_mappings
       WHERE resource_type = $1
         AND ($2::uuid IS NULL OR external_system_id = $2::uuid)
         AND ($3::uuid IS NULL OR warehouse_id = $3::uuid)
         AND ($4::uuid IS NULL OR owner_client_id = $4::uuid)`,
      input.resourceType,
      input.externalSystemId,
      input.warehouseId,
      input.ownerClientId,
    );

    if (!resource) {
      return {
        resourceType: input.resourceType,
        mappedCount: toNumber(mappedRows[0]?.count ?? 0),
        orphanMappingCount: 0,
        missingMappingCount: 0,
      };
    }

    const orphanRows = await this.query<{ count: number | string | bigint }>(
      `SELECT count(*) AS count
       FROM external_id_mappings m
       WHERE m.resource_type = $1
         AND ($2::uuid IS NULL OR m.external_system_id = $2::uuid)
         AND ($3::uuid IS NULL OR m.warehouse_id = $3::uuid)
         AND ($4::uuid IS NULL OR m.owner_client_id = $4::uuid)
         AND NOT EXISTS (SELECT 1 FROM ${resource.tableName} r WHERE r.id::text = m.resource_id)`,
      input.resourceType,
      input.externalSystemId,
      input.warehouseId,
      input.ownerClientId,
    );
    const missingRows = await this.query<{ count: number | string | bigint }>(
      `SELECT count(*) AS count
       FROM ${resource.tableName} r
       WHERE ($1::uuid IS NULL OR r.${resource.warehouseColumn} = $1::uuid)
         AND ($2::uuid IS NULL OR r.${resource.ownerClientColumn} = $2::uuid)
         AND NOT EXISTS (
           SELECT 1 FROM external_id_mappings m
           WHERE m.resource_type = $3
             AND m.resource_id = r.id::text
             AND ($4::uuid IS NULL OR m.external_system_id = $4::uuid)
         )`,
      input.warehouseId,
      input.ownerClientId,
      input.resourceType,
      input.externalSystemId,
    );

    return {
      resourceType: input.resourceType,
      mappedCount: toNumber(mappedRows[0]?.count ?? 0),
      orphanMappingCount: toNumber(orphanRows[0]?.count ?? 0),
      missingMappingCount: toNumber(missingRows[0]?.count ?? 0),
    };
  }

  private async findDeadLetter(reference: string): Promise<IntegrationDeadLetterRow> {
    const rows = await this.query<IntegrationDeadLetterRow>(
      `SELECT * FROM integration_dead_letters WHERE id::text = $1 OR fingerprint = $1 LIMIT 1`,
      reference,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Integration dead letter was not found');
    return row;
  }

  private async resolveExternalSystem(reference: string): Promise<ExternalSystemRow> {
    const rows = await this.query<ExternalSystemRow>(
      `SELECT * FROM external_systems WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeExternalSystemCode(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('External system was not found');
    return row;
  }

  private async resolveWarehouse(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM warehouses WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeExternalSystemCode(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Warehouse was not found');
    return row;
  }

  private async resolveClient(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM wms_clients WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeExternalSystemCode(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Client was not found');
    return row;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    action: string,
    resourceType: string,
    resourceId: string,
    warehouseId: string | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.execute(
      `INSERT INTO audit_logs (actor_user_id, warehouse_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::jsonb)`,
      actor.id,
      warehouseId,
      action,
      resourceType,
      resourceId,
      json(metadata),
    );
  }

  private query<T>(query: string, ...values: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(query, ...values);
  }

  private execute(query: string, ...values: unknown[]): Promise<number> {
    return this.prisma.$executeRawUnsafe(query, ...values);
  }
}

function requiredRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new ConflictException(message);
  return row;
}

function toExternalSystemResponse(row: ExternalSystemRow): ExternalSystemResponse {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    systemType: row.system_type,
    status: row.status as ExternalSystemStatus,
    ownerClientId: row.owner_client_id,
    config: row.config,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toExternalIdMappingResponse(row: ExternalIdMappingRow): ExternalIdMappingResponse {
  return {
    id: row.id,
    externalSystemId: row.external_system_id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    externalId: row.external_id,
    externalType: row.external_type,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


function toDashboardBucket(row: DeadLetterDashboardRow) {
  return {
    key: row.key,
    count: toNumber(row.count),
    openCount: toNumber(row.open_count),
    totalAttempts: toNumber(row.total_attempts),
    lastSeenAt: row.last_seen_at,
  };
}

function toNumber(value: number | string | bigint): number {
  return Number(value);
}

const RECONCILIATION_RESOURCES: Record<string, { tableName: string; warehouseColumn: string; ownerClientColumn: string }> = {
  OUTBOUND_ORDER: { tableName: 'outbound_orders', warehouseColumn: 'warehouse_id', ownerClientColumn: 'owner_client_id' },
  WAREHOUSE_TASK: { tableName: 'warehouse_tasks', warehouseColumn: 'warehouse_id', ownerClientColumn: 'owner_client_id' },
  SHIPMENT: { tableName: 'shipments', warehouseColumn: 'warehouse_id', ownerClientColumn: 'owner_client_id' },
  STOCK_QUANT: { tableName: 'stock_quants', warehouseColumn: 'warehouse_id', ownerClientColumn: 'owner_client_id' },
};

function emptyEndpointOps(): EndpointOpsRow {
  return { total: 0, active: 0, error: 0, inactive: 0 };
}

function toObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toDeadLetterResponse(row: IntegrationDeadLetterRow): IntegrationDeadLetterResponse {
  return {
    id: row.id,
    endpointId: row.endpoint_id,
    outboxEventId: row.outbox_event_id,
    inboxEventId: row.inbox_event_id,
    eventType: row.event_type,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    status: row.status as IntegrationDeadLetterStatus,
    errorMessage: row.error_message,
    attempts: row.attempts,
    nextRetryAt: row.next_retry_at,
    payload: row.payload,
    metadata: row.metadata,
    fingerprint: row.fingerprint,
    resolvedAt: row.resolved_at,
    replayedAt: row.replayed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function nullable(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

interface IdCodeRow {
  id: string;
  code: string;
}

interface TimestampedRow {
  id: string;
  created_at: Date;
  updated_at: Date;
}

interface ExternalSystemRow extends TimestampedRow {
  code: string;
  name: string;
  system_type: string;
  status: string;
  owner_client_id: string | null;
  config: unknown;
}

interface ExternalIdMappingRow extends TimestampedRow {
  external_system_id: string;
  warehouse_id: string | null;
  owner_client_id: string | null;
  resource_type: string;
  resource_id: string;
  external_id: string;
  external_type: string | null;
  metadata: unknown;
}


interface EndpointOpsRow {
  total: number | string | bigint;
  active: number | string | bigint;
  error: number | string | bigint;
  inactive: number | string | bigint;
}

interface SystemOpsRow {
  total: number | string | bigint;
  active: number | string | bigint;
}

interface OutboxOpsRow {
  status: string;
  count: number | string | bigint;
  total_attempts: number | string | bigint;
}

interface DeadLetterOpsRow {
  open: number | string | bigint;
  retrying: number | string | bigint;
  resolved: number | string | bigint;
  ignored: number | string | bigint;
}

interface DispatchOpsRow {
  total: number | string | bigint;
  failures: number | string | bigint;
}

interface DeadLetterDashboardRow {
  key: string;
  count: number | string | bigint;
  open_count: number | string | bigint;
  total_attempts: number | string | bigint;
  last_seen_at: Date | null;
}

interface IntegrationDeadLetterRow extends TimestampedRow {
  endpoint_id: string | null;
  outbox_event_id: string | null;
  inbox_event_id: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  status: string;
  error_message: string;
  attempts: number;
  next_retry_at: Date | null;
  payload: unknown;
  metadata: unknown;
  fingerprint: string;
  resolved_at: Date | null;
  replayed_at: Date | null;
}
