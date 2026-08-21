import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AuthenticatedUser } from '../access-control';
import { normalizeOffsetPagination } from '../common';
import { PrismaService } from '../database';
import { Prisma, Sku, Warehouse, WarehouseLocation } from '../generated/prisma/client';
import { CreateLotDto } from './dto/create-lot.dto';
import { CreateSerialNumberEventDto } from './dto/create-serial-number-event.dto';
import { CreateSerialNumberDto } from './dto/create-serial-number.dto';
import { ListLotsQueryDto } from './dto/list-lots-query.dto';
import { ListSerialNumbersQueryDto } from './dto/list-serial-numbers-query.dto';
import { RecallReportQueryDto } from './dto/recall-report-query.dto';
import { UpdateLotDto } from './dto/update-lot.dto';
import { UpdateSerialNumberDto } from './dto/update-serial-number.dto';
import {
  LotQualityStatus,
  LotStatus,
  RecallGenealogyReportResponse,
  RecallReportInventoryImpact,
  RecallReportOrderImpact,
  RecallReportSerialItem,
  RecallReportShipmentImpact,
  SerialNumberEventResponse,
  SerialNumberResponse,
  SerialNumberStatus,
  SkuLotResponse,
} from './traceability.types';

interface SkuLotRow {
  id: string;
  warehouse_id: string;
  owner_client_id: string | null;
  sku_id: string;
  lot_code: string;
  batch: string | null;
  supplier_lot: string | null;
  quality_status: string;
  status: string;
  manufactured_at: Date | string | null;
  expiry_date: Date | string | null;
  received_at: Date | string | null;
  released_at: Date | string | null;
  quarantined_at: Date | string | null;
  quarantine_reason: string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SerialNumberRow {
  id: string;
  warehouse_id: string;
  owner_client_id: string | null;
  sku_id: string;
  lot_id: string | null;
  stock_quant_id: string | null;
  serial_number: string;
  status: string;
  first_received_at: Date | string | null;
  last_seen_location_id: string | null;
  inbound_shipment_line_id: string | null;
  outbound_order_line_id: string | null;
  metadata: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SerialNumberEventRow {
  id: string;
  warehouse_id: string;
  owner_client_id: string | null;
  serial_number_id: string;
  event_type: string;
  from_location_id: string | null;
  to_location_id: string | null;
  stock_quant_id: string | null;
  actor_user_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  metadata: unknown;
  occurred_at: Date | string;
  created_at: Date | string;
}

interface RecallSerialRow extends SerialNumberRow {
  sku_code: string | null;
  lot_code: string | null;
  owner_client_code: string | null;
  last_seen_location_code: string | null;
  inbound_shipment_number: string | null;
  inbound_line_number: string | null;
  outbound_order_number: string | null;
  outbound_line_number: string | null;
}

interface RecallInventoryRow {
  stock_quant_id: string;
  location_id: string;
  location_code: string | null;
  sku_id: string;
  sku_code: string | null;
  lot_id: string | null;
  lot_code: string | null;
  owner_client_id: string | null;
  owner_client_code: string | null;
  quantity: number;
  reserved_quantity: number;
  status: string;
}

interface RecallOrderRow {
  outbound_order_id: string;
  order_number: string;
  owner_client_id: string | null;
  owner_client_code: string | null;
  status: string;
  serial_number: string;
}

interface RecallShipmentRow {
  shipment_id: string;
  shipment_number: string;
  package_id: string | null;
  package_code: string | null;
  carrier: string | null;
  service_level: string | null;
  tracking_number: string | null;
  label_reference: string | null;
  tracking_status: string | null;
  serial_number: string;
}

@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async listLots(warehouseReference: string, query: ListLotsQueryDto): Promise<SkuLotResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const sku = query.skuReference ? await this.resolveSku(query.skuReference) : null;
    const conditions = ['warehouse_id = $1::uuid'];
    const values: unknown[] = [warehouse.id];
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });

    if (sku) {
      values.push(sku.id);
      conditions.push(`sku_id = $${values.length}::uuid`);
    }
    if (query.status) {
      values.push(query.status);
      conditions.push(`status = $${values.length}::"LotStatus"`);
    }
    if (query.ownerClientId) {
      values.push(query.ownerClientId);
      conditions.push(`owner_client_id = $${values.length}::uuid`);
    }

    const rows = await this.prisma.$queryRawUnsafe<SkuLotRow[]>(
      `${LOT_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY expiry_date ASC NULLS LAST, lot_code ASC LIMIT $${values.length + 1}::int OFFSET $${values.length + 2}::int`,
      ...values,
      page.take,
      page.skip,
    );
    return rows.map(toLotResponse);
  }

  async getLot(warehouseReference: string, lotReference: string): Promise<SkuLotResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const lot = await this.resolveLot(warehouse.id, lotReference);
    return toLotResponse(lot);
  }

  async createLot(
    warehouseReference: string,
    dto: CreateLotDto,
    actor: AuthenticatedUser,
  ): Promise<SkuLotResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const sku = await this.resolveSku(dto.skuReference);

    try {
      const rows = await this.prisma.$queryRawUnsafe<SkuLotRow[]>(
        `
          INSERT INTO sku_lots
            (warehouse_id, owner_client_id, sku_id, lot_code, batch, supplier_lot, quality_status, status,
             manufactured_at, expiry_date, received_at, released_at, quarantined_at, quarantine_reason, metadata,
             created_at, updated_at)
          VALUES
            ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::"LotQualityStatus", $8::"LotStatus",
             $9::date, $10::date, NOW(), $11, $12, $13, $14::jsonb, NOW(), NOW())
          RETURNING ${LOT_COLUMNS}
        `,
        warehouse.id,
        dto.ownerClientId ?? null,
        sku.id,
        normalizeCode(dto.lotCode),
        normalizeNullableString(dto.batch),
        normalizeNullableString(dto.supplierLot),
        dto.qualityStatus ?? LotQualityStatus.RELEASED,
        dto.status ?? LotStatus.ACTIVE,
        dto.manufacturedAt ?? null,
        dto.expiryDate ?? null,
        dto.status === LotStatus.RELEASED ? new Date() : null,
        dto.status === LotStatus.QUARANTINED ? new Date() : null,
        null,
        JSON.stringify(dto.metadata ?? {}),
      );
      const lot = assertSingle(rows, 'Lot was not created');
      await this.writeAudit(actor, warehouse.id, 'sku_lot.created', 'sku_lot', lot.id, lot);
      return toLotResponse(lot);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002') || isUniqueViolation(error)) {
        throw new ConflictException('Lot already exists for this SKU and warehouse');
      }
      throw error;
    }
  }

  async updateLot(
    warehouseReference: string,
    lotReference: string,
    dto: UpdateLotDto,
    actor: AuthenticatedUser,
  ): Promise<SkuLotResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existing = await this.resolveLot(warehouse.id, lotReference);
    const patch: Record<string, unknown> = {
      batch: normalizeNullableString(dto.batch),
      supplier_lot: normalizeNullableString(dto.supplierLot),
      quality_status: dto.qualityStatus,
      status: dto.status,
      manufactured_at: dto.manufacturedAt,
      expiry_date: dto.expiryDate,
      quarantine_reason: normalizeNullableString(dto.quarantineReason),
      metadata: dto.metadata === undefined ? undefined : JSON.stringify(dto.metadata),
      released_at: dto.status === LotStatus.RELEASED ? new Date() : undefined,
      quarantined_at: dto.status === LotStatus.QUARANTINED ? new Date() : undefined,
    };

    const lot = await this.updateRow<SkuLotRow>({
      table: 'sku_lots',
      id: existing.id,
      enumColumns: { quality_status: 'LotQualityStatus', status: 'LotStatus' },
      jsonColumns: new Set(['metadata']),
      patch,
      select: LOT_SELECT,
    });
    await this.writeAudit(actor, warehouse.id, 'sku_lot.updated', 'sku_lot', lot.id, lot);
    return toLotResponse(lot);
  }

  async listSerialNumbers(
    warehouseReference: string,
    query: ListSerialNumbersQueryDto,
  ): Promise<SerialNumberResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const sku = query.skuReference ? await this.resolveSku(query.skuReference) : null;
    const lot = query.lotReference ? await this.resolveLot(warehouse.id, query.lotReference) : null;
    const conditions = ['warehouse_id = $1::uuid'];
    const values: unknown[] = [warehouse.id];
    const page = normalizeOffsetPagination(query, { defaultTake: 100, maxTake: 250 });

    if (sku) {
      values.push(sku.id);
      conditions.push(`sku_id = $${values.length}::uuid`);
    }
    if (lot) {
      values.push(lot.id);
      conditions.push(`lot_id = $${values.length}::uuid`);
    }
    if (query.status) {
      values.push(query.status);
      conditions.push(`status = $${values.length}::"SerialNumberStatus"`);
    }

    const rows = await this.prisma.$queryRawUnsafe<SerialNumberRow[]>(
      `${SERIAL_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY serial_number ASC LIMIT $${values.length + 1}::int OFFSET $${values.length + 2}::int`,
      ...values,
      page.take,
      page.skip,
    );
    return rows.map(toSerialResponse);
  }

  async getSerialNumber(
    warehouseReference: string,
    serialReference: string,
  ): Promise<SerialNumberResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const serial = await this.resolveSerialNumber(warehouse.id, serialReference);
    return toSerialResponse(serial);
  }

  async createSerialNumber(
    warehouseReference: string,
    dto: CreateSerialNumberDto,
    actor: AuthenticatedUser,
  ): Promise<SerialNumberResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const sku = await this.resolveSku(dto.skuReference);
    const lot = dto.lotReference ? await this.resolveLot(warehouse.id, dto.lotReference) : null;
    const location = dto.lastSeenLocationReference
      ? await this.resolveLocation(warehouse.id, dto.lastSeenLocationReference)
      : null;

    try {
      const rows = await this.prisma.$queryRawUnsafe<SerialNumberRow[]>(
        `
          INSERT INTO serial_numbers
            (warehouse_id, owner_client_id, sku_id, lot_id, stock_quant_id, serial_number, status,
             first_received_at, last_seen_location_id, metadata, created_at, updated_at)
          VALUES
            ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7::"SerialNumberStatus",
             CASE WHEN $7::"SerialNumberStatus" IN ('AVAILABLE', 'EXPECTED') THEN NOW() ELSE NULL END,
             $8::uuid, $9::jsonb, NOW(), NOW())
          RETURNING ${SERIAL_COLUMNS}
        `,
        warehouse.id,
        dto.ownerClientId ?? null,
        sku.id,
        lot?.id ?? null,
        dto.stockQuantId ?? null,
        normalizeSerial(dto.serialNumber),
        dto.status ?? SerialNumberStatus.AVAILABLE,
        location?.id ?? null,
        JSON.stringify(dto.metadata ?? {}),
      );
      const serial = assertSingle(rows, 'Serial number was not created');
      await this.recordSerialEvent(warehouse.id, serial, {
        eventType: 'CREATED',
        toLocationId: location?.id ?? null,
        stockQuantId: dto.stockQuantId ?? null,
        actorUserId: actor.id,
        referenceType: 'SERIAL_NUMBER',
        referenceId: serial.id,
        metadata: { status: serial.status },
      });
      await this.writeAudit(actor, warehouse.id, 'serial_number.created', 'serial_number', serial.id, serial);
      return toSerialResponse(serial);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Serial number already exists in this warehouse');
      }
      throw error;
    }
  }

  async updateSerialNumber(
    warehouseReference: string,
    serialReference: string,
    dto: UpdateSerialNumberDto,
    actor: AuthenticatedUser,
  ): Promise<SerialNumberResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const existing = await this.resolveSerialNumber(warehouse.id, serialReference);
    const location = dto.lastSeenLocationReference === undefined
      ? undefined
      : dto.lastSeenLocationReference === null
        ? null
        : await this.resolveLocation(warehouse.id, dto.lastSeenLocationReference);

    const patch: Record<string, unknown> = {
      status: dto.status,
      last_seen_location_id: location === undefined ? undefined : location?.id ?? null,
      stock_quant_id: dto.stockQuantId,
      metadata: dto.metadata === undefined ? undefined : JSON.stringify(dto.metadata),
    };

    const serial = await this.updateRow<SerialNumberRow>({
      table: 'serial_numbers',
      id: existing.id,
      enumColumns: { status: 'SerialNumberStatus' },
      jsonColumns: new Set(['metadata']),
      patch,
      select: SERIAL_SELECT,
    });
    await this.recordSerialEvent(warehouse.id, serial, {
      eventType: dto.status ? `STATUS_${dto.status}` : 'UPDATED',
      toLocationId: location === undefined ? serial.last_seen_location_id : location?.id ?? null,
      stockQuantId: serial.stock_quant_id,
      actorUserId: actor.id,
      referenceType: 'SERIAL_NUMBER',
      referenceId: serial.id,
      metadata: { previousStatus: existing.status, status: serial.status },
    });
    await this.writeAudit(actor, warehouse.id, 'serial_number.updated', 'serial_number', serial.id, serial);
    return toSerialResponse(serial);
  }

  async listSerialNumberEvents(
    warehouseReference: string,
    serialReference: string,
  ): Promise<SerialNumberEventResponse[]> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const serial = await this.resolveSerialNumber(warehouse.id, serialReference);
    const rows = await this.prisma.$queryRawUnsafe<SerialNumberEventRow[]>(
      `${SERIAL_EVENT_SELECT} WHERE serial_number_id = $1::uuid ORDER BY occurred_at DESC, created_at DESC`,
      serial.id,
    );
    return rows.map(toSerialEventResponse);
  }

  async getRecallGenealogyReport(
    warehouseReference: string,
    query: RecallReportQueryDto,
    actor: AuthenticatedUser,
  ): Promise<RecallGenealogyReportResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const lot = query.lotReference ? await this.resolveLot(warehouse.id, query.lotReference) : null;
    const sku = query.skuReference ? await this.resolveSku(query.skuReference) : null;
    const limit = Math.max(1, Math.min(query.limit ?? 500, 5000));
    const conditions = ['sn.warehouse_id = $1::uuid'];
    const values: unknown[] = [warehouse.id];

    if (lot) {
      values.push(lot.id);
      conditions.push(`sn.lot_id = $${values.length}::uuid`);
    }
    if (sku) {
      values.push(sku.id);
      conditions.push(`sn.sku_id = $${values.length}::uuid`);
    }
    if (query.serialNumber) {
      values.push(query.serialNumber, normalizeSerial(query.serialNumber));
      conditions.push(`(sn.id::text = $${values.length - 1} OR sn.serial_number = $${values.length})`);
    }
    if (query.ownerClientId) {
      values.push(query.ownerClientId);
      conditions.push(`sn.owner_client_id = $${values.length}::uuid`);
    }

    values.push(limit);
    const serialRows = await this.prisma.$queryRawUnsafe<RecallSerialRow[]>(
      `${RECALL_SERIAL_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY sn.updated_at DESC, sn.serial_number ASC LIMIT $${values.length}::int`,
      ...values,
    );
    const serialIds = serialRows.map((row) => row.id);
    const lotRows = await this.getRecallLots(warehouse.id, lot, serialRows);
    const [inventoryRows, orderRows, shipmentRows, eventRows] = await Promise.all([
      this.getRecallInventory(warehouse.id, lot?.id ?? null, sku?.id ?? null, query.ownerClientId ?? null, serialRows),
      this.getRecallOrders(warehouse.id, serialIds),
      this.getRecallShipments(warehouse.id, serialIds),
      query.includeEvents === false ? Promise.resolve([]) : this.getRecallEvents(serialIds),
    ]);
    const reportId = randomUUID();
    const serials = serialRows.map(toRecallSerialResponse);
    const affectedOrders = groupRecallOrders(orderRows);
    const affectedShipments = groupRecallShipments(shipmentRows);
    const affectedClientIds = new Set([
      ...serials.map((serial) => serial.ownerClientId).filter(isString),
      ...affectedOrders.map((order) => order.ownerClientId).filter(isString),
      ...inventoryRows.map((row) => row.owner_client_id).filter(isString),
    ]);
    const response: RecallGenealogyReportResponse = {
      reportId,
      warehouseId: warehouse.id,
      generatedAt: new Date().toISOString(),
      criteria: {
        lotReference: query.lotReference ?? null,
        serialNumber: query.serialNumber ?? null,
        skuReference: query.skuReference ?? null,
        ownerClientId: query.ownerClientId ?? null,
        limit,
      },
      summary: {
        serialCount: serials.length,
        lotCount: lotRows.length,
        inventoryQuantCount: inventoryRows.length,
        affectedOrderCount: affectedOrders.length,
        affectedShipmentCount: affectedShipments.length,
        affectedClientCount: affectedClientIds.size,
        shippedSerialCount: serials.filter((serial) => serial.status === SerialNumberStatus.SHIPPED).length,
        blockedOrDamagedSerialCount: serials.filter((serial) => BLOCKED_OR_DAMAGED_SERIAL_STATUSES.has(serial.status)).length,
      },
      lots: lotRows.map(toLotResponse),
      serials,
      inventory: inventoryRows.map(toRecallInventoryImpact),
      affectedOrders,
      affectedShipments,
      events: eventRows.map(toSerialEventResponse),
    };

    await this.writeAudit(actor, warehouse.id, 'traceability.recall_report.generated', 'traceability_recall_report', reportId, {
      criteria: response.criteria,
      summary: response.summary,
    });

    return response;
  }

  async createSerialNumberEvent(
    warehouseReference: string,
    serialReference: string,
    dto: CreateSerialNumberEventDto,
    actor: AuthenticatedUser,
  ): Promise<SerialNumberEventResponse> {
    const warehouse = await this.resolveWarehouse(warehouseReference);
    const serial = await this.resolveSerialNumber(warehouse.id, serialReference);
    const from = dto.fromLocationReference ? await this.resolveLocation(warehouse.id, dto.fromLocationReference) : null;
    const to = dto.toLocationReference ? await this.resolveLocation(warehouse.id, dto.toLocationReference) : null;

    const event = await this.recordSerialEvent(warehouse.id, serial, {
      eventType: normalizeCode(dto.eventType),
      fromLocationId: from?.id ?? null,
      toLocationId: to?.id ?? null,
      stockQuantId: dto.stockQuantId ?? serial.stock_quant_id,
      actorUserId: actor.id,
      referenceType: normalizeNullableString(dto.referenceType),
      referenceId: normalizeNullableString(dto.referenceId),
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined,
      metadata: dto.metadata ?? {},
    });

    if (to) {
      await this.prisma.$executeRawUnsafe(
        `UPDATE serial_numbers SET last_seen_location_id = $2::uuid, updated_at = NOW() WHERE id = $1::uuid`,
        serial.id,
        to.id,
      );
    }

    return toSerialEventResponse(event);
  }

  private async resolveWarehouse(warehouseReference: string): Promise<Warehouse> {
    const warehouse = await this.prisma.warehouse.findFirst({ where: warehouseReferenceWhere(warehouseReference) });
    if (!warehouse) throw new NotFoundException('Warehouse was not found');
    return warehouse;
  }

  private async resolveSku(skuReference: string): Promise<Sku> {
    const sku = await this.prisma.sku.findFirst({ where: skuReferenceWhere(skuReference) });
    if (!sku) throw new NotFoundException('SKU was not found');
    return sku;
  }

  private async resolveLocation(warehouseId: string, locationReference: string): Promise<WarehouseLocation> {
    const location = await this.prisma.warehouseLocation.findFirst({ where: locationReferenceWhere(warehouseId, locationReference) });
    if (!location) throw new NotFoundException('Warehouse location was not found');
    return location;
  }

  private async resolveLot(warehouseId: string, lotReference: string): Promise<SkuLotRow> {
    const rows = await this.prisma.$queryRawUnsafe<SkuLotRow[]>(
      `${LOT_SELECT} WHERE warehouse_id = $1::uuid AND (id::text = $2 OR lot_code = $3) LIMIT 1`,
      warehouseId,
      lotReference,
      normalizeCode(lotReference),
    );
    const lot = rows[0];
    if (!lot) throw new NotFoundException('Lot was not found');
    return lot;
  }

  private async resolveSerialNumber(warehouseId: string, serialReference: string): Promise<SerialNumberRow> {
    const rows = await this.prisma.$queryRawUnsafe<SerialNumberRow[]>(
      `${SERIAL_SELECT} WHERE warehouse_id = $1::uuid AND (id::text = $2 OR serial_number = $3) LIMIT 1`,
      warehouseId,
      serialReference,
      normalizeSerial(serialReference),
    );
    const serial = rows[0];
    if (!serial) throw new NotFoundException('Serial number was not found');
    return serial;
  }

  private async getRecallLots(
    warehouseId: string,
    explicitLot: SkuLotRow | null,
    serialRows: RecallSerialRow[],
  ): Promise<SkuLotRow[]> {
    if (explicitLot) return [explicitLot];
    const lotIds = uniqueStrings(serialRows.map((serial) => serial.lot_id));
    if (lotIds.length === 0) return [];
    const { clause, values } = buildUuidInClause('id', lotIds, 2);
    return this.prisma.$queryRawUnsafe<SkuLotRow[]>(
      `${LOT_SELECT} WHERE warehouse_id = $1::uuid AND ${clause} ORDER BY expiry_date ASC NULLS LAST, lot_code ASC`,
      warehouseId,
      ...values,
    );
  }

  private async getRecallInventory(
    warehouseId: string,
    lotId: string | null,
    skuId: string | null,
    ownerClientId: string | null,
    serialRows: RecallSerialRow[],
  ): Promise<RecallInventoryRow[]> {
    const conditions = ['sq.warehouse_id = $1::uuid'];
    const values: unknown[] = [warehouseId];
    const quantIds = uniqueStrings(serialRows.map((serial) => serial.stock_quant_id));

    if (quantIds.length > 0) {
      const inClause = buildUuidInClause('sq.id', quantIds, values.length + 1);
      conditions.push(inClause.clause);
      values.push(...inClause.values);
    } else {
      if (lotId) {
        values.push(lotId);
        conditions.push(`sq.lot_id = $${values.length}::uuid`);
      }
      if (skuId) {
        values.push(skuId);
        conditions.push(`sq.sku_id = $${values.length}::uuid`);
      }
      if (ownerClientId) {
        values.push(ownerClientId);
        conditions.push(`sq.owner_client_id = $${values.length}::uuid`);
      }
    }

    return this.prisma.$queryRawUnsafe<RecallInventoryRow[]>(
      `
        SELECT
          sq.id AS stock_quant_id,
          sq.location_id,
          wl.code AS location_code,
          sq.sku_id,
          s.code AS sku_code,
          sq.lot_id,
          sl.lot_code,
          sq.owner_client_id,
          wc.code AS owner_client_code,
          sq.quantity,
          sq.reserved_quantity,
          sq.status::text AS status
        FROM stock_quants sq
        LEFT JOIN skus s ON s.id = sq.sku_id
        LEFT JOIN sku_lots sl ON sl.id = sq.lot_id
        LEFT JOIN warehouse_locations wl ON wl.id = sq.location_id
        LEFT JOIN wms_clients wc ON wc.id = sq.owner_client_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY wl.code ASC NULLS LAST, s.code ASC NULLS LAST
      `,
      ...values,
    );
  }

  private async getRecallOrders(warehouseId: string, serialIds: string[]): Promise<RecallOrderRow[]> {
    if (serialIds.length === 0) return [];
    const inClause = buildUuidInClause('sn.id', serialIds, 2);
    return this.prisma.$queryRawUnsafe<RecallOrderRow[]>(
      `
        SELECT
          oo.id AS outbound_order_id,
          oo.order_number,
          oo.owner_client_id,
          wc.code AS owner_client_code,
          oo.status::text AS status,
          sn.serial_number
        FROM serial_numbers sn
        JOIN outbound_order_lines ool ON ool.id = sn.outbound_order_line_id
        JOIN outbound_orders oo ON oo.id = ool.order_id
        LEFT JOIN wms_clients wc ON wc.id = oo.owner_client_id
        WHERE sn.warehouse_id = $1::uuid AND ${inClause.clause}
        ORDER BY oo.order_number ASC, sn.serial_number ASC
      `,
      warehouseId,
      ...inClause.values,
    );
  }

  private async getRecallShipments(warehouseId: string, serialIds: string[]): Promise<RecallShipmentRow[]> {
    if (serialIds.length === 0) return [];
    const inClause = buildUuidInClause('sn.id', serialIds, 2);
    return this.prisma.$queryRawUnsafe<RecallShipmentRow[]>(
      `
        WITH latest_tracking AS (
          SELECT DISTINCT ON (warehouse_id, tracking_number)
            warehouse_id,
            tracking_number,
            status::text AS tracking_status,
            occurred_at
          FROM carrier_tracking_events
          WHERE warehouse_id = $1::uuid AND tracking_number IS NOT NULL
          ORDER BY warehouse_id, tracking_number, occurred_at DESC
        )
        SELECT
          sh.id AS shipment_id,
          sh.shipment_number,
          sp.id AS package_id,
          sp.package_code,
          COALESCE(cl.carrier, sh.carrier) AS carrier,
          COALESCE(cl.service_level, sh.service_level) AS service_level,
          COALESCE(cl.tracking_number, sp.tracking_number, sh.tracking_reference) AS tracking_number,
          cl.label_reference,
          lt.tracking_status,
          sn.serial_number
        FROM serial_numbers sn
        JOIN outbound_order_lines ool ON ool.id = sn.outbound_order_line_id
        LEFT JOIN package_contents pc ON pc.outbound_order_line_id = ool.id
        LEFT JOIN shipment_packages sp ON sp.id = pc.package_id
        LEFT JOIN shipments sh ON sh.id = sp.shipment_id
        LEFT JOIN carrier_labels cl ON cl.package_id = sp.id
        LEFT JOIN latest_tracking lt ON lt.warehouse_id = $1::uuid AND lt.tracking_number = COALESCE(cl.tracking_number, sp.tracking_number, sh.tracking_reference)
        WHERE sn.warehouse_id = $1::uuid AND ${inClause.clause} AND sh.id IS NOT NULL
        ORDER BY sh.shipment_number ASC, sp.package_code ASC NULLS LAST, sn.serial_number ASC
      `,
      warehouseId,
      ...inClause.values,
    );
  }

  private async getRecallEvents(serialIds: string[]): Promise<SerialNumberEventRow[]> {
    if (serialIds.length === 0) return [];
    const inClause = buildUuidInClause('serial_number_id', serialIds, 1);
    return this.prisma.$queryRawUnsafe<SerialNumberEventRow[]>(
      `${SERIAL_EVENT_SELECT} WHERE ${inClause.clause} ORDER BY occurred_at ASC, created_at ASC`,
      ...inClause.values,
    );
  }

  private async recordSerialEvent(
    warehouseId: string,
    serial: SerialNumberRow,
    input: {
      eventType: string;
      fromLocationId?: string | null;
      toLocationId?: string | null;
      stockQuantId?: string | null;
      actorUserId?: string | null;
      referenceType?: string | null;
      referenceId?: string | null;
      occurredAt?: Date;
      metadata?: Record<string, unknown>;
    },
  ): Promise<SerialNumberEventRow> {
    const rows = await this.prisma.$queryRawUnsafe<SerialNumberEventRow[]>(
      `
        INSERT INTO serial_number_events
          (warehouse_id, owner_client_id, serial_number_id, event_type, from_location_id, to_location_id,
           stock_quant_id, actor_user_id, reference_type, reference_id, metadata, occurred_at, created_at)
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::uuid, $6::uuid, $7::uuid, $8::uuid, $9, $10, $11::jsonb, COALESCE($12, NOW()), NOW())
        RETURNING ${SERIAL_EVENT_COLUMNS}
      `,
      warehouseId,
      serial.owner_client_id,
      serial.id,
      normalizeCode(input.eventType),
      input.fromLocationId ?? null,
      input.toLocationId ?? null,
      input.stockQuantId ?? null,
      input.actorUserId ?? null,
      input.referenceType ?? null,
      input.referenceId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.occurredAt ?? null,
    );
    return assertSingle(rows, 'Serial event was not created');
  }

  private async updateRow<T>(input: {
    table: TraceabilityUpdateTable;
    id: string;
    patch: Record<string, unknown>;
    enumColumns?: Record<string, string>;
    jsonColumns?: Set<string>;
    select: string;
  }): Promise<T> {
    const tablePolicy = TRACEABILITY_UPDATE_POLICIES[input.table];
    if (tablePolicy.select !== input.select) {
      throw new Error(`Unsafe traceability select for ${input.table}`);
    }

    const entries = Object.entries(input.patch).filter(([, value]) => value !== undefined);
    if (entries.length > 0) {
      const assignments = entries.map(([column], index) => {
        assertSafeTraceabilityColumn(input.table, column);
        const placeholder = `$${index + 2}`;
        if (input.jsonColumns?.has(column)) return `${column} = ${placeholder}::jsonb`;
        const enumType = input.enumColumns?.[column];
        if (enumType) {
          assertSafeTraceabilityEnum(enumType);
          return `${column} = ${placeholder}::"${enumType}"`;
        }
        if (column.endsWith('_at') || column.endsWith('_date')) return `${column} = ${placeholder}`;
        if (column.endsWith('_id')) return `${column} = ${placeholder}::uuid`;
        return `${column} = ${placeholder}`;
      }).join(', ');
      await this.prisma.$executeRawUnsafe(
        `UPDATE ${input.table} SET ${assignments}, updated_at = NOW() WHERE id = $1::uuid`,
        input.id,
        ...entries.map(([, value]) => value),
      );
    }

    const rows = await this.prisma.$queryRawUnsafe<T[]>(`${input.select} WHERE id = $1::uuid`, input.id);
    return assertSingle(rows, 'Row was not found after update');
  }

  private async writeAudit(
    actor: AuthenticatedUser,
    warehouseId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    metadata: unknown,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId,
        action,
        resourceType,
        resourceId,
        metadata: JSON.parse(JSON.stringify(metadata ?? {})),
      },
    });
  }
}

const LOT_COLUMNS = `id, warehouse_id, owner_client_id, sku_id, lot_code, batch, supplier_lot, quality_status, status, manufactured_at, expiry_date, received_at, released_at, quarantined_at, quarantine_reason, metadata, created_at, updated_at`;
const BLOCKED_OR_DAMAGED_SERIAL_STATUSES = new Set<SerialNumberStatus>([
  SerialNumberStatus.BLOCKED,
  SerialNumberStatus.DAMAGED,
  SerialNumberStatus.SCRAPPED,
]);

const LOT_SELECT = `SELECT ${LOT_COLUMNS} FROM sku_lots`;
const SERIAL_COLUMNS = `id, warehouse_id, owner_client_id, sku_id, lot_id, stock_quant_id, serial_number, status, first_received_at, last_seen_location_id, inbound_shipment_line_id, outbound_order_line_id, metadata, created_at, updated_at`;
const SERIAL_SELECT = `SELECT ${SERIAL_COLUMNS} FROM serial_numbers`;

type TraceabilityUpdateTable = 'sku_lots' | 'serial_numbers';

const TRACEABILITY_UPDATE_POLICIES: Record<TraceabilityUpdateTable, {
  select: string;
  columns: ReadonlySet<string>;
}> = {
  sku_lots: {
    select: LOT_SELECT,
    columns: new Set([
      'batch',
      'expiry_date',
      'manufactured_at',
      'metadata',
      'quality_status',
      'quarantine_reason',
      'quarantined_at',
      'received_at',
      'released_at',
      'status',
      'supplier_lot',
    ]),
  },
  serial_numbers: {
    select: SERIAL_SELECT,
    columns: new Set([
      'last_seen_location_id',
      'metadata',
      'status',
      'stock_quant_id',
    ]),
  },
};

const TRACEABILITY_ENUM_TYPES = new Set(['LotQualityStatus', 'LotStatus', 'SerialNumberStatus']);

function assertSafeTraceabilityColumn(table: TraceabilityUpdateTable, column: string): void {
  if (!TRACEABILITY_UPDATE_POLICIES[table].columns.has(column)) {
    throw new Error(`Unsafe traceability column for ${table}: ${column}`);
  }
}

function assertSafeTraceabilityEnum(enumType: string): void {
  if (!TRACEABILITY_ENUM_TYPES.has(enumType)) {
    throw new Error(`Unsafe traceability enum type: ${enumType}`);
  }
}
const SERIAL_EVENT_COLUMNS = `id, warehouse_id, owner_client_id, serial_number_id, event_type, from_location_id, to_location_id, stock_quant_id, actor_user_id, reference_type, reference_id, metadata, occurred_at, created_at`;
const SERIAL_EVENT_SELECT = `SELECT ${SERIAL_EVENT_COLUMNS} FROM serial_number_events`;
const RECALL_SERIAL_SELECT = `
  SELECT
    sn.id,
    sn.warehouse_id,
    sn.owner_client_id,
    sn.sku_id,
    sn.lot_id,
    sn.stock_quant_id,
    sn.serial_number,
    sn.status,
    sn.first_received_at,
    sn.last_seen_location_id,
    sn.inbound_shipment_line_id,
    sn.outbound_order_line_id,
    sn.metadata,
    sn.created_at,
    sn.updated_at,
    s.code AS sku_code,
    sl.lot_code,
    wc.code AS owner_client_code,
    wl.code AS last_seen_location_code,
    ish.shipment_number AS inbound_shipment_number,
    isl.line_number AS inbound_line_number,
    oo.order_number AS outbound_order_number,
    ool.line_number AS outbound_line_number
  FROM serial_numbers sn
  LEFT JOIN skus s ON s.id = sn.sku_id
  LEFT JOIN sku_lots sl ON sl.id = sn.lot_id
  LEFT JOIN wms_clients wc ON wc.id = sn.owner_client_id
  LEFT JOIN warehouse_locations wl ON wl.id = sn.last_seen_location_id
  LEFT JOIN inbound_shipment_lines isl ON isl.id = sn.inbound_shipment_line_id
  LEFT JOIN inbound_shipments ish ON ish.id = isl.shipment_id
  LEFT JOIN outbound_order_lines ool ON ool.id = sn.outbound_order_line_id
  LEFT JOIN outbound_orders oo ON oo.id = ool.order_id
`;

function toLotResponse(row: SkuLotRow): SkuLotResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    skuId: row.sku_id,
    lotCode: row.lot_code,
    batch: row.batch,
    supplierLot: row.supplier_lot,
    qualityStatus: row.quality_status as LotQualityStatus,
    status: row.status as LotStatus,
    manufacturedAt: nullableDate(row.manufactured_at),
    expiryDate: nullableDate(row.expiry_date),
    receivedAt: nullableDate(row.received_at),
    releasedAt: nullableDate(row.released_at),
    quarantinedAt: nullableDate(row.quarantined_at),
    quarantineReason: row.quarantine_reason,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toSerialResponse(row: SerialNumberRow): SerialNumberResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    skuId: row.sku_id,
    lotId: row.lot_id,
    stockQuantId: row.stock_quant_id,
    serialNumber: row.serial_number,
    status: row.status as SerialNumberStatus,
    firstReceivedAt: nullableDate(row.first_received_at),
    lastSeenLocationId: row.last_seen_location_id,
    inboundShipmentLineId: row.inbound_shipment_line_id,
    outboundOrderLineId: row.outbound_order_line_id,
    metadata: row.metadata,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function toSerialEventResponse(row: SerialNumberEventRow): SerialNumberEventResponse {
  return {
    id: row.id,
    warehouseId: row.warehouse_id,
    ownerClientId: row.owner_client_id,
    serialNumberId: row.serial_number_id,
    eventType: row.event_type,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    stockQuantId: row.stock_quant_id,
    actorUserId: row.actor_user_id,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    metadata: row.metadata,
    occurredAt: toDate(row.occurred_at),
    createdAt: toDate(row.created_at),
  };
}

function toRecallSerialResponse(row: RecallSerialRow): RecallReportSerialItem {
  return {
    ...toSerialResponse(row),
    skuCode: row.sku_code,
    lotCode: row.lot_code,
    ownerClientCode: row.owner_client_code,
    lastSeenLocationCode: row.last_seen_location_code,
    inboundShipmentNumber: row.inbound_shipment_number,
    inboundLineNumber: row.inbound_line_number,
    outboundOrderNumber: row.outbound_order_number,
    outboundLineNumber: row.outbound_line_number,
  };
}

function toRecallInventoryImpact(row: RecallInventoryRow): RecallReportInventoryImpact {
  return {
    stockQuantId: row.stock_quant_id,
    locationId: row.location_id,
    locationCode: row.location_code,
    skuId: row.sku_id,
    skuCode: row.sku_code,
    lotId: row.lot_id,
    lotCode: row.lot_code,
    ownerClientId: row.owner_client_id,
    ownerClientCode: row.owner_client_code,
    quantity: row.quantity,
    reservedQuantity: row.reserved_quantity,
    status: row.status,
  };
}

function groupRecallOrders(rows: RecallOrderRow[]): RecallReportOrderImpact[] {
  const groups = new Map<string, RecallReportOrderImpact>();
  for (const row of rows) {
    const existing = groups.get(row.outbound_order_id);
    if (existing) {
      existing.serialNumbers.push(row.serial_number);
      existing.serialCount = existing.serialNumbers.length;
      continue;
    }
    groups.set(row.outbound_order_id, {
      outboundOrderId: row.outbound_order_id,
      orderNumber: row.order_number,
      ownerClientId: row.owner_client_id,
      ownerClientCode: row.owner_client_code,
      status: row.status,
      serialCount: 1,
      serialNumbers: [row.serial_number],
    });
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    serialNumbers: uniqueStrings(group.serialNumbers).sort(),
    serialCount: uniqueStrings(group.serialNumbers).length,
  }));
}

function groupRecallShipments(rows: RecallShipmentRow[]): RecallReportShipmentImpact[] {
  const groups = new Map<string, RecallReportShipmentImpact>();
  for (const row of rows) {
    const key = `${row.shipment_id}:${row.package_id ?? 'shipment'}:${row.label_reference ?? 'label'}`;
    const existing = groups.get(key);
    if (existing) {
      existing.serialNumbers.push(row.serial_number);
      existing.serialCount = existing.serialNumbers.length;
      continue;
    }
    groups.set(key, {
      shipmentId: row.shipment_id,
      shipmentNumber: row.shipment_number,
      packageId: row.package_id,
      packageCode: row.package_code,
      carrier: row.carrier,
      serviceLevel: row.service_level,
      trackingNumber: row.tracking_number,
      labelReference: row.label_reference,
      trackingStatus: row.tracking_status,
      serialCount: 1,
      serialNumbers: [row.serial_number],
    });
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    serialNumbers: uniqueStrings(group.serialNumbers).sort(),
    serialCount: uniqueStrings(group.serialNumbers).length,
  }));
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

function normalizeSerial(value: string): string {
  return value.trim();
}

function normalizeNullableString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter(isString)));
}

function buildUuidInClause(column: string, values: string[], startIndex: number): { clause: string; values: string[] } {
  const placeholders = values.map((_value, index) => `$${startIndex + index}::uuid`).join(', ');
  return { clause: `${column} IN (${placeholders})`, values };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
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

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
