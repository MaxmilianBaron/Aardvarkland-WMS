import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../access-control';
import { normalizeOffsetPagination } from '../common';
import { PrismaService } from '../database';
import { evaluateWorkflowTransition } from '../workflow';
import { Prisma, Sku, Warehouse, WarehouseLocation } from '../generated/prisma/client';
import { CancelWarehouseOrderDto } from './dto/cancel-warehouse-order.dto';
import { CompleteWarehouseOrderDto } from './dto/complete-warehouse-order.dto';
import { CreateWarehouseOrderDto } from './dto/create-warehouse-order.dto';
import { ListWarehouseOrdersQueryDto } from './dto/list-warehouse-orders-query.dto';
import {
  WarehouseOrderLineResponse,
  WarehouseOrderLineStatus,
  WarehouseOrderResponse,
  WarehouseOrderStatus,
  WarehouseOrderTaskLinkResponse,
  WarehouseOrderType,
} from './warehouse-orders.types';

interface WarehouseOrderRow {
  id: string;
  warehouse_id: string;
  owner_client_id: string | null;
  order_number: string;
  order_type: string;
  status: string;
  priority: number;
  source_type: string | null;
  source_id: string | null;
  from_location_id: string | null;
  to_location_id: string | null;
  due_at: Date | string | null;
  released_at: Date | string | null;
  completed_at: Date | string | null;
  cancelled_at: Date | string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface WarehouseOrderLineRow {
  id: string;
  warehouse_id: string;
  owner_client_id: string | null;
  warehouse_order_id: string;
  line_number: string;
  sku_id: string | null;
  lot_id: string | null;
  requested_quantity: number;
  allocated_quantity: number;
  completed_quantity: number;
  serial_required: boolean;
  status: string;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface WarehouseOrderTaskLinkRow {
  id: string;
  warehouse_order_id: string;
  warehouse_order_line_id: string | null;
  warehouse_task_id: string;
  created_at: Date | string;
}

interface ResolvedOrderLine {
  lineNumber: string;
  skuId: string | null;
  lotId: string | null;
  requestedQuantity: number;
  serialRequired: boolean;
  metadata: Record<string, unknown>;
}

interface RawClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

@Injectable()
export class WarehouseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrders(warehouseReference: string, query: ListWarehouseOrdersQueryDto): Promise<WarehouseOrderResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const conditions = ['warehouse_id = $1::uuid'];
    const values: unknown[] = [warehouse.id];
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });

    if (query.status) {
      values.push(query.status);
      conditions.push(`status = $${values.length}::"WarehouseOrderStatus"`);
    }
    if (query.orderType) {
      values.push(query.orderType);
      conditions.push(`order_type = $${values.length}::"WarehouseOrderType"`);
    }
    if (query.ownerClientId) {
      values.push(query.ownerClientId);
      conditions.push(`owner_client_id = $${values.length}::uuid`);
    }

    const rows = await this.prisma.$queryRawUnsafe<WarehouseOrderRow[]>(
      `${ORDER_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY priority ASC, created_at DESC LIMIT $${values.length + 1}::int OFFSET $${values.length + 2}::int`,
      ...values,
      page.take,
      page.skip,
    );
    const responses: WarehouseOrderResponse[] = [];
    for (const row of rows) {
      responses.push(await this.hydrateOrder(row));
    }
    return responses;
  }

  async getOrder(warehouseReference: string, orderReference: string): Promise<WarehouseOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveOrder(warehouse.id, orderReference);
    return this.hydrateOrder(order);
  }

  async createOrder(
    warehouseReference: string,
    dto: CreateWarehouseOrderDto,
    actor: AuthenticatedUser,
  ): Promise<WarehouseOrderResponse> {
    if (dto.lines.length === 0) {
      throw new ConflictException('Warehouse order must contain at least one line');
    }

    const warehouse = await this.resolveWarehouse(warehouseReference);
    const fromLocation = dto.fromLocationReference ? await this.resolveLocation(warehouse.id, dto.fromLocationReference) : null;
    const toLocation = dto.toLocationReference ? await this.resolveLocation(warehouse.id, dto.toLocationReference) : null;
    const lines = await this.resolveLines(warehouse.id, dto.lines);
    const orderNumber = dto.orderNumber ? normalizeCode(dto.orderNumber) : generateOrderNumber();

    try {
      const orderId = await this.prisma.$transaction(async (tx: unknown) => {
        const client = tx as RawClient;
        const orderRows = await client.$queryRawUnsafe<WarehouseOrderRow[]>(
          `
            INSERT INTO warehouse_orders
              (warehouse_id, owner_client_id, order_number, order_type, status, priority, source_type, source_id,
               from_location_id, to_location_id, due_at, metadata, created_at, updated_at)
            VALUES
              ($1::uuid, $2::uuid, $3, $4::"WarehouseOrderType", 'DRAFT', $5, $6, $7, $8::uuid, $9::uuid, $10, $11::jsonb, NOW(), NOW())
            RETURNING ${ORDER_COLUMNS}
          `,
          warehouse.id,
          dto.ownerClientId ?? null,
          orderNumber,
          dto.orderType,
          dto.priority ?? 100,
          normalizeNullableString(dto.sourceType),
          normalizeNullableString(dto.sourceId),
          fromLocation?.id ?? null,
          toLocation?.id ?? null,
          dto.dueAt ?? null,
          JSON.stringify(dto.metadata ?? {}),
        );
        const order = assertSingle(orderRows, 'Warehouse order was not created');

        for (const line of lines) {
          await client.$executeRawUnsafe(
            `
              INSERT INTO warehouse_order_lines
                (warehouse_id, owner_client_id, warehouse_order_id, line_number, sku_id, lot_id,
                 requested_quantity, allocated_quantity, completed_quantity, serial_required, status, metadata, created_at, updated_at)
              VALUES
                ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7, 0, 0, $8, 'OPEN', $9::jsonb, NOW(), NOW())
            `,
            warehouse.id,
            dto.ownerClientId ?? null,
            order.id,
            line.lineNumber,
            line.skuId,
            line.lotId,
            line.requestedQuantity,
            line.serialRequired,
            JSON.stringify(line.metadata),
          );
        }

        return order.id;
      });

      await this.writeAudit(actor, warehouse.id, 'warehouse_order.created', String(orderId), { orderNumber });
      return this.readOrderById(String(orderId));
    } catch (error: unknown) {
      if (isUniqueViolation(error)) throw new ConflictException('Warehouse order number already exists in this warehouse');
      throw error;
    }
  }

  async releaseOrder(
    warehouseReference: string,
    orderReference: string,
    actor: AuthenticatedUser,
  ): Promise<WarehouseOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveOrder(warehouse.id, orderReference);
    this.assertWarehouseOrderTransition(
      order,
      'RELEASE',
      actor,
      order.status === WarehouseOrderStatus.EXCEPTION ? 'EXCEPTION_RECOVERED' : undefined,
    );
    const lines = await this.readOrderLines(order.id);

    await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as RawClient;
      await client.$executeRawUnsafe(
        `UPDATE warehouse_orders SET status = 'RELEASED', released_at = COALESCE(released_at, NOW()), updated_at = NOW() WHERE id = $1::uuid`,
        order.id,
      );

      for (const line of lines) {
        const taskRows = await client.$queryRawUnsafe<{ id: string }[]>(
          `
            INSERT INTO warehouse_tasks
              (warehouse_id, owner_client_id, type, status, sku_id, from_location_id, to_location_id, quantity,
               priority, external_reference, metadata, due_at, created_at, updated_at)
            VALUES
              ($1::uuid, $2::uuid, $3::"WarehouseTaskType", 'OPEN', $4::uuid, $5::uuid, $6::uuid, $7,
               $8, $9, $10::jsonb, $11, NOW(), NOW())
            RETURNING id
          `,
          order.warehouse_id,
          line.owner_client_id ?? order.owner_client_id,
          mapOrderTypeToTaskType(order.order_type as WarehouseOrderType),
          line.sku_id,
          order.from_location_id,
          order.to_location_id,
          line.requested_quantity,
          order.priority,
          `${order.order_number}:${line.line_number}`,
          JSON.stringify({ warehouseOrderId: order.id, warehouseOrderLineId: line.id, orderNumber: order.order_number }),
          order.due_at,
        );
        const task = assertSingle(taskRows, 'Warehouse task was not created');
        await client.$executeRawUnsafe(
          `
            INSERT INTO warehouse_order_tasks
              (warehouse_id, owner_client_id, warehouse_order_id, warehouse_order_line_id, warehouse_task_id, created_at)
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, NOW())
            ON CONFLICT (warehouse_order_id, warehouse_task_id) DO NOTHING
          `,
          order.warehouse_id,
          line.owner_client_id ?? order.owner_client_id,
          order.id,
          line.id,
          task.id,
        );
        await client.$executeRawUnsafe(
          `UPDATE warehouse_order_lines SET status = 'IN_PROGRESS', allocated_quantity = requested_quantity, updated_at = NOW() WHERE id = $1::uuid`,
          line.id,
        );
      }
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_order.released', order.id, { orderNumber: order.order_number });
    return this.readOrderById(order.id);
  }

  async completeOrder(
    warehouseReference: string,
    orderReference: string,
    dto: CompleteWarehouseOrderDto,
    actor: AuthenticatedUser,
  ): Promise<WarehouseOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveOrder(warehouse.id, orderReference);
    this.assertWarehouseOrderTransition(order, 'COMPLETE', actor);

    await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as RawClient;
      await client.$executeRawUnsafe(
        `UPDATE warehouse_orders SET status = 'COMPLETED', completed_at = NOW(), metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`,
        order.id,
        JSON.stringify(dto.metadata ?? {}),
      );
      await client.$executeRawUnsafe(
        `UPDATE warehouse_order_lines SET status = 'DONE', completed_quantity = requested_quantity, updated_at = NOW() WHERE warehouse_order_id = $1::uuid`,
        order.id,
      );
      await client.$executeRawUnsafe(
        `
          UPDATE warehouse_tasks wt
          SET status = 'DONE', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
          FROM warehouse_order_tasks wot
          WHERE wot.warehouse_task_id = wt.id AND wot.warehouse_order_id = $1::uuid AND wt.status <> 'DONE'
        `,
        order.id,
      );
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_order.completed', order.id, dto.metadata ?? {});
    return this.readOrderById(order.id);
  }

  async cancelOrder(
    warehouseReference: string,
    orderReference: string,
    dto: CancelWarehouseOrderDto,
    actor: AuthenticatedUser,
  ): Promise<WarehouseOrderResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const order = await this.resolveOrder(warehouse.id, orderReference);
    this.assertWarehouseOrderTransition(order, 'CANCEL', actor, dto.reason);

    await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as RawClient;
      await client.$executeRawUnsafe(
        `UPDATE warehouse_orders SET status = 'CANCELLED', cancelled_at = NOW(), metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW() WHERE id = $1::uuid`,
        order.id,
        JSON.stringify({ ...(dto.metadata ?? {}), cancellationReason: dto.reason ?? null }),
      );
      await client.$executeRawUnsafe(
        `UPDATE warehouse_order_lines SET status = 'CANCELLED', updated_at = NOW() WHERE warehouse_order_id = $1::uuid AND status <> 'DONE'`,
        order.id,
      );
      await client.$executeRawUnsafe(
        `
          UPDATE warehouse_tasks wt
          SET status = 'CANCELLED', failure_reason = COALESCE($2, failure_reason), updated_at = NOW()
          FROM warehouse_order_tasks wot
          WHERE wot.warehouse_task_id = wt.id AND wot.warehouse_order_id = $1::uuid AND wt.status NOT IN ('DONE', 'CANCELLED')
        `,
        order.id,
        dto.reason ?? null,
      );
    });

    await this.writeAudit(actor, warehouse.id, 'warehouse_order.cancelled', order.id, { reason: dto.reason ?? null });
    return this.readOrderById(order.id);
  }


  private assertWarehouseOrderTransition(
    order: WarehouseOrderRow,
    action: 'RELEASE' | 'COMPLETE' | 'CANCEL' | 'START' | 'PARTIAL_COMPLETE' | 'RAISE_EXCEPTION',
    actor: AuthenticatedUser,
    reasonCode?: string | null,
  ): void {
    const evaluation = evaluateWorkflowTransition({
      entity: 'WAREHOUSE_ORDER',
      currentStatus: order.status,
      action,
      reasonCode,
      actorPermissions: actor.permissions,
    });

    if (!evaluation.allowed) {
      const message = evaluation.issues.map((issue) => issue.message).join(' ') || `Warehouse order action ${action} is not allowed from ${order.status}.`;
      throw new ConflictException(message);
    }
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findFirst({ where: warehouseReferenceWhere(warehouseReference) });
    if (!warehouse) throw new NotFoundException('Warehouse was not found');
    return warehouse;
  }

  private async resolveLocation(warehouseId: string, reference: string): Promise<WarehouseLocation> {
    const location = await this.prisma.warehouseLocation.findFirst({ where: locationReferenceWhere(warehouseId, reference) });
    if (!location) throw new NotFoundException('Warehouse location was not found');
    return location;
  }

  private async resolveSku(reference: string): Promise<Sku> {
    const sku = await this.prisma.sku.findFirst({ where: skuReferenceWhere(reference) });
    if (!sku) throw new NotFoundException('SKU was not found');
    return sku;
  }

  private async resolveLot(warehouseId: string, reference: string): Promise<{ id: string }> {
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM sku_lots WHERE warehouse_id = $1::uuid AND (id::text = $2 OR lot_code = $3) LIMIT 1`,
      warehouseId,
      reference,
      normalizeCode(reference),
    );
    const lot = rows[0];
    if (!lot) throw new NotFoundException('Lot was not found');
    return lot;
  }

  private async resolveOrder(warehouseId: string, reference: string): Promise<WarehouseOrderRow> {
    const rows = await this.prisma.$queryRawUnsafe<WarehouseOrderRow[]>(
      `${ORDER_SELECT} WHERE warehouse_id = $1::uuid AND (id::text = $2 OR order_number = $3) LIMIT 1`,
      warehouseId,
      reference,
      normalizeCode(reference),
    );
    const order = rows[0];
    if (!order) throw new NotFoundException('Warehouse order was not found');
    return order;
  }

  private async resolveLines(warehouseId: string, lines: CreateWarehouseOrderDto['lines']): Promise<ResolvedOrderLine[]> {
    const resolved: ResolvedOrderLine[] = [];
    for (const line of lines) {
      const sku = line.skuReference ? await this.resolveSku(line.skuReference) : null;
      const lot = line.lotReference ? await this.resolveLot(warehouseId, line.lotReference) : null;
      resolved.push({
        lineNumber: line.lineNumber.trim(),
        skuId: sku?.id ?? null,
        lotId: lot?.id ?? null,
        requestedQuantity: line.requestedQuantity ?? 1,
        serialRequired: line.serialRequired ?? false,
        metadata: line.metadata ?? {},
      });
    }
    return resolved;
  }

  private async readOrderById(orderId: string): Promise<WarehouseOrderResponse> {
    const rows = await this.prisma.$queryRawUnsafe<WarehouseOrderRow[]>(`${ORDER_SELECT} WHERE id = $1::uuid`, orderId);
    const order = assertSingle(rows, 'Warehouse order was not found');
    return this.hydrateOrder(order);
  }

  private async hydrateOrder(order: WarehouseOrderRow): Promise<WarehouseOrderResponse> {
    const lines = await this.readOrderLines(order.id);
    const taskLinks = await this.prisma.$queryRawUnsafe<WarehouseOrderTaskLinkRow[]>(
      `${TASK_LINK_SELECT} WHERE warehouse_order_id = $1::uuid ORDER BY created_at ASC`,
      order.id,
    );

    return {
      id: order.id,
      warehouseId: order.warehouse_id,
      ownerClientId: order.owner_client_id,
      orderNumber: order.order_number,
      orderType: order.order_type as WarehouseOrderType,
      status: order.status as WarehouseOrderStatus,
      priority: Number(order.priority),
      sourceType: order.source_type,
      sourceId: order.source_id,
      fromLocationId: order.from_location_id,
      toLocationId: order.to_location_id,
      dueAt: nullableDate(order.due_at),
      releasedAt: nullableDate(order.released_at),
      completedAt: nullableDate(order.completed_at),
      cancelledAt: nullableDate(order.cancelled_at),
      metadata: order.metadata,
      lines: lines.map(toLineResponse),
      taskLinks: taskLinks.map(toTaskLinkResponse),
      createdAt: toDate(order.created_at),
      updatedAt: toDate(order.updated_at),
    };
  }

  private async readOrderLines(orderId: string): Promise<WarehouseOrderLineRow[]> {
    return this.prisma.$queryRawUnsafe<WarehouseOrderLineRow[]>(
      `${LINE_SELECT} WHERE warehouse_order_id = $1::uuid ORDER BY line_number ASC`,
      orderId,
    );
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    resourceId: string,
    metadata: unknown,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType: 'warehouse_order',
        resourceId,
        metadata: JSON.parse(JSON.stringify(metadata ?? {})),
      },
    });
  }
}

const ORDER_COLUMNS = `id, warehouse_id, owner_client_id, order_number, order_type, status, priority, source_type, source_id, from_location_id, to_location_id, due_at, released_at, completed_at, cancelled_at, metadata, created_at, updated_at`;
const ORDER_SELECT = `SELECT ${ORDER_COLUMNS} FROM warehouse_orders`;
const LINE_COLUMNS = `id, warehouse_id, owner_client_id, warehouse_order_id, line_number, sku_id, lot_id, requested_quantity, allocated_quantity, completed_quantity, serial_required, status, metadata, created_at, updated_at`;
const LINE_SELECT = `SELECT ${LINE_COLUMNS} FROM warehouse_order_lines`;
const TASK_LINK_COLUMNS = `id, warehouse_order_id, warehouse_order_line_id, warehouse_task_id, created_at`;
const TASK_LINK_SELECT = `SELECT ${TASK_LINK_COLUMNS} FROM warehouse_order_tasks`;

function toLineResponse(row: WarehouseOrderLineRow): WarehouseOrderLineResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    warehouseOrderId: row.warehouse_order_id,
    lineNumber: row.line_number,
    skuId: row.sku_id,
    lotId: row.lot_id,
    requestedQuantity: Number(row.requested_quantity),
    allocatedQuantity: Number(row.allocated_quantity),
    completedQuantity: Number(row.completed_quantity),
    serialRequired: row.serial_required,
    status: row.status as WarehouseOrderLineStatus,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toTaskLinkResponse(row: WarehouseOrderTaskLinkRow): WarehouseOrderTaskLinkResponse {
  return {
    id: row.id,
    warehouseOrderId: row.warehouse_order_id,
    warehouseOrderLineId: row.warehouse_order_line_id,
    warehouseTaskId: row.warehouse_task_id,
    createdAt: toDate(row.created_at),
  };
}

function mapOrderTypeToTaskType(orderType: WarehouseOrderType): string {
  switch (orderType) {
    case WarehouseOrderType.ADJUSTMENT:
      return 'COUNT';
    case WarehouseOrderType.COUNT:
      return 'COUNT';
    case WarehouseOrderType.LOAD:
      return 'LOAD';
    case WarehouseOrderType.PICK:
      return 'PICK';
    case WarehouseOrderType.PUTAWAY:
      return 'PUTAWAY';
    case WarehouseOrderType.REPLENISH:
      return 'REPLENISH';
    case WarehouseOrderType.MOVE:
    default:
      return 'MOVE';
  }
}

function warehouseReferenceWhere(reference: string): Prisma.WarehouseWhereInput {
  return isUuid(reference) ? { OR: [{ id: reference }, { code: normalizeCode(reference) }] } : { code: normalizeCode(reference) };
}

function skuReferenceWhere(reference: string): Prisma.SkuWhereInput {
  return isUuid(reference) ? { OR: [{ id: reference }, { code: normalizeCode(reference) }, { barcode: reference.trim() }] } : { OR: [{ code: normalizeCode(reference) }, { barcode: reference.trim() }] };
}

function locationReferenceWhere(warehouseId: string, reference: string): Prisma.WarehouseLocationWhereInput {
  return isUuid(reference)
    ? { warehouseId, OR: [{ id: reference }, { code: normalizeCode(reference) }] }
    : { warehouseId, code: normalizeCode(reference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function generateOrderNumber(): string {
  return `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  if (!value) return null;
  return toDate(value);
}

function assertSingle<T>(rows: T[], message: string): T {
  const row = rows[0];
  if (!row) throw new NotFoundException(message);
  return row;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23505';
}
