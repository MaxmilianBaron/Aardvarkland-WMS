import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { CompleteQualityInspectionDto } from './dto/complete-quality-inspection.dto';
import { CreateQualityInspectionDto } from './dto/create-quality-inspection.dto';
import { CreateQualitySamplingRuleDto } from './dto/create-quality-sampling-rule.dto';
import { calculateSampleQuantity, decideQualityDisposition, normalizeInspectionNumber } from './quality.helpers';
import {
  QualityInspectionResponse,
  QualityInspectionResult,
  QualityInspectionStatus,
  QualitySamplingRuleResponse,
} from './quality.types';

@Injectable()
export class QualityService {
  constructor(private readonly prisma: PrismaService) {}

  async listInspections(warehouseReference: string): Promise<QualityInspectionResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const rows = await this.query<QualityInspectionRow>(
      `SELECT * FROM quality_inspections WHERE warehouse_id = $1::uuid ORDER BY created_at DESC LIMIT 200`,
      warehouse.id,
    );
    return rows.map(toInspectionResponse);
  }

  async createInspection(
    warehouseReference: string,
    dto: CreateQualityInspectionDto,
    actor: AuthenticatedUser,
  ): Promise<QualityInspectionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const ownerClient = dto.ownerClientReference ? await this.resolveClient(dto.ownerClientReference) : null;
    const sku = dto.skuReference ? await this.resolveSku(dto.skuReference) : null;
    const lot = dto.lotReference && sku ? await this.resolveLot(warehouse.id, sku.id, dto.lotReference) : null;

    if (dto.lotReference && !sku) throw new ConflictException('lotReference requires skuReference.');

    const sampleQuantity = dto.sampleQuantity
      ? calculateSampleQuantity({ quantity: dto.sampleQuantity, samplePercent: 100, minSampleQuantity: 1 })
      : 1;
    const rows = await this.query<QualityInspectionRow>(
      `INSERT INTO quality_inspections
        (warehouse_id, owner_client_id, sku_id, lot_id, stock_quant_id, inspection_number, status, sample_quantity, checklist, reason_code, created_by_user_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, $9::jsonb, $10, $11::uuid, $12::jsonb)
       RETURNING *`,
      warehouse.id,
      ownerClient?.id ?? null,
      sku?.id ?? null,
      lot?.id ?? null,
      nullable(dto.stockQuantId),
      normalizeInspectionNumber(dto.inspectionNumber),
      QualityInspectionStatus.OPEN,
      sampleQuantity,
      json(dto.checklist),
      nullableUpper(dto.reasonCode),
      actor.id,
      json(dto.metadata),
    );
    const inspection = requiredRow(rows, 'Quality inspection was not created');
    await this.writeAudit(actor, warehouse.id, 'quality_inspection.created', 'quality_inspection', inspection.id, {
      inspectionNumber: inspection.inspection_number,
      skuId: inspection.sku_id,
      lotId: inspection.lot_id,
    });
    return toInspectionResponse(inspection);
  }

  async completeInspection(
    warehouseReference: string,
    inspectionReference: string,
    dto: CompleteQualityInspectionDto,
    actor: AuthenticatedUser,
  ): Promise<QualityInspectionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existing = await this.resolveInspection(warehouse.id, inspectionReference);
    const decision = decideQualityDisposition(dto.result);
    const rows = await this.query<QualityInspectionRow>(
      `UPDATE quality_inspections SET
         status = $1,
         result = $2,
         checklist = COALESCE($3::jsonb, checklist),
         notes = $4,
         completed_by_user_id = $5::uuid,
         completed_at = now(),
         metadata = COALESCE(metadata, '{}'::jsonb) || $6::jsonb,
         updated_at = now()
       WHERE id = $7::uuid
       RETURNING *`,
      decision.inspectionStatus,
      decision.result,
      dto.checklist === undefined ? null : json(dto.checklist),
      nullable(dto.notes),
      actor.id,
      json(dto.metadata),
      existing.id,
    );
    const inspection = requiredRow(rows, 'Quality inspection was not completed');

    if (decision.stockStatus && inspection.stock_quant_id) {
      await this.execute(
        `UPDATE stock_quants SET status = $1::"StockQuantStatus", updated_at = now(), metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb WHERE id = $3::uuid`,
        decision.stockStatus,
        json({ qualityInspectionId: inspection.id, qualityResult: decision.result }),
        inspection.stock_quant_id,
      );
    }

    if (decision.lotStatus && decision.lotQualityStatus && inspection.lot_id) {
      await this.execute(
        `UPDATE sku_lots SET status = $1::"LotStatus", quality_status = $2::"LotQualityStatus", updated_at = now() WHERE id = $3::uuid`,
        decision.lotStatus,
        decision.lotQualityStatus,
        inspection.lot_id,
      );
    }

    await this.writeAudit(actor, warehouse.id, 'quality_inspection.completed', 'quality_inspection', inspection.id, {
      inspectionNumber: inspection.inspection_number,
      result: inspection.result,
      stockStatus: decision.stockStatus,
      lotStatus: decision.lotStatus,
    });
    return toInspectionResponse(inspection);
  }

  async releaseQuarantine(
    warehouseReference: string,
    quantReference: string,
    actor: AuthenticatedUser,
  ): Promise<{ stockQuantId: string; status: 'AVAILABLE' }> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const quant = await this.resolveQuant(warehouse.id, quantReference);
    await this.execute(
      `UPDATE stock_quants SET status = 'AVAILABLE'::"StockQuantStatus", updated_at = now(), metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb WHERE id = $2::uuid`,
      json({ qualityReleaseBy: actor.id, qualityReleasedAt: new Date().toISOString() }),
      quant.id,
    );
    await this.writeAudit(actor, warehouse.id, 'quality_quarantine.released', 'stock_quant', quant.id, {
      previousStatus: quant.status,
    });
    return { stockQuantId: quant.id, status: 'AVAILABLE' };
  }

  async createSamplingRule(
    warehouseReference: string,
    dto: CreateQualitySamplingRuleDto,
    actor: AuthenticatedUser,
  ): Promise<QualitySamplingRuleResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const client = dto.clientReference ? await this.resolveClient(dto.clientReference) : null;
    const sku = dto.skuReference ? await this.resolveSku(dto.skuReference) : null;
    const rows = await this.query<QualitySamplingRuleRow>(
      `INSERT INTO quality_sampling_rules
        (warehouse_id, client_id, sku_id, lot_status, reason_code, sample_percent, min_sample_quantity, max_sample_quantity, is_active, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING *`,
      warehouse.id,
      client?.id ?? null,
      sku?.id ?? null,
      nullableUpper(dto.lotStatus),
      nullableUpper(dto.reasonCode),
      dto.samplePercent,
      dto.minSampleQuantity ?? 1,
      dto.maxSampleQuantity ?? null,
      dto.isActive ?? true,
      json(dto.metadata),
    );
    const rule = requiredRow(rows, 'Quality sampling rule was not created');
    await this.writeAudit(actor, warehouse.id, 'quality_sampling_rule.created', 'quality_sampling_rule', rule.id, {
      samplePercent: rule.sample_percent,
      skuId: rule.sku_id,
      clientId: rule.client_id,
    });
    return toSamplingRuleResponse(rule);
  }

  async listSamplingRules(warehouseReference: string): Promise<QualitySamplingRuleResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const rows = await this.query<QualitySamplingRuleRow>(
      `SELECT * FROM quality_sampling_rules WHERE warehouse_id = $1::uuid ORDER BY created_at DESC LIMIT 200`,
      warehouse.id,
    );
    return rows.map(toSamplingRuleResponse);
  }

  private async resolveInspection(warehouseId: string, reference: string): Promise<QualityInspectionRow> {
    const rows = await this.query<QualityInspectionRow>(
      `SELECT * FROM quality_inspections WHERE warehouse_id = $1::uuid AND (id::text = $2 OR inspection_number = $3) LIMIT 1`,
      warehouseId,
      reference,
      normalizeInspectionNumber(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Quality inspection was not found');
    return row;
  }

  private async resolveWarehouse(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM warehouses WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeInspectionNumber(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Warehouse was not found');
    return row;
  }

  private async resolveClient(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM wms_clients WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeInspectionNumber(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Client was not found');
    return row;
  }

  private async resolveSku(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM skus WHERE id::text = $1 OR code = $2 OR barcode = $3 LIMIT 1`,
      reference,
      normalizeInspectionNumber(reference),
      reference.trim(),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('SKU was not found');
    return row;
  }

  private async resolveLot(warehouseId: string, skuId: string, reference: string): Promise<{ id: string }> {
    const rows = await this.query<{ id: string }>(
      `SELECT id FROM sku_lots WHERE warehouse_id = $1::uuid AND sku_id = $2::uuid AND (id::text = $3 OR lot_code = $4) LIMIT 1`,
      warehouseId,
      skuId,
      reference,
      reference.trim(),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Lot was not found');
    return row;
  }

  private async resolveQuant(warehouseId: string, reference: string): Promise<{ id: string; status: string }> {
    const rows = await this.query<{ id: string; status: string }>(
      `SELECT id, status::text AS status FROM stock_quants WHERE warehouse_id = $1::uuid AND id::text = $2 LIMIT 1`,
      warehouseId,
      reference,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Stock quant was not found');
    return row;
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    resourceType: string,
    resourceId: string,
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

function toInspectionResponse(row: QualityInspectionRow): QualityInspectionResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    skuId: row.sku_id,
    lotId: row.lot_id,
    stockQuantId: row.stock_quant_id,
    inspectionNumber: row.inspection_number,
    status: row.status as QualityInspectionStatus,
    result: row.result as QualityInspectionResult | null,
    sampleQuantity: row.sample_quantity,
    checklist: row.checklist,
    reasonCode: row.reason_code,
    notes: row.notes,
    createdByUserId: row.created_by_user_id,
    completedByUserId: row.completed_by_user_id,
    completedAt: row.completed_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSamplingRuleResponse(row: QualitySamplingRuleRow): QualitySamplingRuleResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    clientId: row.client_id,
    skuId: row.sku_id,
    lotStatus: row.lot_status,
    reasonCode: row.reason_code,
    samplePercent: Number(row.sample_percent),
    minSampleQuantity: row.min_sample_quantity,
    maxSampleQuantity: row.max_sample_quantity,
    isActive: row.is_active,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requiredRow<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new ConflictException(message);
  return row;
}

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function nullable(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function nullableUpper(value: string | null | undefined): string | null {
  const normalized = nullable(value);
  return normalized ? normalized.toUpperCase() : null;
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

interface QualityInspectionRow extends TimestampedRow {
  warehouse_id: string;
  owner_client_id: string | null;
  sku_id: string | null;
  lot_id: string | null;
  stock_quant_id: string | null;
  inspection_number: string;
  status: string;
  result: string | null;
  sample_quantity: number;
  checklist: unknown;
  reason_code: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  completed_by_user_id: string | null;
  completed_at: Date | null;
  metadata: unknown;
}

interface QualitySamplingRuleRow extends TimestampedRow {
  warehouse_id: string;
  client_id: string | null;
  sku_id: string | null;
  lot_status: string | null;
  reason_code: string | null;
  sample_percent: number | string;
  min_sample_quantity: number;
  max_sample_quantity: number | null;
  is_active: boolean;
  metadata: unknown;
}
