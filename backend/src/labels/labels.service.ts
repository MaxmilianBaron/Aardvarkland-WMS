import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { Prisma } from '../generated/prisma/client';
import { CreateRuntimePrintJobDto } from './dto/create-runtime-print-job.dto';
import { CreateLabelPrintJobDto } from './dto/create-label-print-job.dto';
import { CreateLabelTemplateDto } from './dto/create-label-template.dto';
import { ListLabelPrintJobsQueryDto } from './dto/list-label-print-jobs-query.dto';
import { ClaimPrintJobDto, ReportPrintJobResultDto } from './dto/print-agent-job.dto';
import { RenderLabelPreviewDto } from './dto/render-label-preview.dto';
import { ResolveScanDto } from './dto/resolve-scan.dto';
import { RuntimePrintJobActionDto } from './dto/runtime-print-job-action.dto';
import { UpsertPrintAgentDto } from './dto/upsert-print-agent.dto';
import { UpsertPrinterStationDto } from './dto/upsert-printer-station.dto';
import {
  LabelJobStatus,
  LabelPreviewResponse,
  LabelPrintJobResponse,
  LabelTemplateResponse,
  PrintAgentResponse,
  PrinterStationResponse,
  RuntimePrintJobResponse,
  ScanResolveResponse,
} from './labels.types';
import { Gs1SyntaxService } from './gs1-syntax.service';
import {
  buildPrintAgentRouting,
  normalizePrinterCodes,
  readPrinterCodesFromAgentMetadata,
  withConfiguredPrinterCodes,
} from './print-agent-routing.helpers';
import {
  isPrintAgentAuthLocked,
  PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD,
  PRINT_AGENT_TOKEN_LOCK_SECONDS,
} from './print-agent-auth.helpers';
import { isPrintAgentStatusTransitionAllowed } from './print-job-state.helpers';
import { matchesAardvarkWarehouse, parseScanCode } from './scan-code.helpers';
import { getScanOwnerClientIds } from './scan-access.helpers';
import {
  defaultLabelLayout,
  escapeZplFieldData,
  normalizeLabelLayout,
  renderZpl,
  validateZplDocument,
} from './zpl-renderer.helpers';

type SortOrder = 'asc' | 'desc';
type QueryObject = Record<string, unknown>;
type MutationObject = Record<string, unknown>;
const PRINT_JOB_LEASE_SECONDS = 120;

interface WarehouseRecord {
  id: string;
  code: string;
  name: string;
}

interface ParcelRecord {
  id: string;
  warehouseId: string;
  trackingNumber: string;
  status: string;
  externalReference: string | null;
  customerReference: string | null;
  recipientName: string | null;
  carrier: string | null;
  serviceLevel: string | null;
  weightGrams: number | null;
  metadata: unknown;
}

interface LabelTemplateRecord {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: string;
  content: string;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

interface LabelPrintJobRecord {
  id: string;
  warehouseId: string;
  parcelId: string;
  templateId: string;
  status: string;
  printerName: string | null;
  copies: number;
  requestedByUserId: string | null;
  payload: unknown;
  idempotencyKey: string | null;
  requestHash: string | null;
  errorMessage: string | null;
  printedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface RuntimePrinterStationRow {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  protocol: string;
  host: string | null;
  port: number | null;
  windows_printer_name: string | null;
  dpi: number;
  label_width_mm: number;
  label_height_mm: number;
  status: string;
  default_template_code: string | null;
  metadata: unknown;
  last_seen_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RuntimePrintAgentRow {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  token_hash: string;
  status: string;
  version: string | null;
  hostname: string | null;
  metadata: unknown;
  auth_failed_count: number;
  auth_locked_until: Date | string | null;
  token_last_failed_at: Date | string | null;
  last_seen_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PrintAgentAuthFailureRow {
  auth_failed_count: number;
  auth_locked_until: Date | string | null;
}

interface RuntimePrintJobRow {
  id: string;
  warehouse_id: string;
  printer_code: string | null;
  agent_code: string | null;
  template_code: string | null;
  template_version: number;
  status: string;
  copies: number;
  attempts: number;
  max_attempts: number;
  payload: unknown;
  rendered_zpl: string;
  idempotency_key: string | null;
  request_hash: string | null;
  error_message: string | null;
  requested_by_user_id: string | null;
  claimed_at: Date | string | null;
  claim_expires_at: Date | string | null;
  printed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface RuntimeLabelTemplateVersionRow {
  id: string;
  warehouse_id: string;
  template_code: string;
  version: number;
  layout: unknown;
  zpl: string;
  is_active: boolean;
  created_at: Date | string;
}

interface ResolveRow {
  id: string;
  code: string;
  display_name: string | null;
  metadata: unknown;
}

interface FindFirstDelegate<TRecord> {
  findFirst(args: { where: QueryObject }): Promise<TRecord | null>;
}

interface AuditLogDelegate {
  create(args: { data: MutationObject }): Promise<unknown>;
}

interface LabelTemplateDelegate extends FindFirstDelegate<LabelTemplateRecord> {
  findMany(args: {
    where: QueryObject;
    orderBy: Array<Record<string, SortOrder>>;
  }): Promise<LabelTemplateRecord[]>;
  create(args: { data: MutationObject }): Promise<LabelTemplateRecord>;
}

interface LabelPrintJobDelegate {
  findMany(args: {
    where: QueryObject;
    orderBy: Array<Record<string, SortOrder>>;
  }): Promise<LabelPrintJobRecord[]>;
  findFirst(args: { where: QueryObject }): Promise<LabelPrintJobRecord | null>;
  create(args: { data: MutationObject }): Promise<LabelPrintJobRecord>;
}

interface LabelsPrismaClient {
  warehouse: FindFirstDelegate<WarehouseRecord>;
  parcel: FindFirstDelegate<ParcelRecord>;
  auditLog: AuditLogDelegate;
  labelTemplate: LabelTemplateDelegate;
  labelPrintJob: LabelPrintJobDelegate;
}

interface PrintStationsConsoleResponse {
  stations: PrinterStationResponse[];
  printers: PrinterStationResponse[];
  queue: RuntimePrintJobResponse[];
  agents: PrintAgentResponse[];
  templates: string[];
}

@Injectable()
export class LabelsService {
  private hardwareTablesReady: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gs1Syntax: Gs1SyntaxService,
  ) {}

  async findTemplates(warehouseReference: string): Promise<LabelTemplateResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const templates = await this.db.labelTemplate.findMany({
      where: { warehouseId: warehouse.id },
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });

    return templates.map(toLabelTemplateResponse);
  }

  async createTemplate(
    warehouseReference: string,
    dto: CreateLabelTemplateDto,
    actor: AuthenticatedUser,
  ): Promise<LabelTemplateResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);

    try {
      const template = await this.db.labelTemplate.create({
        data: {
          warehouseId: warehouse.id,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          type: dto.type,
          content: dto.content,
          isActive: dto.isActive ?? true,
          metadata: toJsonInput(dto.metadata),
        },
      });

      await this.writeTemplateAudit(actor, warehouse.id, 'label_template.created', template);

      return toLabelTemplateResponse(template);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Label template code already exists in this warehouse');
      }

      throw error;
    }
  }

  async createPrintJob(
    warehouseReference: string,
    parcelReference: string,
    dto: CreateLabelPrintJobDto,
    actor: AuthenticatedUser,
  ): Promise<LabelPrintJobResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parcel = await this.resolveParcel(warehouse.id, parcelReference);
    const template = await this.resolveTemplate(warehouse.id, dto.templateReference);
    const payload = dto.payload ?? buildDefaultPayload(warehouse, parcel, template);
    const idempotencyKey = normalizeNullableString(dto.idempotencyKey);
    const requestHash = hashRequest({
      action: 'parcel-label-print',
      warehouseId: warehouse.id,
      parcelId: parcel.id,
      templateId: template.id,
      printerName: normalizeNullableString(dto.printerName),
      copies: dto.copies ?? 1,
      payload,
      actorUserId: actor.id,
    });

    if (idempotencyKey) {
      const existing = await this.findLegacyPrintJobByIdempotencyKey(warehouse.id, idempotencyKey);
      if (existing) {
        return this.resolveLegacyPrintJobReplay(existing, requestHash);
      }
    }

    let printJob: LabelPrintJobRecord;
    try {
      printJob = await this.db.labelPrintJob.create({
        data: {
          warehouseId: warehouse.id,
          parcelId: parcel.id,
          templateId: template.id,
          status: LabelJobStatus.QUEUED,
          printerName: normalizeNullableString(dto.printerName),
          copies: dto.copies ?? 1,
          requestedByUserId: actor.id,
          payload: toJsonInput(payload),
          idempotencyKey,
          requestHash: idempotencyKey ? requestHash : null,
        },
      });
    } catch (error: unknown) {
      if (idempotencyKey && hasPrismaCode(error, 'P2002')) {
        const existing = await this.findLegacyPrintJobByIdempotencyKey(warehouse.id, idempotencyKey);
        if (existing) {
          return this.resolveLegacyPrintJobReplay(existing, requestHash);
        }
      }
      throw error;
    }

    await this.writePrintJobAudit(actor, warehouse.id, 'label_print_job.created', printJob);

    return toLabelPrintJobResponse(printJob);
  }

  async findPrintJobs(
    warehouseReference: string,
    query: ListLabelPrintJobsQueryDto,
  ): Promise<LabelPrintJobResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const printJobs = await this.db.labelPrintJob.findMany({
      where: {
        warehouseId: warehouse.id,
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return printJobs.map(toLabelPrintJobResponse);
  }

  async findPrintStationsConsole(warehouseReference: string): Promise<PrintStationsConsoleResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const [printers, jobs, agents, templates] = await Promise.all([
      this.findPrinters(warehouse.id),
      this.findRuntimePrintJobs(warehouse.id),
      this.findPrintAgents(warehouse.id),
      this.db.labelTemplate.findMany({
        where: { warehouseId: warehouse.id, isActive: true },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      }),
    ]);

    return {
      stations: printers,
      printers,
      queue: jobs,
      agents,
      templates: templates.map((template) => template.code),
    };
  }

  async findPrinters(warehouseReference: string): Promise<PrinterStationResponse[]> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const rows = await this.query<RuntimePrinterStationRow>(
      `SELECT * FROM wms_printer_stations
       WHERE warehouse_id = $1::uuid
       ORDER BY code ASC`,
      warehouse.id,
    );

    return rows.map(toPrinterStationResponse);
  }

  async upsertPrinter(
    warehouseReference: string,
    dto: UpsertPrinterStationDto,
    actor: AuthenticatedUser,
  ): Promise<PrinterStationResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const rows = await this.query<RuntimePrinterStationRow>(
      `INSERT INTO wms_printer_stations
        (warehouse_id, code, name, protocol, host, port, windows_printer_name, dpi, label_width_mm,
         label_height_mm, default_template_code, metadata, updated_at)
       VALUES ($1::uuid, $2, $3, $4, NULLIF($5, ''), $6, NULLIF($7, ''), $8, $9, $10, NULLIF($11, ''), $12::jsonb, now())
       ON CONFLICT (warehouse_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        protocol = EXCLUDED.protocol,
        host = EXCLUDED.host,
        port = EXCLUDED.port,
        windows_printer_name = EXCLUDED.windows_printer_name,
        dpi = EXCLUDED.dpi,
        label_width_mm = EXCLUDED.label_width_mm,
        label_height_mm = EXCLUDED.label_height_mm,
        default_template_code = EXCLUDED.default_template_code,
        metadata = EXCLUDED.metadata,
        updated_at = now()
       RETURNING *`,
      warehouse.id,
      normalizeCode(dto.code),
      dto.name.trim(),
      dto.protocol ?? 'TCP_9100',
      dto.host?.trim() ?? '',
      dto.port ?? 9100,
      dto.windowsPrinterName?.trim() ?? '',
      dto.dpi ?? 203,
      dto.labelWidthMm ?? 100,
      dto.labelHeightMm ?? 150,
      normalizeNullableString(dto.defaultTemplateCode),
      json(dto.metadata ?? {}),
    );
    const printer = required(rows, 'Printer was not stored');
    await this.writeRuntimeAudit(actor, warehouse.id, 'printer_station.upserted', 'printer_station', printer.id, {
      code: printer.code,
      protocol: printer.protocol,
    });

    return toPrinterStationResponse(printer);
  }

  async findPrintAgents(warehouseReference: string): Promise<PrintAgentResponse[]> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const rows = await this.query<RuntimePrintAgentRow>(
      `SELECT * FROM wms_print_agents
       WHERE warehouse_id = $1::uuid
       ORDER BY code ASC`,
      warehouse.id,
    );

    return rows.map(toPrintAgentResponse);
  }

  async upsertPrintAgent(
    warehouseReference: string,
    dto: UpsertPrintAgentDto,
    actor: AuthenticatedUser,
  ): Promise<PrintAgentResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const metadata = withConfiguredPrinterCodes(dto.metadata, dto.printerCodes);
    const rows = await this.query<RuntimePrintAgentRow>(
      `INSERT INTO wms_print_agents
        (warehouse_id, code, name, token_hash, status, version, hostname, metadata, updated_at)
       VALUES ($1::uuid, $2, $3, $4, 'OFFLINE', NULLIF($5, ''), NULLIF($6, ''), $7::jsonb, now())
       ON CONFLICT (warehouse_id, code) DO UPDATE SET
        name = EXCLUDED.name,
        token_hash = EXCLUDED.token_hash,
        version = EXCLUDED.version,
        hostname = EXCLUDED.hostname,
        metadata = EXCLUDED.metadata,
        auth_failed_count = 0,
        auth_locked_until = NULL,
        token_last_failed_at = NULL,
        updated_at = now()
       RETURNING *`,
      warehouse.id,
      normalizeCode(dto.code),
      dto.name.trim(),
      hashToken(dto.token),
      dto.version?.trim() ?? '',
      dto.hostname?.trim() ?? '',
      json(metadata),
    );
    const agent = required(rows, 'Print agent was not stored');
    await this.writeRuntimeAudit(actor, warehouse.id, 'print_agent.upserted', 'print_agent', agent.id, {
      code: agent.code,
      hostname: agent.hostname,
      printerCodes: readPrinterCodesFromAgentMetadata(agent.metadata),
    });

    return toPrintAgentResponse(agent);
  }

  async findRuntimePrintJobs(warehouseReference: string): Promise<RuntimePrintJobResponse[]> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const rows = await this.query<RuntimePrintJobRow>(
      `SELECT * FROM wms_print_jobs
       WHERE warehouse_id = $1::uuid
       ORDER BY created_at DESC
       LIMIT 100`,
      warehouse.id,
    );

    return rows.map(toRuntimePrintJobResponse);
  }

  async createRuntimePrintJob(
    warehouseReference: string,
    dto: CreateRuntimePrintJobDto,
    actor: AuthenticatedUser,
  ): Promise<RuntimePrintJobResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const templateCode = normalizeNullableString(dto.templateCode);
    const printerCode = normalizeNullableString(dto.printerCode);
    const agentCode = normalizeNullableString(dto.agentCode);
    if (printerCode) {
      await this.assertRuntimePrinterExists(warehouse.id, printerCode);
    }
    if (agentCode) {
      await this.assertRuntimeAgentCanServePrinter(warehouse.id, agentCode, printerCode);
    }
    const renderedZpl = await this.resolveRuntimeZpl(warehouse.id, templateCode, dto);
    const idempotencyKey = normalizeNullableString(dto.idempotencyKey);
    const requestHash = hashRequest({
      action: 'runtime-print',
      warehouseId: warehouse.id,
      printerCode,
      agentCode,
      templateCode,
      copies: dto.copies ?? 1,
      maxAttempts: dto.maxAttempts ?? 3,
      payload: dto.payload ?? {},
      renderedZpl,
      actorUserId: actor.id,
    });

    const rows = await this.query<RuntimePrintJobRow>(
      `INSERT INTO wms_print_jobs
        (warehouse_id, printer_code, agent_code, template_code, template_version, status, copies,
         max_attempts, payload, rendered_zpl, requested_by_user_id, idempotency_key, request_hash, updated_at)
       VALUES ($1::uuid, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), 1, 'QUEUED', $5, $6, $7::jsonb, $8, $9::uuid,
               NULLIF($10, ''), NULLIF($11, ''), now())
       ON CONFLICT (warehouse_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      warehouse.id,
      printerCode ?? '',
      agentCode ?? '',
      templateCode ?? '',
      dto.copies ?? 1,
      dto.maxAttempts ?? 3,
      json(dto.payload ?? {}),
      renderedZpl,
      actor.id,
      idempotencyKey ?? '',
      idempotencyKey ? requestHash : '',
    );
    const printJob = rows[0] ?? await this.resolveRuntimePrintJobReplay(
      warehouse.id,
      idempotencyKey,
      requestHash,
    );
    await this.writeRuntimeAudit(actor, warehouse.id, 'runtime_print_job.created', 'runtime_print_job', printJob.id, {
      printerCode: printJob.printer_code,
      templateCode: printJob.template_code,
    });

    return toRuntimePrintJobResponse(printJob);
  }

  async retryRuntimePrintJob(
    warehouseReference: string,
    jobId: string,
    dto: RuntimePrintJobActionDto,
    actor: AuthenticatedUser,
  ): Promise<RuntimePrintJobResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const job = await this.resolveRuntimePrintJobRow(warehouse.id, jobId);
    if (job.status === 'PRINTED') {
      throw new ConflictException('Printed jobs cannot be retried; use reprint instead');
    }

    const nextPrinterCode = normalizeNullableString(dto.printerCode) ?? job.printer_code;
    const nextAgentCode = normalizeNullableString(dto.agentCode) ?? job.agent_code;
    if (nextPrinterCode) {
      await this.assertRuntimePrinterExists(warehouse.id, nextPrinterCode);
    }
    if (nextAgentCode) {
      await this.assertRuntimeAgentCanServePrinter(warehouse.id, nextAgentCode, nextPrinterCode);
    }

    const rows = await this.query<RuntimePrintJobRow>(
      `UPDATE wms_print_jobs
       SET status = 'QUEUED',
           printer_code = NULLIF($3, ''),
           agent_code = NULLIF($4, ''),
           error_message = NULL,
           claimed_at = NULL,
           claim_expires_at = NULL,
           printed_at = NULL,
           updated_at = now()
       WHERE id = $1::uuid AND warehouse_id = $2::uuid
       RETURNING *`,
      job.id,
      warehouse.id,
      nextPrinterCode ?? '',
      nextAgentCode ?? '',
    );
    const updated = required(rows, 'Print job retry was not stored');
    await this.writeRuntimeAudit(actor, warehouse.id, 'runtime_print_job.retry', 'runtime_print_job', updated.id, {
      printerCode: updated.printer_code,
      agentCode: updated.agent_code,
      metadata: dto.metadata ?? {},
    });

    return toRuntimePrintJobResponse(updated);
  }

  async cancelRuntimePrintJob(
    warehouseReference: string,
    jobId: string,
    dto: RuntimePrintJobActionDto,
    actor: AuthenticatedUser,
  ): Promise<RuntimePrintJobResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const job = await this.resolveRuntimePrintJobRow(warehouse.id, jobId);
    if (job.status === 'PRINTED') {
      throw new ConflictException('Printed jobs cannot be cancelled');
    }

    const rows = await this.query<RuntimePrintJobRow>(
      `UPDATE wms_print_jobs
       SET status = 'CANCELLED',
           error_message = NULLIF($3, ''),
           claim_expires_at = NULL,
           updated_at = now()
       WHERE id = $1::uuid AND warehouse_id = $2::uuid
       RETURNING *`,
      job.id,
      warehouse.id,
      readActionReason(dto.metadata) ?? 'Cancelled from print console',
    );
    const updated = required(rows, 'Print job cancellation was not stored');
    await this.writeRuntimeAudit(actor, warehouse.id, 'runtime_print_job.cancelled', 'runtime_print_job', updated.id, {
      printerCode: updated.printer_code,
      agentCode: updated.agent_code,
      metadata: dto.metadata ?? {},
    });

    return toRuntimePrintJobResponse(updated);
  }

  async reassignRuntimePrintJob(
    warehouseReference: string,
    jobId: string,
    dto: RuntimePrintJobActionDto,
    actor: AuthenticatedUser,
  ): Promise<RuntimePrintJobResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const job = await this.resolveRuntimePrintJobRow(warehouse.id, jobId);
    if (job.status === 'PRINTED') {
      throw new ConflictException('Printed jobs cannot be reassigned; use reprint instead');
    }

    const printerCode = normalizeNullableString(dto.printerCode);
    const agentCode = normalizeNullableString(dto.agentCode);
    if (printerCode) {
      await this.assertRuntimePrinterExists(warehouse.id, printerCode);
    }
    if (agentCode) {
      await this.assertRuntimeAgentCanServePrinter(warehouse.id, agentCode, printerCode);
    }

    const rows = await this.query<RuntimePrintJobRow>(
      `UPDATE wms_print_jobs
       SET status = 'QUEUED',
           printer_code = NULLIF($3, ''),
           agent_code = NULLIF($4, ''),
           error_message = NULL,
           claimed_at = NULL,
           claim_expires_at = NULL,
           printed_at = NULL,
           updated_at = now()
       WHERE id = $1::uuid AND warehouse_id = $2::uuid
       RETURNING *`,
      job.id,
      warehouse.id,
      printerCode ?? '',
      agentCode ?? '',
    );
    const updated = required(rows, 'Print job reassignment was not stored');
    await this.writeRuntimeAudit(actor, warehouse.id, 'runtime_print_job.reassigned', 'runtime_print_job', updated.id, {
      fromPrinterCode: job.printer_code,
      toPrinterCode: updated.printer_code,
      fromAgentCode: job.agent_code,
      toAgentCode: updated.agent_code,
      metadata: dto.metadata ?? {},
    });

    return toRuntimePrintJobResponse(updated);
  }

  async reprintRuntimePrintJob(
    warehouseReference: string,
    jobId: string,
    dto: RuntimePrintJobActionDto,
    actor: AuthenticatedUser,
  ): Promise<RuntimePrintJobResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const job = await this.resolveRuntimePrintJobRow(warehouse.id, jobId);
    const printerCode = normalizeNullableString(dto.printerCode) ?? job.printer_code;
    const agentCode = normalizeNullableString(dto.agentCode) ?? job.agent_code;
    if (printerCode) {
      await this.assertRuntimePrinterExists(warehouse.id, printerCode);
    }
    if (agentCode) {
      await this.assertRuntimeAgentCanServePrinter(warehouse.id, agentCode, printerCode);
    }

    const idempotencyKey = normalizeNullableString(dto.idempotencyKey);
    const requestHash = hashRequest({
      action: 'runtime-reprint',
      warehouseId: warehouse.id,
      sourceJobId: job.id,
      printerCode,
      agentCode,
      copies: dto.copies ?? job.copies,
      metadata: dto.metadata ?? {},
      actorUserId: actor.id,
    });
    const rows = await this.query<RuntimePrintJobRow>(
      `INSERT INTO wms_print_jobs
        (warehouse_id, printer_code, agent_code, template_code, template_version, status, copies,
         max_attempts, payload, rendered_zpl, requested_by_user_id, idempotency_key, request_hash, updated_at)
       VALUES ($1::uuid, NULLIF($2, ''), NULLIF($3, ''), NULLIF($4, ''), $5, 'QUEUED', $6,
               $7, $8::jsonb, $9, $10::uuid, NULLIF($11, ''), NULLIF($12, ''), now())
       ON CONFLICT (warehouse_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING *`,
      warehouse.id,
      printerCode ?? '',
      agentCode ?? '',
      job.template_code ?? '',
      job.template_version,
      dto.copies ?? job.copies,
      job.max_attempts,
      json({
        ...toRecord(job.payload),
        reprintOfJobId: job.id,
        reprintMetadata: dto.metadata ?? {},
      }),
      job.rendered_zpl,
      actor.id,
      idempotencyKey ?? '',
      idempotencyKey ? requestHash : '',
    );
    const created = rows[0] ?? await this.resolveRuntimePrintJobReplay(
      warehouse.id,
      idempotencyKey,
      requestHash,
    );
    await this.writeRuntimeAudit(actor, warehouse.id, 'runtime_print_job.reprint_created', 'runtime_print_job', created.id, {
      sourceJobId: job.id,
      printerCode: created.printer_code,
      agentCode: created.agent_code,
      metadata: dto.metadata ?? {},
    });

    return toRuntimePrintJobResponse(created);
  }

  async claimPrintJobs(
    warehouseReference: string,
    dto: ClaimPrintJobDto,
  ): Promise<{ jobs: RuntimePrintJobResponse[] }> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const agent = await this.validateAgentToken(warehouse.id, dto.agentCode, dto.token);
    const configuredPrinterCodes = readPrinterCodesFromAgentMetadata(agent.metadata);
    const reportedPrinterCodes = normalizePrinterCodes(dto.printerCodes);
    const routing = buildPrintAgentRouting(configuredPrinterCodes, reportedPrinterCodes, dto.acceptUnassignedJobs);
    await this.heartbeatAgent(warehouse.id, agent.code, dto.version, dto.hostname, reportedPrinterCodes);
    const limit = dto.limit ?? 1;

    const jobs = routing.legacyWarehouseClaim
      ? await this.query<RuntimePrintJobRow>(
          `SELECT * FROM wms_print_jobs
           WHERE warehouse_id = $1::uuid
            AND (
              (status = 'QUEUED' AND (agent_code IS NULL OR agent_code = $2))
              OR (status = 'CLAIMED' AND (claim_expires_at IS NULL OR claim_expires_at < now()))
            )
            AND attempts < max_attempts
           ORDER BY created_at ASC
           LIMIT $3`,
          warehouse.id,
          agent.code,
          limit,
        )
      : await this.query<RuntimePrintJobRow>(
          `SELECT * FROM wms_print_jobs
           WHERE warehouse_id = $1::uuid
            AND attempts < max_attempts
            AND (
              (status = 'QUEUED' AND agent_code = $2)
              OR (
                status = 'QUEUED'
                AND agent_code IS NULL
                AND (
                  printer_code = ANY($4::text[])
                  OR ($5::boolean AND printer_code IS NULL)
                )
              )
              OR (
                status = 'CLAIMED'
                AND (claim_expires_at IS NULL OR claim_expires_at < now())
                AND (
                  printer_code = ANY($4::text[])
                  OR ($5::boolean AND printer_code IS NULL)
                )
              )
              OR (
                status = 'CLAIMED'
                AND (claim_expires_at IS NULL OR claim_expires_at < now())
                AND agent_code = $2
              )
            )
           ORDER BY created_at ASC
           LIMIT $3`,
          warehouse.id,
          agent.code,
          limit,
          routing.printerCodes,
          routing.acceptUnassignedJobs,
        );

    const claimed: RuntimePrintJobRow[] = [];
    for (const job of jobs) {
      const rows = await this.query<RuntimePrintJobRow>(
        `UPDATE wms_print_jobs
         SET status = 'CLAIMED',
             agent_code = $3,
             attempts = attempts + 1,
             claimed_at = now(),
             claim_expires_at = now() + ($4::text || ' seconds')::interval,
             updated_at = now()
         WHERE id = $1::uuid
          AND warehouse_id = $2::uuid
          AND attempts < max_attempts
          AND (
            (status = 'QUEUED' AND (agent_code IS NULL OR agent_code = $3))
            OR (status = 'CLAIMED' AND (claim_expires_at IS NULL OR claim_expires_at < now()))
          )
         RETURNING *`,
        job.id,
        warehouse.id,
        agent.code,
        PRINT_JOB_LEASE_SECONDS,
      );
      if (rows[0]) {
        claimed.push(rows[0]);
      }
    }

    return { jobs: claimed.map(toRuntimePrintJobResponse) };
  }

  async reportPrintJobResult(
    warehouseReference: string,
    jobId: string,
    dto: ReportPrintJobResultDto,
  ): Promise<RuntimePrintJobResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const agent = await this.validateAgentToken(warehouse.id, dto.agentCode, dto.token);
    await this.heartbeatAgent(warehouse.id, agent.code);

    const current = await this.query<RuntimePrintJobRow>(
      `SELECT * FROM wms_print_jobs WHERE id = $1::uuid AND warehouse_id = $2::uuid LIMIT 1`,
      jobId,
      warehouse.id,
    );
    const job = required(current, 'Print job was not found');
    if (job.agent_code !== agent.code) {
      throw new ForbiddenException('Print job is claimed by another agent');
    }
    if (!isPrintAgentStatusTransitionAllowed(job.status, dto.status)) {
      throw new ConflictException(`Print job cannot transition from ${job.status} to ${dto.status}`);
    }
    if (job.status === dto.status && ['PRINTED', 'FAILED', 'CANCELLED'].includes(job.status)) {
      return toRuntimePrintJobResponse(job);
    }

    const rows = await this.query<RuntimePrintJobRow>(
      `UPDATE wms_print_jobs
       SET status = $3,
           error_message = CASE WHEN $3 = 'PRINTED' THEN NULL ELSE NULLIF($4, '') END,
           claim_expires_at = CASE WHEN $3 = 'PRINTING' THEN now() + ($5::text || ' seconds')::interval ELSE NULL END,
           printed_at = CASE WHEN $3 = 'PRINTED' THEN now() ELSE printed_at END,
           updated_at = now()
       WHERE id = $1::uuid AND warehouse_id = $2::uuid AND status = $6 AND agent_code = $7
       RETURNING *`,
      jobId,
      warehouse.id,
      dto.status,
      dto.errorMessage?.trim() ?? '',
      PRINT_JOB_LEASE_SECONDS,
      job.status,
      agent.code,
    );

    if (!rows[0]) {
      const latest = await this.resolveRuntimePrintJobRow(warehouse.id, jobId);
      if (latest.agent_code === agent.code && latest.status === dto.status) {
        return toRuntimePrintJobResponse(latest);
      }
      throw new ConflictException('Print job changed while the result was being reported');
    }

    return toRuntimePrintJobResponse(rows[0]);
  }

  async renderPreview(
    warehouseReference: string,
    templateReference: string,
    dto: RenderLabelPreviewDto,
  ): Promise<LabelPreviewResponse> {
    await this.ensureHardwareTables();
    await this.resolveWarehouse(warehouseReference);
    const layout = normalizeLabelLayout(dto.layout);
    const payload = {
      title: templateReference,
      subtitle: '',
      code: '',
      ...(dto.payload ?? {}),
    };
    const result = renderZpl(layout, payload);

    return {
      zpl: result.zpl,
      warnings: result.warnings,
    };
  }

  async resolveScan(
    warehouseReference: string,
    dto: ResolveScanDto,
    actor: AuthenticatedUser,
  ): Promise<ScanResolveResponse> {
    await this.ensureHardwareTables();
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const parsed = parseScanCode(dto.scannedValue, this.gs1Syntax);
    if (parsed.kind === 'AARD1' && !matchesAardvarkWarehouse(parsed, warehouse.code)) {
      const resolved = emptyScanResolution();
      await this.writeScanAudit(actor, warehouse.id, parsed, resolved, dto);
      throw new BadRequestException('Scanned code belongs to a different warehouse.');
    }
    const resolved = await this.resolveParsedScan(warehouse, parsed, actor);
    await this.writeScanAudit(actor, warehouse.id, parsed, resolved, dto);

    return { parsed, resolved };
  }

  private get db(): LabelsPrismaClient {
    return this.prisma;
  }

  private async resolveRuntimeZpl(
    warehouseId: string,
    templateCode: string | null,
    dto: CreateRuntimePrintJobDto,
  ): Promise<string> {
    if (dto.renderedZpl?.trim()) {
      return ensureQueueableZpl(dto.renderedZpl.trim());
    }

    const payload = dto.payload ?? {};
    const layout = dto.layout
      ? normalizeLabelLayout(dto.layout)
      : await this.findStoredLayout(warehouseId, templateCode);
    if (layout) {
      const result = renderZpl(layout, payload);
      return ensureQueueableZpl(result.zpl, result.warnings);
    }

    if (templateCode) {
      const template = await this.resolveTemplate(warehouseId, templateCode);
      if (template.content.trim().startsWith('^XA')) {
        return ensureQueueableZpl(renderContentTemplate(template.content, payload));
      }
    }

    const result = renderZpl(defaultLabelLayout(), payload);
    return ensureQueueableZpl(result.zpl, result.warnings);
  }

  private async findStoredLayout(warehouseId: string, templateCode: string | null) {
    if (!templateCode) {
      return null;
    }
    const rows = await this.query<RuntimeLabelTemplateVersionRow>(
      `SELECT * FROM wms_label_template_versions
       WHERE warehouse_id = $1::uuid AND template_code = $2 AND is_active = true
       ORDER BY version DESC LIMIT 1`,
      warehouseId,
      templateCode,
    );
    const row = rows[0];
    if (!row) {
      return null;
    }

    return normalizeLabelLayout(row.layout);
  }

  private async resolveParsedScan(
    warehouse: WarehouseRecord,
    parsed: ReturnType<typeof parseScanCode>,
    actor: AuthenticatedUser,
  ): Promise<ScanResolveResponse['resolved']> {
    const ownerClientIds = getScanOwnerClientIds(actor, warehouse.id, warehouse.code);
    if (parsed.kind === 'AARD1') {
      if (!matchesAardvarkWarehouse(parsed, warehouse.code)) {
        return emptyScanResolution();
      }
      return this.resolveTypedReference(warehouse.id, parsed.objectType, parsed.reference, ownerClientIds);
    }

    if (parsed.kind === 'GS1') {
      if (parsed.sscc) {
        const bySscc = await this.resolveTypedReference(warehouse.id, 'HU', parsed.sscc, ownerClientIds);
        if (bySscc.found) {
          return bySscc;
        }
        const parcel = await this.resolveTypedReference(warehouse.id, 'PARCEL', parsed.sscc, ownerClientIds);
        if (parcel.found) {
          return parcel;
        }
      }

      if (parsed.gtin) {
        const sku = await this.resolveTypedReference(warehouse.id, 'SKU', parsed.gtin, ownerClientIds);
        if (sku.found) {
          return sku;
        }
      }
    }

    if (parsed.kind === 'RAW') {
      return this.resolveRawReference(warehouse.id, parsed.value, ownerClientIds);
    }

    return emptyScanResolution();
  }

  private async resolveRawReference(
    warehouseId: string,
    reference: string,
    ownerClientIds: string[] | null,
  ): Promise<ScanResolveResponse['resolved']> {
    for (const objectType of ['LOC', 'SKU', 'PARCEL', 'HU', 'TASK'] as const) {
      const resolved = await this.resolveTypedReference(
        warehouseId,
        objectType,
        reference,
        ownerClientIds,
      );
      if (resolved.found) {
        return resolved;
      }
    }

    return emptyScanResolution();
  }

  private async resolveTypedReference(
    warehouseId: string,
    objectType: string,
    reference: string,
    ownerClientIds: string[] | null,
  ): Promise<ScanResolveResponse['resolved']> {
    const normalized = reference.trim();
    if (!normalized) {
      return emptyScanResolution();
    }

    if (objectType === 'LOC') {
      return this.resolveSingleRow('LOCATION', await this.query<ResolveRow>(
        `SELECT id, code, name AS display_name, jsonb_build_object('barcode', barcode, 'zone', zone, 'type', type) AS metadata
         FROM warehouse_locations
         WHERE warehouse_id = $1::uuid AND (upper(code) = upper($2) OR upper(coalesce(barcode, '')) = upper($2))
         LIMIT 1`,
        warehouseId,
        normalized,
      ));
    }

    if (objectType === 'SKU') {
      const directSku = await this.query<ResolveRow>(
        `SELECT id, code, name AS display_name, jsonb_build_object('barcode', barcode, 'uom', uom, 'status', status) AS metadata
         FROM skus
         WHERE upper(code) = upper($1) OR upper(coalesce(barcode, '')) = upper($1)
         LIMIT 1`,
        normalized,
      );
      if (directSku[0]) {
        return this.resolveSingleRow('SKU', directSku);
      }

      return this.resolveSingleRow('SKU', await this.query<ResolveRow>(
        `SELECT s.id, s.code, s.name AS display_name,
                jsonb_build_object('barcode', sb.barcode, 'barcodeType', sb.barcode_type, 'uom', s.uom) AS metadata
         FROM sku_barcodes sb
         JOIN skus s ON s.id = sb.sku_id
         WHERE (sb.warehouse_id IS NULL OR sb.warehouse_id = $1::uuid)
           AND upper(sb.barcode) = upper($2)
           AND sb.status = 'ACTIVE'
         LIMIT 1`,
        warehouseId,
        normalized,
      ));
    }

    if (objectType === 'PARCEL') {
      return this.resolveSingleRow('PARCEL', await this.query<ResolveRow>(
        `SELECT id, tracking_number AS code, recipient_name AS display_name,
                jsonb_build_object('carrier', carrier, 'status', status, 'customerReference', customer_reference) AS metadata
         FROM parcels
         WHERE warehouse_id = $1::uuid
          AND (
            $3::uuid[] IS NULL
            OR EXISTS (
              SELECT 1
              FROM outbound_order_lines ool
              JOIN outbound_orders oo ON oo.id = ool.order_id
              WHERE ool.parcel_id = parcels.id AND oo.owner_client_id = ANY($3::uuid[])
            )
            OR EXISTS (
              SELECT 1
              FROM inbound_shipment_lines isl
              JOIN inbound_shipments ins ON ins.id = isl.shipment_id
              WHERE isl.parcel_id = parcels.id AND ins.owner_client_id = ANY($3::uuid[])
            )
            OR EXISTS (
              SELECT 1
              FROM client_resource_links crl
              WHERE crl.warehouse_id = parcels.warehouse_id
                AND crl.resource_type = 'PARCEL'
                AND crl.resource_id = parcels.id::text
                AND crl.client_id = ANY($3::uuid[])
            )
          )
          AND (upper(tracking_number) = upper($2) OR upper(coalesce(external_reference, '')) = upper($2))
         LIMIT 1`,
        warehouseId,
        normalized,
        ownerClientIds,
      ));
    }

    if (objectType === 'HU') {
      return this.resolveSingleRow('HANDLING_UNIT', await this.query<ResolveRow>(
        `SELECT id, code, type AS display_name, jsonb_build_object('status', status, 'type', type) AS metadata
         FROM handling_units
         WHERE warehouse_id = $1::uuid
          AND ($3::uuid[] IS NULL OR owner_client_id = ANY($3::uuid[]))
          AND upper(code) = upper($2)
         LIMIT 1`,
        warehouseId,
        normalized,
        ownerClientIds,
      ));
    }

    if (objectType === 'TASK') {
      return this.resolveSingleRow('TASK', await this.query<ResolveRow>(
        `SELECT id, coalesce(external_reference, id::text) AS code, type AS display_name,
                jsonb_build_object('status', status, 'priority', priority, 'quantity', quantity) AS metadata
         FROM warehouse_tasks
         WHERE warehouse_id = $1::uuid
          AND ($3::uuid[] IS NULL OR owner_client_id = ANY($3::uuid[]))
          AND (id::text = $2 OR upper(coalesce(external_reference, '')) = upper($2))
         LIMIT 1`,
        warehouseId,
        normalized,
        ownerClientIds,
      ));
    }

    return emptyScanResolution();
  }

  private resolveSingleRow(
    objectType: string,
    rows: ResolveRow[],
  ): ScanResolveResponse['resolved'] {
    const row = rows[0];
    if (!row) {
      return emptyScanResolution();
    }

    return {
      found: true,
      objectType,
      id: row.id,
      code: row.code,
      displayName: row.display_name,
      metadata: row.metadata,
    };
  }

  private async resolveRuntimePrintJobRow(
    warehouseId: string,
    jobReference: string,
  ): Promise<RuntimePrintJobRow> {
    const rows = await this.query<RuntimePrintJobRow>(
      `SELECT * FROM wms_print_jobs WHERE id = $1::uuid AND warehouse_id = $2::uuid LIMIT 1`,
      jobReference,
      warehouseId,
    );

    return required(rows, 'Print job was not found');
  }

  private async findLegacyPrintJobByIdempotencyKey(
    warehouseId: string,
    idempotencyKey: string,
  ): Promise<LabelPrintJobRecord | null> {
    return this.db.labelPrintJob.findFirst({
      where: { warehouseId, idempotencyKey },
    });
  }

  private resolveLegacyPrintJobReplay(
    existing: LabelPrintJobRecord,
    requestHash: string,
  ): LabelPrintJobResponse {
    if (!existing.requestHash || existing.requestHash !== requestHash) {
      throw new ConflictException('Idempotency key was reused with a different label print request');
    }
    return toLabelPrintJobResponse(existing);
  }

  private async resolveRuntimePrintJobReplay(
    warehouseId: string,
    idempotencyKey: string | null,
    requestHash: string,
  ): Promise<RuntimePrintJobRow> {
    if (!idempotencyKey) {
      throw new NotFoundException('Print job was not created');
    }
    const rows = await this.query<RuntimePrintJobRow>(
      `SELECT * FROM wms_print_jobs
       WHERE warehouse_id = $1::uuid AND idempotency_key = $2
       LIMIT 1`,
      warehouseId,
      idempotencyKey,
    );
    const existing = required(rows, 'Print job was not created');
    if (!existing.request_hash || existing.request_hash !== requestHash) {
      throw new ConflictException('Idempotency key was reused with a different runtime print request');
    }
    return existing;
  }

  private async assertRuntimePrinterExists(warehouseId: string, printerCode: string): Promise<void> {
    const rows = await this.query<RuntimePrinterStationRow>(
      `SELECT * FROM wms_printer_stations WHERE warehouse_id = $1::uuid AND code = $2 LIMIT 1`,
      warehouseId,
      printerCode,
    );
    if (!rows[0]) {
      throw new NotFoundException(`Printer ${printerCode} was not found`);
    }
  }

  private async assertRuntimeAgentCanServePrinter(
    warehouseId: string,
    agentCode: string,
    printerCode: string | null,
  ): Promise<void> {
    const rows = await this.query<RuntimePrintAgentRow>(
      `SELECT * FROM wms_print_agents WHERE warehouse_id = $1::uuid AND code = $2 LIMIT 1`,
      warehouseId,
      agentCode,
    );
    const agent = rows[0];
    if (!agent) {
      throw new NotFoundException(`Print agent ${agentCode} was not found`);
    }
    if (!printerCode) {
      return;
    }
    const routing = buildPrintAgentRouting(readPrinterCodesFromAgentMetadata(agent.metadata), [], true);
    if (!routing.legacyWarehouseClaim && !routing.printerCodes.includes(printerCode)) {
      throw new ConflictException(`Print agent ${agentCode} is not assigned to printer ${printerCode}`);
    }
  }

  private async validateAgentToken(
    warehouseId: string,
    agentCode: string,
    token: string,
  ): Promise<RuntimePrintAgentRow> {
    const normalizedAgentCode = normalizeCode(agentCode);
    const rows = await this.query<RuntimePrintAgentRow>(
      `SELECT * FROM wms_print_agents WHERE warehouse_id = $1::uuid AND code = $2 LIMIT 1`,
      warehouseId,
      normalizedAgentCode,
    );
    const agent = rows[0];
    if (!agent) {
      await this.writePrintAgentSecurityAudit(warehouseId, 'print_agent.auth_failed', null, {
        agentCode: normalizedAgentCode,
        reason: 'agent_not_registered',
      });
      throw new UnauthorizedException('Print agent is not registered');
    }
    if (agent.status === 'DISABLED') {
      await this.writePrintAgentSecurityAudit(warehouseId, 'print_agent.auth_failed', agent, {
        agentCode: agent.code,
        reason: 'agent_disabled',
      });
      throw new ForbiddenException('Print agent is disabled');
    }
    if (isPrintAgentAuthLocked(agent.auth_locked_until)) {
      await this.writePrintAgentSecurityAudit(warehouseId, 'print_agent.auth_locked_rejected', agent, {
        agentCode: agent.code,
        reason: 'agent_locked',
        failedCount: agent.auth_failed_count,
        lockedUntil: agent.auth_locked_until,
      });
      throw new ForbiddenException('Print agent is temporarily locked after repeated token failures');
    }
    if (!safeTokenCompare(agent.token_hash, hashToken(token))) {
      const failure = await this.recordPrintAgentTokenFailure(warehouseId, agent);
      await this.writePrintAgentSecurityAudit(warehouseId, 'print_agent.auth_failed', agent, {
        agentCode: agent.code,
        reason: 'invalid_token',
        failedCount: failure.failedCount,
        lockedUntil: failure.lockedUntil,
      });
      if (failure.locked) {
        await this.writePrintAgentSecurityAudit(warehouseId, 'print_agent.auth_locked', agent, {
          agentCode: agent.code,
          reason: 'invalid_token_threshold',
          failedCount: failure.failedCount,
          lockedUntil: failure.lockedUntil,
        });
        throw new ForbiddenException('Print agent is temporarily locked after repeated token failures');
      }

      throw new UnauthorizedException('Print agent token is invalid');
    }

    if (agent.auth_failed_count > 0 || agent.auth_locked_until || agent.token_last_failed_at) {
      await this.clearPrintAgentTokenFailures(warehouseId, agent.code);
    }

    return agent;
  }

  private async recordPrintAgentTokenFailure(
    warehouseId: string,
    agent: RuntimePrintAgentRow,
  ): Promise<{ failedCount: number; lockedUntil: Date | string | null; locked: boolean }> {
    const rows = await this.query<PrintAgentAuthFailureRow>(
      `UPDATE wms_print_agents
       SET auth_failed_count = auth_failed_count + 1,
           token_last_failed_at = now(),
           auth_locked_until = CASE
             WHEN auth_failed_count + 1 >= $3 THEN now() + ($4::text || ' seconds')::interval
             ELSE auth_locked_until
           END,
           updated_at = now()
       WHERE warehouse_id = $1::uuid AND code = $2
       RETURNING auth_failed_count, auth_locked_until`,
      warehouseId,
      agent.code,
      PRINT_AGENT_TOKEN_FAILURE_LOCK_THRESHOLD,
      PRINT_AGENT_TOKEN_LOCK_SECONDS,
    );
    const row = rows[0];
    if (!row) {
      throw new UnauthorizedException('Print agent is not registered');
    }

    return {
      failedCount: row.auth_failed_count,
      lockedUntil: row.auth_locked_until,
      locked: isPrintAgentAuthLocked(row.auth_locked_until),
    };
  }

  private async clearPrintAgentTokenFailures(warehouseId: string, agentCode: string): Promise<void> {
    await this.exec(
      `UPDATE wms_print_agents
       SET auth_failed_count = 0,
           auth_locked_until = NULL,
           token_last_failed_at = NULL,
           updated_at = now()
       WHERE warehouse_id = $1::uuid AND code = $2`,
      warehouseId,
      agentCode,
    );
  }

  private async writePrintAgentSecurityAudit(
    warehouseId: string,
    action: string,
    agent: RuntimePrintAgentRow | null,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          actorUserId: null,
          warehouseId,
          action,
          resourceType: 'print_agent',
          resourceId: agent?.id ?? null,
          metadata: {
            source: 'print_agent_runtime',
            ...metadata,
          },
        },
      });
    } catch {
      return;
    }
  }

  private async heartbeatAgent(
    warehouseId: string,
    agentCode: string,
    version?: string,
    hostname?: string,
    reportedPrinterCodes?: string[],
  ): Promise<void> {
    const heartbeatMetadata = reportedPrinterCodes && reportedPrinterCodes.length > 0
      ? json({ reportedPrinterCodes, reportedAt: new Date().toISOString() })
      : '';
    await this.exec(
      `UPDATE wms_print_agents
       SET status = 'ONLINE',
           version = coalesce(NULLIF($3, ''), version),
           hostname = coalesce(NULLIF($4, ''), hostname),
           metadata = CASE
             WHEN NULLIF($5, '') IS NULL THEN metadata
             ELSE metadata || NULLIF($5, '')::jsonb
           END,
           last_seen_at = now(),
           updated_at = now()
       WHERE warehouse_id = $1::uuid AND code = $2`,
      warehouseId,
      agentCode,
      version?.trim() ?? '',
      hostname?.trim() ?? '',
      heartbeatMetadata,
    );
  }

  private ensureHardwareTables(): Promise<void> {
    if (!this.hardwareTablesReady) {
      this.hardwareTablesReady = this.initializeHardwareTables().catch((error: unknown) => {
        this.hardwareTablesReady = null;
        throw error;
      });
    }
    return this.hardwareTablesReady;
  }

  private async initializeHardwareTables(): Promise<void> {
    await this.exec(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS wms_printer_stations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id uuid NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        protocol text NOT NULL DEFAULT 'TCP_9100',
        host text,
        port integer DEFAULT 9100,
        windows_printer_name text,
        dpi integer NOT NULL DEFAULT 203,
        label_width_mm integer NOT NULL DEFAULT 100,
        label_height_mm integer NOT NULL DEFAULT 150,
        status text NOT NULL DEFAULT 'OFFLINE',
        default_template_code text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        last_seen_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (warehouse_id, code)
      )
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS wms_print_agents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id uuid NOT NULL,
        code text NOT NULL,
        name text NOT NULL,
        token_hash text NOT NULL,
        status text NOT NULL DEFAULT 'OFFLINE',
        version text,
        hostname text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        auth_failed_count integer NOT NULL DEFAULT 0,
        auth_locked_until timestamptz,
        token_last_failed_at timestamptz,
        last_seen_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (warehouse_id, code)
      )
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS wms_print_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id uuid NOT NULL,
        printer_code text,
        agent_code text,
        template_code text,
        template_version integer NOT NULL DEFAULT 1,
        status text NOT NULL DEFAULT 'QUEUED',
        copies integer NOT NULL DEFAULT 1,
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 3,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        rendered_zpl text NOT NULL,
        idempotency_key text,
        request_hash text,
        error_message text,
        requested_by_user_id uuid,
        claimed_at timestamptz,
        claim_expires_at timestamptz,
        printed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS wms_label_template_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id uuid NOT NULL,
        template_code text NOT NULL,
        version integer NOT NULL DEFAULT 1,
        layout jsonb NOT NULL,
        zpl text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (warehouse_id, template_code, version)
      )
    `);
    await this.exec(`
      CREATE TABLE IF NOT EXISTS wms_scan_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        warehouse_id uuid NOT NULL,
        actor_user_id uuid,
        scanned_value text NOT NULL,
        parser_kind text NOT NULL,
        resolved_object_type text,
        resolved_resource_id text,
        resolved_code text,
        found boolean NOT NULL DEFAULT false,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await this.exec(`CREATE INDEX IF NOT EXISTS wms_print_jobs_queue_idx ON wms_print_jobs (warehouse_id, status, created_at)`);
    await this.exec(`ALTER TABLE wms_print_agents ADD COLUMN IF NOT EXISTS auth_failed_count integer NOT NULL DEFAULT 0`);
    await this.exec(`ALTER TABLE wms_print_agents ADD COLUMN IF NOT EXISTS auth_locked_until timestamptz`);
    await this.exec(`ALTER TABLE wms_print_agents ADD COLUMN IF NOT EXISTS token_last_failed_at timestamptz`);
    await this.exec(`ALTER TABLE wms_print_jobs ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz`);
    await this.exec(`ALTER TABLE wms_print_jobs ADD COLUMN IF NOT EXISTS idempotency_key text`);
    await this.exec(`ALTER TABLE wms_print_jobs ADD COLUMN IF NOT EXISTS request_hash text`);
    await this.exec(`CREATE UNIQUE INDEX IF NOT EXISTS wms_print_jobs_idempotency_key_idx ON wms_print_jobs (warehouse_id, idempotency_key) WHERE idempotency_key IS NOT NULL`);
    await this.exec(`CREATE INDEX IF NOT EXISTS wms_print_jobs_claim_lease_idx ON wms_print_jobs (warehouse_id, status, claim_expires_at)`);
    await this.exec(`CREATE INDEX IF NOT EXISTS wms_print_agents_status_idx ON wms_print_agents (warehouse_id, status)`);
    await this.exec(`CREATE INDEX IF NOT EXISTS wms_print_agents_auth_locked_idx ON wms_print_agents (warehouse_id, auth_locked_until) WHERE auth_locked_until IS NOT NULL`);
    await this.exec(`CREATE INDEX IF NOT EXISTS wms_scan_events_created_idx ON wms_scan_events (warehouse_id, created_at DESC)`);
  }

  private async query<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.prisma.$queryRawUnsafe<T[]>(sql, ...params);
  }

  private async exec(sql: string, ...params: unknown[]): Promise<number> {
    return this.prisma.$executeRawUnsafe(sql, ...params);
  }

  private async resolveWarehouse(warehouseReference: string): Promise<WarehouseRecord> {
    const warehouse = await this.db.warehouse.findFirst({
      where: warehouseReferenceWhere(warehouseReference),
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    return warehouse;
  }

  private async resolveParcel(warehouseId: string, parcelReference: string): Promise<ParcelRecord> {
    const parcel = await this.db.parcel.findFirst({
      where: parcelReferenceWhere(warehouseId, parcelReference),
    });

    if (!parcel) {
      throw new NotFoundException('Parcel was not found');
    }

    return parcel;
  }

  private async resolveTemplate(
    warehouseId: string,
    templateReference: string,
  ): Promise<LabelTemplateRecord> {
    const template = await this.db.labelTemplate.findFirst({
      where: templateReferenceWhere(warehouseId, templateReference),
    });

    if (!template) {
      throw new NotFoundException('Label template was not found');
    }

    if (!template.isActive) {
      throw new ConflictException('Label template is inactive');
    }

    return template;
  }

  private async writeTemplateAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    template: LabelTemplateRecord,
  ): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'label_template',
        resourceId: template.id,
        metadata: {
          code: template.code,
          type: template.type,
          isActive: template.isActive,
        },
      },
    });
  }

  private async writePrintJobAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    printJob: LabelPrintJobRecord,
  ): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'label_print_job',
        resourceId: printJob.id,
        metadata: {
          parcelId: printJob.parcelId,
          templateId: printJob.templateId,
          status: printJob.status,
          printerName: printJob.printerName,
          copies: printJob.copies,
        },
      },
    });
  }

  private async writeRuntimeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType,
        resourceId,
        metadata,
      },
    });
  }

  private async writeScanAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    parsed: ReturnType<typeof parseScanCode>,
    resolved: ScanResolveResponse['resolved'],
    dto: ResolveScanDto,
  ): Promise<void> {
    const metadata = {
      source: 'scan.resolve',
      requestMetadata: dto.metadata ?? {},
      parsed,
      resolved,
    };
    await this.exec(
      `INSERT INTO wms_scan_events
        (warehouse_id, actor_user_id, scanned_value, parser_kind, resolved_object_type,
         resolved_resource_id, resolved_code, found, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), $8, $9::jsonb)`,
      warehouseId,
      actor.id,
      dto.scannedValue,
      parsed.kind,
      resolved.objectType ?? '',
      resolved.id ?? '',
      resolved.code ?? '',
      resolved.found,
      json(metadata),
    );
    await this.db.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action: resolved.found ? 'scan.resolved' : 'scan.unresolved',
        resourceType: resolved.objectType ?? 'scan',
        resourceId: resolved.id,
        metadata,
      },
    });
  }
}

function toLabelTemplateResponse(template: LabelTemplateRecord): LabelTemplateResponse {
  return {
    id: template.id,
    warehouseId: template.warehouseId,
    code: template.code,
    name: template.name,
    type: template.type,
    content: template.content,
    isActive: template.isActive,
    metadata: template.metadata,
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function toLabelPrintJobResponse(printJob: LabelPrintJobRecord): LabelPrintJobResponse {
  return {
    id: printJob.id,
    warehouseId: printJob.warehouseId,
    parcelId: printJob.parcelId,
    templateId: printJob.templateId,
    status: printJob.status,
    printerName: printJob.printerName,
    copies: printJob.copies,
    requestedByUserId: printJob.requestedByUserId,
    payload: printJob.payload,
    errorMessage: printJob.errorMessage,
    printedAt: printJob.printedAt,
    createdAt: printJob.createdAt,
    updatedAt: printJob.updatedAt,
  };
}

function toPrinterStationResponse(row: RuntimePrinterStationRow): PrinterStationResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    code: row.code,
    name: row.name,
    protocol: row.protocol,
    host: row.host,
    port: row.port,
    windowsPrinterName: row.windows_printer_name,
    dpi: row.dpi,
    labelWidthMm: row.label_width_mm,
    labelHeightMm: row.label_height_mm,
    status: row.status,
    defaultTemplateCode: row.default_template_code,
    metadata: row.metadata,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPrintAgentResponse(row: RuntimePrintAgentRow): PrintAgentResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    code: row.code,
    name: row.name,
    status: row.status,
    version: row.version,
    hostname: row.hostname,
    printerCodes: readPrinterCodesFromAgentMetadata(row.metadata),
    metadata: row.metadata,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRuntimePrintJobResponse(row: RuntimePrintJobRow): RuntimePrintJobResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    printerCode: row.printer_code,
    agentCode: row.agent_code,
    templateCode: row.template_code,
    templateVersion: row.template_version,
    status: row.status,
    copies: row.copies,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    payload: row.payload,
    renderedZpl: row.rendered_zpl,
    errorMessage: row.error_message,
    requestedByUserId: row.requested_by_user_id,
    claimedAt: row.claimed_at,
    claimExpiresAt: row.claim_expires_at,
    printedAt: row.printed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildDefaultPayload(
  warehouse: WarehouseRecord,
  parcel: ParcelRecord,
  template: LabelTemplateRecord,
): Record<string, unknown> {
  return {
    warehouse: {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
    },
    parcel: {
      id: parcel.id,
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      externalReference: parcel.externalReference,
      customerReference: parcel.customerReference,
      recipientName: parcel.recipientName,
      carrier: parcel.carrier,
      serviceLevel: parcel.serviceLevel,
      weightGrams: parcel.weightGrams,
      metadata: parcel.metadata,
    },
    template: {
      id: template.id,
      code: template.code,
      type: template.type,
    },
  };
}

function renderContentTemplate(content: string, payload: Record<string, unknown>): string {
  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split('.').reduce<unknown>((current, segment) => {
      if (!isRecord(current)) {
        return undefined;
      }
      return current[segment];
    }, payload);

    return value === undefined || value === null ? '' : escapeZplFieldData(String(value));
  });
}

function ensureQueueableZpl(zpl: string, layoutWarnings: string[] = []): string {
  const warnings = [...layoutWarnings, ...validateZplDocument(zpl)];
  if (warnings.length > 0) {
    throw new ConflictException(`Label cannot be queued: ${warnings.join(' ')}`);
  }

  return zpl.trim();
}

function warehouseReferenceWhere(reference: string): QueryObject {
  if (isUuid(reference)) {
    return {
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return { code: normalizeCode(reference) };
}

function parcelReferenceWhere(warehouseId: string, reference: string): QueryObject {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { trackingNumber: normalizeTrackingNumber(reference) }],
    };
  }

  return {
    warehouseId,
    trackingNumber: normalizeTrackingNumber(reference),
  };
}

function templateReferenceWhere(warehouseId: string, reference: string): QueryObject {
  if (isUuid(reference)) {
    return {
      warehouseId,
      OR: [{ id: reference }, { code: normalizeCode(reference) }],
    };
  }

  return {
    warehouseId,
    code: normalizeCode(reference),
  };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeTrackingNumber(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readActionReason(metadata: Record<string, unknown> | undefined): string | null {
  const reason = metadata?.['reason'];
  return typeof reason === 'string' && reason.trim() ? reason.trim() : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function hashRequest(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function safeTokenCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function required<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) {
    throw new NotFoundException(message);
  }

  return row;
}

function emptyScanResolution(): ScanResolveResponse['resolved'] {
  return {
    found: false,
    objectType: null,
    id: null,
    code: null,
    displayName: null,
    metadata: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
