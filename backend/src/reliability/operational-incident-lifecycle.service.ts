import { BadRequestException, Injectable } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database';
import {
  OperationalIncident,
  OperationalIncidentLifecycleStatus,
  OperationalIncidentState,
} from './reliability.types';

interface IncidentStateRow {
  incident_key: string;
  status: OperationalIncidentLifecycleStatus;
  note: string | null;
  acknowledged_by_user_id: string | null;
  acknowledged_by_display_name: string | null;
  acknowledged_at: Date | string | null;
  resolved_by_user_id: string | null;
  resolved_by_display_name: string | null;
  resolved_at: Date | string | null;
  updated_at: Date | string;
}

@Injectable()
export class OperationalIncidentLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async enrichIncidents(incidents: OperationalIncident[]): Promise<OperationalIncident[]> {
    if (incidents.length === 0) {
      return incidents;
    }

    let stateByKey: Map<string, OperationalIncidentState>;
    try {
      stateByKey = await this.findStates(incidents.map((incident) => incident.key));
    } catch {
      stateByKey = new Map();
    }
    return incidents.map((incident) => ({
      ...incident,
      state: stateByKey.get(incident.key) ?? this.defaultState(incident.key),
    }));
  }

  async acknowledgeIncident(
    incidentKey: string,
    note: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<OperationalIncidentState> {
    const normalizedKey = normalizeIncidentKey(incidentKey);
    const normalizedNote = normalizeNote(note);
    const rows = await this.prisma.$queryRawUnsafe<IncidentStateRow[]>(
      `
        INSERT INTO operational_incident_states
          (incident_key, status, note, acknowledged_by_user_id, acknowledged_at, updated_at)
        VALUES ($1, 'ACKNOWLEDGED', $2, $3::uuid, NOW(), NOW())
        ON CONFLICT (incident_key) DO UPDATE SET
          status = 'ACKNOWLEDGED',
          note = EXCLUDED.note,
          acknowledged_by_user_id = EXCLUDED.acknowledged_by_user_id,
          acknowledged_at = EXCLUDED.acknowledged_at,
          updated_at = NOW()
        RETURNING
          incident_key,
          status,
          note,
          acknowledged_by_user_id,
          (SELECT display_name FROM users WHERE id = acknowledged_by_user_id) AS acknowledged_by_display_name,
          acknowledged_at,
          resolved_by_user_id,
          (SELECT display_name FROM users WHERE id = resolved_by_user_id) AS resolved_by_display_name,
          resolved_at,
          updated_at
      `,
      normalizedKey,
      normalizedNote,
      actor.id,
    );
    await this.audit.writeAction({
      actorUserId: actor.id,
      action: 'reliability.incident_acknowledged',
      resourceType: 'operational_incident',
      resourceId: normalizedKey,
      metadata: { note: normalizedNote },
    });
    return toState(rows[0]);
  }

  async resolveIncident(
    incidentKey: string,
    note: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<OperationalIncidentState> {
    const normalizedKey = normalizeIncidentKey(incidentKey);
    const normalizedNote = normalizeNote(note);
    const rows = await this.prisma.$queryRawUnsafe<IncidentStateRow[]>(
      `
        INSERT INTO operational_incident_states
          (incident_key, status, note, resolved_by_user_id, resolved_at, updated_at)
        VALUES ($1, 'RESOLVED', $2, $3::uuid, NOW(), NOW())
        ON CONFLICT (incident_key) DO UPDATE SET
          status = 'RESOLVED',
          note = EXCLUDED.note,
          resolved_by_user_id = EXCLUDED.resolved_by_user_id,
          resolved_at = EXCLUDED.resolved_at,
          updated_at = NOW()
        RETURNING
          incident_key,
          status,
          note,
          acknowledged_by_user_id,
          (SELECT display_name FROM users WHERE id = acknowledged_by_user_id) AS acknowledged_by_display_name,
          acknowledged_at,
          resolved_by_user_id,
          (SELECT display_name FROM users WHERE id = resolved_by_user_id) AS resolved_by_display_name,
          resolved_at,
          updated_at
      `,
      normalizedKey,
      normalizedNote,
      actor.id,
    );
    await this.audit.writeAction({
      actorUserId: actor.id,
      action: 'reliability.incident_resolved',
      resourceType: 'operational_incident',
      resourceId: normalizedKey,
      metadata: { note: normalizedNote },
    });
    return toState(rows[0]);
  }

  private async findStates(keys: string[]): Promise<Map<string, OperationalIncidentState>> {
    const rows = await this.prisma.$queryRawUnsafe<IncidentStateRow[]>(
      `
        SELECT
          state.incident_key,
          state.status,
          state.note,
          state.acknowledged_by_user_id,
          ack.display_name AS acknowledged_by_display_name,
          state.acknowledged_at,
          state.resolved_by_user_id,
          resolved.display_name AS resolved_by_display_name,
          state.resolved_at,
          state.updated_at
        FROM operational_incident_states state
        LEFT JOIN users ack ON ack.id = state.acknowledged_by_user_id
        LEFT JOIN users resolved ON resolved.id = state.resolved_by_user_id
        WHERE state.incident_key = ANY($1::text[])
      `,
      keys,
    );

    return new Map(rows.map((row) => [row.incident_key, toState(row)]));
  }

  private defaultState(incidentKey: string): OperationalIncidentState {
    return {
      incidentKey,
      status: 'OPEN',
      note: null,
      acknowledgedByUserId: null,
      acknowledgedByDisplayName: null,
      acknowledgedAt: null,
      resolvedByUserId: null,
      resolvedByDisplayName: null,
      resolvedAt: null,
      updatedAt: new Date().toISOString(),
    };
  }
}

function normalizeIncidentKey(value: string): string {
  const normalized = value.trim();
  if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(normalized)) {
    throw new BadRequestException('Invalid incident key');
  }
  return normalized;
}

function normalizeNote(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 1000) : null;
}

function toState(row: IncidentStateRow | undefined): OperationalIncidentState {
  if (!row) {
    throw new BadRequestException('Incident state could not be written');
  }

  return {
    incidentKey: row.incident_key,
    status: row.status,
    note: row.note,
    acknowledgedByUserId: row.acknowledged_by_user_id,
    acknowledgedByDisplayName: row.acknowledged_by_display_name,
    acknowledgedAt: toIsoString(row.acknowledged_at),
    resolvedByUserId: row.resolved_by_user_id,
    resolvedByDisplayName: row.resolved_by_display_name,
    resolvedAt: toIsoString(row.resolved_at),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
