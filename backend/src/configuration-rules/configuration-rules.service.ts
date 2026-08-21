import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { SimulateConfigurationRuleDto } from './dto/simulate-configuration-rule.dto';
import { UpdateConfigurationRuleDto } from './dto/update-configuration-rule.dto';
import { UpsertConfigurationRuleDto } from './dto/upsert-configuration-rule.dto';
import {
  WmsConfigurationEffectiveResponse,
  WmsConfigurationRuleResponse,
  WmsConfigurationRuleStatus,
  WmsConfigurationRuleTemplate,
  WmsConfigurationRuleType,
  WmsConfigurationSimulationResponse,
} from './configuration-rules.types';

@Injectable()
export class ConfigurationRulesService {
  private schemaReady?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  async listRules(input: {
    warehouseReference: string;
    ruleType?: string;
    status?: string;
    ownerClientReference?: string;
  }): Promise<WmsConfigurationRuleResponse[]> {
    await this.ensureSchema();
    const warehouse = await this.resolveWarehouse(input.warehouseReference);
    const ownerClient = input.ownerClientReference
      ? await this.resolveClient(input.ownerClientReference)
      : null;
    const rows = await this.query<ConfigurationRuleRow>(
      `SELECT * FROM warehouse_configuration_rules
       WHERE warehouse_id = $1::uuid
         AND ($2::text IS NULL OR rule_type = $2)
         AND ($3::text IS NULL OR status = $3)
         AND ($4::uuid IS NULL OR owner_client_id = $4::uuid)
       ORDER BY rule_type ASC, priority DESC, code ASC`,
      warehouse.id,
      input.ruleType ? normalizeCode(input.ruleType) : null,
      input.status ? normalizeCode(input.status) : null,
      ownerClient?.id ?? null,
    );

    return rows.map(toRuleResponse);
  }

  async upsertRule(
    warehouseReference: string,
    dto: UpsertConfigurationRuleDto,
    actor: AuthenticatedUser,
  ): Promise<WmsConfigurationRuleResponse> {
    await this.ensureSchema();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const ownerClient = dto.ownerClientReference
      ? await this.resolveClient(dto.ownerClientReference)
      : null;
    const ruleType = normalizeCode(dto.ruleType) as WmsConfigurationRuleType;
    const code = normalizeCode(dto.code);

    const rows = await this.query<ConfigurationRuleRow>(
      `INSERT INTO warehouse_configuration_rules
        (warehouse_id, owner_client_id, rule_type, code, name, status, priority, conditions, actions, metadata, created_by_user_id, updated_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::uuid, $11::uuid)
       ON CONFLICT (warehouse_id, rule_type, code) DO UPDATE SET
         owner_client_id = EXCLUDED.owner_client_id,
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         priority = EXCLUDED.priority,
         conditions = EXCLUDED.conditions,
         actions = EXCLUDED.actions,
         metadata = EXCLUDED.metadata,
         updated_by_user_id = EXCLUDED.updated_by_user_id,
         updated_at = now()
       RETURNING *`,
      warehouse.id,
      ownerClient?.id ?? null,
      ruleType,
      code,
      dto.name.trim(),
      dto.status ?? WmsConfigurationRuleStatus.DRAFT,
      dto.priority ?? 100,
      json(dto.conditions ?? {}),
      json(dto.actions ?? {}),
      json(dto.metadata ?? {}),
      actor.id,
    );
    const rule = requiredRow(rows, 'Configuration rule was not saved');
    await this.writeAudit(actor, warehouse.id, 'configuration_rule.upserted', rule.id, {
      ruleType,
      code,
      status: rule.status,
    });

    return toRuleResponse(rule);
  }

  async updateRule(
    warehouseReference: string,
    ruleReference: string,
    dto: UpdateConfigurationRuleDto,
    actor: AuthenticatedUser,
  ): Promise<WmsConfigurationRuleResponse> {
    await this.ensureSchema();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existing = await this.resolveRule(warehouse.id, ruleReference);
    const mergedMetadata =
      dto.metadata === undefined ? existing.metadata ?? {} : { ...toRecord(existing.metadata), ...dto.metadata };

    const rows = await this.query<ConfigurationRuleRow>(
      `UPDATE warehouse_configuration_rules SET
         name = COALESCE($3::text, name),
         status = COALESCE($4::text, status),
         priority = COALESCE($5::integer, priority),
         conditions = COALESCE($6::jsonb, conditions),
         actions = COALESCE($7::jsonb, actions),
         metadata = COALESCE($8::jsonb, metadata),
         updated_by_user_id = $9::uuid,
         updated_at = now()
       WHERE warehouse_id = $1::uuid AND id = $2::uuid
       RETURNING *`,
      warehouse.id,
      existing.id,
      optionalText(dto.name?.trim()),
      dto.status ?? null,
      dto.priority ?? null,
      dto.conditions === undefined ? null : json(dto.conditions),
      dto.actions === undefined ? null : json(dto.actions),
      dto.metadata === undefined ? null : json(mergedMetadata),
      actor.id,
    );
    const rule = requiredRow(rows, 'Configuration rule was not updated');
    await this.writeAudit(actor, warehouse.id, 'configuration_rule.updated', rule.id, {
      code: rule.code,
      ruleType: rule.rule_type,
      status: rule.status,
    });

    return toRuleResponse(rule);
  }

  async getEffectiveRules(input: {
    warehouseReference: string;
    ruleType?: string;
    ownerClientReference?: string;
  }): Promise<WmsConfigurationEffectiveResponse> {
    await this.ensureSchema();
    const warehouse = await this.resolveWarehouse(input.warehouseReference);
    const ownerClient = input.ownerClientReference
      ? await this.resolveClient(input.ownerClientReference)
      : null;
    const rows = await this.query<ConfigurationRuleRow>(
      `SELECT * FROM warehouse_configuration_rules
       WHERE warehouse_id = $1::uuid
         AND status = 'ACTIVE'
         AND ($2::text IS NULL OR rule_type = $2)
         AND (owner_client_id IS NULL OR owner_client_id = $3::uuid)
       ORDER BY rule_type ASC,
                CASE WHEN owner_client_id IS NULL THEN 0 ELSE 1 END DESC,
                priority DESC,
                updated_at DESC`,
      warehouse.id,
      input.ruleType ? normalizeCode(input.ruleType) : null,
      ownerClient?.id ?? null,
    );

    return {
      warehouseId: warehouse.id,
      ownerClientId: ownerClient?.id ?? null,
      ruleType: input.ruleType ? normalizeCode(input.ruleType) : undefined,
      generatedAt: new Date(),
      rules: rows.map(toRuleResponse),
      defaults: getDefaultRuleTemplates().filter((template) =>
        input.ruleType ? template.ruleType === normalizeCode(input.ruleType) : true,
      ),
    };
  }

  async simulateRule(
    warehouseReference: string,
    dto: SimulateConfigurationRuleDto,
  ): Promise<WmsConfigurationSimulationResponse> {
    const effective = await this.getEffectiveRules({
      warehouseReference,
      ruleType: dto.ruleType,
      ownerClientReference: dto.ownerClientReference,
    });
    const evaluated = effective.rules.map((rule) => {
      const result = evaluateConditions(toRecord(rule.conditions), dto.context);
      return {
        ruleId: rule.id,
        code: rule.code,
        name: rule.name,
        priority: rule.priority,
        matched: result.matched,
        reasons: result.reasons,
      };
    });
    const matched = evaluated.find((candidate) => candidate.matched) ?? null;
    const matchedRule = matched
      ? effective.rules.find((rule) => rule.id === matched.ruleId) ?? null
      : null;

    return {
      warehouseId: effective.warehouseId,
      ruleType: dto.ruleType,
      context: dto.context,
      matchedRule,
      matched: Boolean(matchedRule),
      decision: matchedRule?.actions ?? null,
      evaluated,
    };
  }

  async getTemplates(): Promise<WmsConfigurationRuleTemplate[]> {
    return getDefaultRuleTemplates();
  }

  private async resolveRule(warehouseId: string, reference: string): Promise<ConfigurationRuleRow> {
    const rows = await this.query<ConfigurationRuleRow>(
      `SELECT * FROM warehouse_configuration_rules
       WHERE warehouse_id = $1::uuid AND (id::text = $2 OR code = $3)
       LIMIT 1`,
      warehouseId,
      reference,
      normalizeCode(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Configuration rule was not found');
    return row;
  }

  private async resolveWarehouse(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM warehouses WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeCode(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Warehouse was not found');
    return row;
  }

  private async resolveClient(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM wms_clients WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeCode(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Client was not found');
    return row;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.execute(
      `INSERT INTO audit_logs (actor_user_id, warehouse_id, action, resource_type, resource_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3, 'warehouse_configuration_rule', $4, $5::jsonb)`,
      actor.id,
      warehouseId,
      action,
      resourceId,
      json(metadata),
    );
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= this.createSchema();
    return this.schemaReady;
  }

  private async createSchema(): Promise<void> {
    await this.execute(`CREATE TABLE IF NOT EXISTS warehouse_configuration_rules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      owner_client_id uuid NULL,
      rule_type text NOT NULL,
      code text NOT NULL,
      name text NOT NULL,
      status text NOT NULL DEFAULT 'DRAFT',
      priority integer NOT NULL DEFAULT 100,
      conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
      actions jsonb NOT NULL DEFAULT '{}'::jsonb,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id uuid NULL,
      updated_by_user_id uuid NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT warehouse_configuration_rules_status_check CHECK (status IN ('ACTIVE','DRAFT','PAUSED','ARCHIVED'))
    )`);
    await this.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS warehouse_configuration_rules_unique_code
       ON warehouse_configuration_rules (warehouse_id, rule_type, code)`,
    );
    await this.execute(
      `CREATE INDEX IF NOT EXISTS warehouse_configuration_rules_lookup_idx
       ON warehouse_configuration_rules (warehouse_id, rule_type, status, priority DESC)`,
    );
    await this.execute(
      `CREATE INDEX IF NOT EXISTS warehouse_configuration_rules_owner_idx
       ON warehouse_configuration_rules (owner_client_id, status)`,
    );
  }

  private query<T>(query: string, ...values: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(query, ...values);
  }

  private execute(query: string, ...values: unknown[]): Promise<number> {
    return this.prisma.$executeRawUnsafe(query, ...values);
  }
}

function evaluateConditions(
  conditions: Record<string, unknown>,
  context: Record<string, unknown>,
): { matched: boolean; reasons: string[] } {
  const match = toRecord(conditions['match']);
  const required = Object.entries(match);

  if (required.length === 0) {
    return { matched: true, reasons: ['No explicit match conditions; default rule applies.'] };
  }

  const reasons: string[] = [];
  for (const [path, expected] of required) {
    const actual = readPath(context, path);
    const ok = Array.isArray(expected)
      ? expected.map(String).includes(String(actual))
      : typeof expected === 'object' && expected !== null
        ? evaluateRange(expected as Record<string, unknown>, actual)
        : String(actual) === String(expected);
    reasons.push(`${path}: ${ok ? 'match' : `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
    if (!ok) return { matched: false, reasons };
  }

  return { matched: true, reasons };
}

function evaluateRange(expected: Record<string, unknown>, actual: unknown): boolean {
  const value = Number(actual);
  if (!Number.isFinite(value)) return false;
  const min = expected['min'] === undefined ? undefined : Number(expected['min']);
  const max = expected['max'] === undefined ? undefined : Number(expected['max']);
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

function readPath(context: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, context);
}

function getDefaultRuleTemplates(): WmsConfigurationRuleTemplate[] {
  return [
    {
      ruleType: WmsConfigurationRuleType.PICKING_STRATEGY,
      code: 'ZONE_FIRST_PRIORITY',
      name: 'Zone first, then priority and pick path',
      priority: 100,
      conditions: { match: { workflow: 'PICK' } },
      actions: { strategy: 'ZONE_FIRST', sortBy: ['priority', 'zone', 'pickSequence'], allowBatchPick: true },
      description: 'Directed picking for RF users: keeps the picker in one zone before moving to the next aisle.',
    },
    {
      ruleType: WmsConfigurationRuleType.PUTAWAY_STRATEGY,
      code: 'ABC_VELOCITY_PUTAWAY',
      name: 'Putaway by velocity and capacity',
      priority: 90,
      conditions: { match: { workflow: 'PUTAWAY' } },
      actions: { strategy: 'VELOCITY_CAPACITY', preferPickFaceForFastSku: true, avoidBlockedBins: true },
      description: 'Fast SKUs are suggested near pick faces; heavy or slow SKUs go to reserve storage.',
    },
    {
      ruleType: WmsConfigurationRuleType.REPLENISHMENT,
      code: 'MIN_MAX_REPLENISH',
      name: 'Min/max replenishment threshold',
      priority: 85,
      conditions: { match: { stockClass: ['A', 'B'] } },
      actions: { trigger: 'BELOW_MIN', roundToCasePack: true, createTaskType: 'REPLENISH' },
      description: 'Creates replenishment tasks when a pick face falls below configured minimum stock.',
    },
    {
      ruleType: WmsConfigurationRuleType.CARRIER_ROUTING,
      code: 'CZ_NEXT_DAY_ROUTING',
      name: 'CZ next-day carrier routing',
      priority: 95,
      conditions: { match: { country: 'CZ', serviceLevel: 'NEXT_DAY' } },
      actions: { carrier: 'CARRIER_A', service: 'EXPRESS_DOMESTIC', fallbackCarrier: 'CARRIER_D' },
      description: 'Routes Czech next-day parcels to the preferred carrier with an explicit fallback.',
    },
    {
      ruleType: WmsConfigurationRuleType.SLA,
      code: 'B2C_CUTOFF_1400',
      name: 'B2C same-day cutoff',
      priority: 80,
      conditions: { match: { orderType: 'B2C' } },
      actions: { cutoffLocalTime: '14:00', shipByHours: 8, escalationAfterMinutes: 30 },
      description: 'Defines client-visible order SLA and control tower escalation timing.',
    },
    {
      ruleType: WmsConfigurationRuleType.RF_WORKFLOW,
      code: 'STRICT_SCAN_CONFIRMATION',
      name: 'Strict RF scan confirmation',
      priority: 100,
      conditions: { match: { deviceMode: 'RF' } },
      actions: { requireLocationScan: true, requireSkuScan: true, allowSupervisorOverride: true, offlineQueueTtlMinutes: 480 },
      description: 'Controls scanner flow, offline queue TTL and supervisor exception handling.',
    },
  ];
}

function toRuleResponse(row: ConfigurationRuleRow): WmsConfigurationRuleResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    ruleType: row.rule_type as WmsConfigurationRuleType,
    code: row.code,
    name: row.name,
    status: row.status as WmsConfigurationRuleStatus,
    priority: row.priority,
    conditions: row.conditions,
    actions: row.actions,
    metadata: row.metadata,
    createdByUserId: row.created_by_user_id,
    updatedByUserId: row.updated_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requiredRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new BadRequestException(message);
  return row;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '_');
}

function optionalText(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

interface IdCodeRow {
  id: string;
  code: string;
}

interface ConfigurationRuleRow {
  id: string;
  warehouse_id: string;
  owner_client_id: string | null;
  rule_type: string;
  code: string;
  name: string;
  status: string;
  priority: number;
  conditions: unknown;
  actions: unknown;
  metadata: unknown;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}
