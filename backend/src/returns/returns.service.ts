import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { CreateReturnOrderDto } from './dto/create-return-order.dto';
import { InspectReturnLineDto } from './dto/inspect-return-line.dto';
import { ReceiveReturnLineDto } from './dto/receive-return-line.dto';
import {
  assertReturnQuantity,
  decideReturnDisposition,
  nextReturnLineStatus,
  nextReturnOrderStatus,
  normalizeReturnReference,
} from './returns.helpers';
import {
  ReturnDisposition,
  ReturnInspectionResponse,
  ReturnLineStatus,
  ReturnOrderLineResponse,
  ReturnOrderResponse,
  ReturnOrderStatus,
} from './returns.types';

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  async listReturns(warehouseReference: string): Promise<ReturnOrderResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const orders = await this.query<ReturnOrderRow>(
      `SELECT * FROM return_orders WHERE warehouse_id = $1::uuid ORDER BY created_at DESC LIMIT 200`,
      warehouse.id,
    );
    return Promise.all(orders.map((order) => this.toReturnOrderResponse(order)));
  }

  async getReturn(warehouseReference: string, returnReference: string): Promise<ReturnOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveReturnOrder(warehouse.id, returnReference);
    return this.toReturnOrderResponse(order);
  }

  async createReturn(
    warehouseReference: string,
    dto: CreateReturnOrderDto,
    actor: AuthenticatedUser,
  ): Promise<ReturnOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const ownerClient = dto.ownerClientReference ? await this.resolveClient(dto.ownerClientReference) : null;

    if (!Array.isArray(dto.lines) || dto.lines.length === 0) {
      throw new ConflictException('Return order must have at least one line.');
    }

    const orderRows = await this.query<ReturnOrderRow>(
      `INSERT INTO return_orders
        (warehouse_id, owner_client_id, rma_number, status, customer_reference, external_reference, reason_code, metadata)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING *`,
      warehouse.id,
      ownerClient?.id ?? null,
      normalizeReturnReference(dto.rmaNumber),
      ReturnOrderStatus.CREATED,
      nullable(dto.customerReference),
      nullable(dto.externalReference),
      nullableUpper(dto.reasonCode),
      json(dto.metadata),
    );
    const order = requiredRow(orderRows, 'Return order was not created');

    for (const line of dto.lines) {
      const sku = await this.resolveSku(line.skuReference);
      await this.query<ReturnLineRow>(
        `INSERT INTO return_order_lines
          (return_order_id, line_number, sku_id, expected_quantity, received_quantity, inspected_quantity, status, metadata)
         VALUES ($1::uuid, $2, $3::uuid, $4, 0, 0, $5, $6::jsonb)`,
        order.id,
        line.lineNumber.trim(),
        sku.id,
        assertReturnQuantity(Number(line.expectedQuantity), 'expectedQuantity'),
        ReturnLineStatus.OPEN,
        json(line.metadata),
      );
    }

    await this.writeAudit(actor, warehouse.id, 'return_order.created', 'return_order', order.id, {
      rmaNumber: order.rma_number,
      lineCount: dto.lines.length,
    });

    return this.toReturnOrderResponse(order);
  }

  async receiveLine(
    warehouseReference: string,
    returnReference: string,
    lineReference: string,
    dto: ReceiveReturnLineDto,
    actor: AuthenticatedUser,
  ): Promise<ReturnOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveReturnOrder(warehouse.id, returnReference);
    const line = await this.resolveReturnLine(order.id, lineReference);
    const quantity = assertReturnQuantity(Number(dto.quantity), 'quantity');
    const nextReceived = line.received_quantity + quantity;

    if (nextReceived > line.expected_quantity) {
      throw new ConflictException('Received quantity cannot exceed expected return quantity.');
    }

    const status = nextReturnLineStatus({
      expectedQuantity: line.expected_quantity,
      receivedQuantity: nextReceived,
      inspectedQuantity: line.inspected_quantity,
      disposition: line.disposition as ReturnDisposition | null,
    });
    await this.execute(
      `UPDATE return_order_lines
       SET received_quantity = $1, status = $2, metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb, updated_at = now()
       WHERE id = $4::uuid`,
      nextReceived,
      status,
      json({ receive: dto.metadata ?? {}, receivedAt: dto.receivedAt ?? new Date().toISOString() }),
      line.id,
    );
    await this.refreshReturnOrderStatus(order.id);
    await this.writeAudit(actor, warehouse.id, 'return_line.received', 'return_order_line', line.id, {
      rmaNumber: order.rma_number,
      lineNumber: line.line_number,
      quantity,
    });

    return this.getReturn(warehouse.id, order.id);
  }

  async inspectLine(
    warehouseReference: string,
    returnReference: string,
    lineReference: string,
    dto: InspectReturnLineDto,
    actor: AuthenticatedUser,
  ): Promise<ReturnInspectionResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveReturnOrder(warehouse.id, returnReference);
    const line = await this.resolveReturnLine(order.id, lineReference);
    const decision = decideReturnDisposition(dto.disposition);
    const inspectedQuantity = assertReturnQuantity(Number(dto.inspectedQuantity), 'inspectedQuantity');
    const acceptedQuantity = dto.acceptedQuantity ?? (decision.createsStock ? inspectedQuantity : 0);
    const rejectedQuantity = dto.rejectedQuantity ?? Math.max(0, inspectedQuantity - acceptedQuantity);

    if (line.received_quantity <= 0 || inspectedQuantity > line.received_quantity - line.inspected_quantity) {
      throw new ConflictException('Inspected quantity cannot exceed uninspected received quantity.');
    }

    if (acceptedQuantity + rejectedQuantity !== inspectedQuantity) {
      throw new ConflictException('Accepted + rejected quantity must equal inspected quantity.');
    }

    const stockQuantId = decision.createsStock && acceptedQuantity > 0
      ? await this.createOrUpdateReturnedStock({
          warehouseId: warehouse.id,
          ownerClientId: order.owner_client_id,
          skuId: line.sku_id,
          quantity: acceptedQuantity,
          status: decision.stockStatus ?? 'AVAILABLE',
          locationReference: dto.locationReference,
          lotReference: dto.lotReference,
          returnOrderId: order.id,
          returnLineId: line.id,
          actorUserId: actor.id,
          metadata: dto.metadata,
        })
      : null;

    const inspectionRows = await this.query<ReturnInspectionRow>(
      `INSERT INTO return_inspections
        (warehouse_id, return_order_id, return_order_line_id, disposition, inspected_quantity, accepted_quantity, rejected_quantity, stock_quant_id, notes, metadata, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8::uuid, $9, $10::jsonb, $11::uuid)
       RETURNING *`,
      warehouse.id,
      order.id,
      line.id,
      decision.disposition,
      inspectedQuantity,
      acceptedQuantity,
      rejectedQuantity,
      stockQuantId,
      nullable(dto.notes),
      json(dto.metadata),
      actor.id,
    );
    const inspection = requiredRow(inspectionRows, 'Return inspection was not created');
    const nextInspected = line.inspected_quantity + inspectedQuantity;
    const lineStatus = nextReturnLineStatus({
      expectedQuantity: line.expected_quantity,
      receivedQuantity: line.received_quantity,
      inspectedQuantity: nextInspected,
      disposition: decision.disposition,
    });

    await this.execute(
      `UPDATE return_order_lines
       SET inspected_quantity = $1, disposition = $2, status = $3, updated_at = now()
       WHERE id = $4::uuid`,
      nextInspected,
      decision.disposition,
      decision.closesLine ? ReturnLineStatus.CLOSED : lineStatus,
      line.id,
    );
    await this.refreshReturnOrderStatus(order.id);
    await this.writeAudit(actor, warehouse.id, 'return_line.inspected', 'return_inspection', inspection.id, {
      rmaNumber: order.rma_number,
      lineNumber: line.line_number,
      disposition: decision.disposition,
      inspectedQuantity,
      acceptedQuantity,
      stockQuantId,
    });

    return toInspectionResponse(inspection);
  }

  private async createOrUpdateReturnedStock(input: {
    warehouseId: string;
    ownerClientId: string | null;
    skuId: string;
    quantity: number;
    status: string;
    locationReference?: string;
    lotReference?: string;
    returnOrderId: string;
    returnLineId: string;
    actorUserId: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const location = input.locationReference
      ? await this.resolveLocation(input.warehouseId, input.locationReference)
      : await this.resolveDefaultReturnsLocation(input.warehouseId);
    const lot = input.lotReference ? await this.resolveLot(input.warehouseId, input.skuId, input.lotReference) : null;
    const updated = await this.query<{ id: string }>(
      `UPDATE stock_quants
       SET quantity = quantity + $1, updated_at = now(), metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
       WHERE warehouse_id = $3::uuid
         AND location_id = $4::uuid
         AND sku_id = $5::uuid
         AND status::text = $6
         AND owner_client_id IS NOT DISTINCT FROM $7::uuid
         AND lot_id IS NOT DISTINCT FROM $8::uuid
         AND handling_unit_id IS NULL
       RETURNING id`,
      input.quantity,
      json({ returnOrderId: input.returnOrderId, returnLineId: input.returnLineId, source: 'returns' }),
      input.warehouseId,
      location.id,
      input.skuId,
      input.status,
      input.ownerClientId,
      lot?.id ?? null,
    );
    const quantId = updated[0]?.id ?? (await this.insertReturnedQuant(input, location.id, lot?.id ?? null));

    await this.execute(
      `INSERT INTO stock_movements
        (warehouse_id, owner_client_id, sku_id, stock_quant_id, actor_user_id, type, quantity, to_location_id, reference_type, reference_id, source_system, idempotency_key, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, 'RECEIVE', $6, $7::uuid, 'RETURN_ORDER_LINE', $8, 'RETURNS', $9, $10::jsonb)
       ON CONFLICT (source_system, idempotency_key) DO NOTHING`,
      input.warehouseId,
      input.ownerClientId,
      input.skuId,
      quantId,
      input.actorUserId,
      input.quantity,
      location.id,
      input.returnLineId,
      `return:${input.returnLineId}:${input.status}:${input.quantity}`,
      json({ ...(input.metadata ?? {}), dispositionStockStatus: input.status }),
    );

    return quantId;
  }

  private async insertReturnedQuant(
    input: {
      warehouseId: string;
      ownerClientId: string | null;
      skuId: string;
      quantity: number;
      status: string;
      metadata?: Record<string, unknown>;
    },
    locationId: string,
    lotId: string | null,
  ): Promise<string> {
    const rows = await this.query<{ id: string }>(
      `INSERT INTO stock_quants
        (warehouse_id, owner_client_id, location_id, sku_id, lot_id, quantity, reserved_quantity, status, metadata)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, 0, $7::"StockQuantStatus", $8::jsonb)
       RETURNING id`,
      input.warehouseId,
      input.ownerClientId,
      locationId,
      input.skuId,
      lotId,
      input.quantity,
      input.status,
      json({ ...(input.metadata ?? {}), source: 'returns' }),
    );
    return requiredRow(rows, 'Returned stock quant was not created').id;
  }

  private async refreshReturnOrderStatus(returnOrderId: string): Promise<void> {
    const statuses = await this.query<{ status: string }>(
      `SELECT status FROM return_order_lines WHERE return_order_id = $1::uuid`,
      returnOrderId,
    );
    const nextStatus = nextReturnOrderStatus(statuses.map((row) => row.status as ReturnLineStatus));
    await this.execute(`UPDATE return_orders SET status = $1, updated_at = now() WHERE id = $2::uuid`, nextStatus, returnOrderId);
  }

  private async toReturnOrderResponse(order: ReturnOrderRow): Promise<ReturnOrderResponse> {
    const lines = await this.query<ReturnLineRow>(
      `SELECT * FROM return_order_lines WHERE return_order_id = $1::uuid ORDER BY line_number ASC`,
      order.id,
    );
    return {
      id: order.id,
      warehouseId: order.warehouse_id,
      ownerClientId: order.owner_client_id,
      rmaNumber: order.rma_number,
      status: order.status as ReturnOrderStatus,
      customerReference: order.customer_reference,
      externalReference: order.external_reference,
      reasonCode: order.reason_code,
      metadata: order.metadata,
      lines: lines.map(toLineResponse),
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  private async resolveWarehouse(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM warehouses WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeReturnReference(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Warehouse was not found');
    return row;
  }

  private async resolveClient(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM wms_clients WHERE id::text = $1 OR code = $2 LIMIT 1`,
      reference,
      normalizeReturnReference(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Client was not found');
    return row;
  }

  private async resolveSku(reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM skus WHERE id::text = $1 OR code = $2 OR barcode = $3 LIMIT 1`,
      reference,
      normalizeReturnReference(reference),
      reference.trim(),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('SKU was not found');
    return row;
  }

  private async resolveLocation(warehouseId: string, reference: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM warehouse_locations WHERE warehouse_id = $1::uuid AND (id::text = $2 OR code = $3 OR barcode = $4) LIMIT 1`,
      warehouseId,
      reference,
      normalizeReturnReference(reference),
      reference.trim(),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Returns location was not found');
    return row;
  }

  private async resolveDefaultReturnsLocation(warehouseId: string): Promise<IdCodeRow> {
    const rows = await this.query<IdCodeRow>(
      `SELECT id, code FROM warehouse_locations
       WHERE warehouse_id = $1::uuid AND (type::text IN ('RECEIVING', 'QUARANTINE', 'BUFFER') OR bin_type IN ('RETURNS', 'QUARANTINE'))
       ORDER BY CASE WHEN bin_type = 'RETURNS' THEN 0 WHEN type::text = 'QUARANTINE' THEN 1 ELSE 2 END, code ASC
       LIMIT 1`,
      warehouseId,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Default returns location was not found');
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

  private async resolveReturnOrder(warehouseId: string, reference: string): Promise<ReturnOrderRow> {
    const rows = await this.query<ReturnOrderRow>(
      `SELECT * FROM return_orders WHERE warehouse_id = $1::uuid AND (id::text = $2 OR rma_number = $3) LIMIT 1`,
      warehouseId,
      reference,
      normalizeReturnReference(reference),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Return order was not found');
    return row;
  }

  private async resolveReturnLine(returnOrderId: string, reference: string): Promise<ReturnLineRow> {
    const rows = await this.query<ReturnLineRow>(
      `SELECT * FROM return_order_lines WHERE return_order_id = $1::uuid AND (id::text = $2 OR line_number = $3) LIMIT 1`,
      returnOrderId,
      reference,
      reference.trim(),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Return order line was not found');
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

function toLineResponse(line: ReturnLineRow): ReturnOrderLineResponse {
  return {
    id: line.id,
    returnOrderId: line.return_order_id,
    lineNumber: line.line_number,
    skuId: line.sku_id,
    expectedQuantity: line.expected_quantity,
    receivedQuantity: line.received_quantity,
    inspectedQuantity: line.inspected_quantity,
    disposition: line.disposition as ReturnDisposition | null,
    status: line.status as ReturnLineStatus,
    metadata: line.metadata,
    createdAt: line.created_at,
    updatedAt: line.updated_at,
  };
}

function toInspectionResponse(row: ReturnInspectionRow): ReturnInspectionResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    returnOrderId: row.return_order_id,
    returnOrderLineId: row.return_order_line_id,
    disposition: row.disposition as ReturnDisposition,
    inspectedQuantity: row.inspected_quantity,
    acceptedQuantity: row.accepted_quantity,
    rejectedQuantity: row.rejected_quantity,
    stockQuantId: row.stock_quant_id,
    notes: row.notes,
    metadata: row.metadata,
    createdAt: row.created_at,
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

interface ReturnOrderRow extends TimestampedRow {
  warehouse_id: string;
  owner_client_id: string | null;
  rma_number: string;
  status: string;
  customer_reference: string | null;
  external_reference: string | null;
  reason_code: string | null;
  metadata: unknown;
}

interface ReturnLineRow extends TimestampedRow {
  return_order_id: string;
  line_number: string;
  sku_id: string;
  expected_quantity: number;
  received_quantity: number;
  inspected_quantity: number;
  disposition: string | null;
  status: string;
  metadata: unknown;
}

interface ReturnInspectionRow {
  id: string;
  warehouse_id: string;
  return_order_id: string;
  return_order_line_id: string;
  disposition: string;
  inspected_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  stock_quant_id: string | null;
  notes: string | null;
  metadata: unknown;
  created_at: Date;
}
