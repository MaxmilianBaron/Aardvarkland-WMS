import type { Order, PackingLine, Severity, Shipment, StockQuant, WarehouseTask, WavePlan } from '../types/wms';

type AnyRecord = Record<string, unknown>;

export interface CarrierCardView {
  name: string;
  status: string;
  labels: number;
  incidents: number;
}

export interface WarehouseView {
  id: string;
  code: string;
  name: string;
  mode: string;
}

function record(value: unknown): AnyRecord {
  return value && typeof value === 'object' ? value as AnyRecord : {};
}

function array(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const item = record(value);
  if (Array.isArray(item.items)) return item.items;
  if (Array.isArray(item.results)) return item.results;
  if (Array.isArray(item.data)) return item.data;
  return [];
}

function nested(value: unknown, key: string): AnyRecord {
  return record(record(value)[key]);
}

function stringValue(value: unknown, fallback = '—'): string {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function timeLabel(value: unknown, fallback = '—'): string {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function statusInbound(value: unknown): Shipment['status'] {
  const status = stringValue(value, '').toUpperCase();
  if (['RECEIVED', 'CLOSED'].includes(status)) return 'Dokončeno';
  if (['RECEIVING'].includes(status)) return 'Přijímá se';
  if (['EXPECTED', 'CREATED'].includes(status)) return 'Plánováno';
  return 'Na rampě';
}

function statusQuant(value: unknown): StockQuant['status'] {
  const status = stringValue(value, '').toUpperCase();
  if (status.includes('RESERVED')) return 'Reserved';
  if (status.includes('BLOCK') || status.includes('DAMAGED')) return 'Blocked';
  if (status.includes('QUARANTINE')) return 'Quarantine';
  return 'Available';
}

function statusOrder(value: unknown): Order['status'] {
  const status = stringValue(value, '').toUpperCase();
  if (status.includes('SHIP')) return 'Shipped';
  if (status.includes('PACK')) return status.includes('PACKED') ? 'Packed' : 'Packed';
  if (status.includes('PICK')) return 'Picking';
  if (status.includes('ALLOC')) return 'Allocated';
  return 'New';
}

function statusTask(value: unknown): WarehouseTask['status'] {
  const status = stringValue(value, '').toUpperCase();
  if (status === 'DONE') return 'Done';
  if (status === 'ASSIGNED') return 'Claimed';
  if (status === 'IN_PROGRESS') return 'In progress';
  if (['FAILED', 'BLOCKED', 'CANCELLED'].includes(status)) return 'Exception';
  return 'Open';
}

function typeTask(value: unknown): WarehouseTask['type'] {
  const type = stringValue(value, '').toUpperCase();
  if (type.includes('PUTAWAY')) return 'Putaway';
  if (type.includes('REPLENISH')) return 'Replenishment';
  if (type.includes('COUNT')) return 'Cycle count';
  if (type.includes('MOVE')) return 'Move';
  return 'Pick';
}

function severityFromIndex(index: number): Severity {
  return index === 0 ? 'critical' : index === 1 ? 'warning' : 'neutral';
}

export function mapWarehouses(payload: unknown): WarehouseView[] {
  return array(payload).map((item, index) => {
    const row = record(item);
    const code = stringValue(row.code ?? row.id, `WH-${index + 1}`);
    return {
      id: stringValue(row.id, code),
      code,
      name: stringValue(row.name, code),
      mode: 'API',
    };
  });
}

export function mapInboundShipments(payload: unknown): Shipment[] {
  return array(payload).map((item, index) => {
    const row = record(item);
    const lines = array(row.lines);
    const expected = lines.reduce<number>((sum, line) => sum + numberValue(record(line).expectedQuantity), 0);
    const received = lines.reduce<number>((sum, line) => sum + numberValue(record(line).receivedQuantity), 0);
    const progress = expected > 0 ? Math.min(100, Math.round((received / expected) * 100)) : (statusInbound(row.status) === 'Dokončeno' ? 100 : 0);
    return {
      id: stringValue(row.shipmentNumber ?? row.id, `ASN-${index + 1}`),
      supplier: stringValue(row.supplierName ?? row.supplierReference, '—'),
      dock: stringValue(nested(row, 'dockLocation').code, '—'),
      status: statusInbound(row.status),
      eta: timeLabel(row.expectedAt ?? row.appointmentStartAt),
      lines: lines.length || numberValue(row.lineCount, 0),
      progress,
    };
  });
}

export function mapStockQuants(payload: unknown): StockQuant[] {
  return array(payload).map((item, index) => {
    const row = record(item);
    const sku = nested(row, 'sku');
    const location = nested(row, 'location');
    return {
      id: stringValue(row.id, `Q-${index + 1}`),
      sku: stringValue(sku.code ?? row.skuCode ?? row.skuId, '—'),
      product: stringValue(sku.name ?? row.productName, '—'),
      location: stringValue(location.code ?? row.locationCode ?? row.locationId, '—'),
      lot: stringValue(row.batch ?? row.lotCode ?? row.lotId, '—'),
      available: numberValue(row.availableQuantity ?? row.quantity),
      reserved: numberValue(row.reservedQuantity),
      status: statusQuant(row.status),
      client: stringValue(row.ownerClientCode ?? row.clientCode, '—'),
    };
  });
}

export function mapOutboundOrders(payload: unknown): Order[] {
  return array(payload).map((item, index) => {
    const row = record(item);
    const lines = array(row.lines);
    const metadata = record(row.metadata);
    return {
      id: stringValue(row.orderNumber ?? row.id, `SO-${index + 1}`),
      channel: stringValue(metadata.channel ?? row.customerReference, '—'),
      priority: stringValue(metadata.priority, 'Normal') as Order['priority'],
      status: statusOrder(row.status),
      lines: lines.length || numberValue(row.lineCount, 0),
      wave: stringValue(metadata.waveId ?? metadata.wave, '—'),
      cutoff: timeLabel(row.shipBy, '—'),
    };
  });
}

export function mapWarehouseTasks(payload: unknown): WarehouseTask[] {
  return array(payload).map((item, index) => {
    const row = record(item);
    return {
      id: stringValue(row.externalReference ?? row.id, `T-${index + 1}`),
      type: typeTask(row.type),
      assignee: stringValue(nested(row, 'assignedUser').displayName ?? row.assignedUserId, '—'),
      from: stringValue(nested(row, 'fromLocation').code ?? row.fromLocationId, '—'),
      to: stringValue(nested(row, 'toLocation').code ?? row.toLocationId, '—'),
      status: statusTask(row.status),
      priority: numberValue(row.priority ?? record(row.metadata).priority, 0),
      quantity: numberValue(row.quantity, 1),
      sku: stringValue(nested(row, 'sku').code ?? row.sku ?? row.skuCode ?? row.skuId, '—'),
    };
  });
}

export function mapPickWaves(payload: unknown): WavePlan[] {
  return array(payload).map((item, index) => {
    const row = record(item);
    const orders = array(row.orders);
    const tasks = array(row.tasks);
    const status = stringValue(row.status, '').toUpperCase();
    const done = tasks.filter((task) => statusTask(record(task).status) === 'Done').length;
    const progress = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : status.includes('COMPLETE') ? 100 : status.includes('RUN') || status.includes('RELEASE') ? 25 : 0;
    return {
      id: stringValue(row.waveNumber ?? row.code ?? row.id, `W-${index + 1}`),
      status: status.includes('COMPLETE') ? 'Completed' : status.includes('RUN') || status.includes('RELEASE') ? 'Running' : 'Draft',
      cutoff: timeLabel(row.cutoffAt ?? row.createdAt, '—'),
      orders: orders.length || numberValue(row.orderCount, 0),
      lines: numberValue(row.lineCount, tasks.length),
      pickZones: array(row.pickZones).map((zone) => stringValue(zone)).slice(0, 4),
      progress,
      risk: severityFromIndex(index),
      recommendation: stringValue(record(row.metadata).recommendation, '—'),
    };
  });
}

export function mapPackingLinesFromOrders(payload: unknown): PackingLine[] {
  const orders = mapOutboundOrders(payload);
  const rawOrders = array(payload);
  const selectedIndex = rawOrders.findIndex((row) => {
    const status = stringValue(record(row).status, '').toUpperCase();
    if (!['PICKED', 'PACKING', 'PACKED'].includes(status)) return false;
    return array(record(row).lines).some((line) => numberValue(record(line).pickedQuantity, 0) > 0);
  });
  if (selectedIndex < 0) return [];
  const selected = rawOrders[selectedIndex];
  const selectedOrder = orders[selectedIndex] ?? orders[0];
  return array(record(selected).lines).filter((line) => numberValue(record(line).pickedQuantity, 0) > 0).map((line, index) => {
    const row = record(line);
    const picked = numberValue(row.pickedQuantity, 0);
    return {
      orderId: selectedOrder?.id ?? '—',
      sku: stringValue(row.sku ?? row.skuCode, `SKU-${index + 1}`),
      product: stringValue(row.description ?? row.productName, '—'),
      expected: picked > 0 ? picked : numberValue(row.orderedQuantity ?? row.expectedQuantity, 1),
      scanned: numberValue(row.packedQuantity, 0),
      serialRequired: Boolean(record(row.metadata).serialRequired),
    };
  });
}

export function mapCarrierCards(payload: unknown): CarrierCardView[] {
  return array(payload).map((item, index) => {
    const row = record(item);
    return {
      name: stringValue(row.name ?? row.carrier ?? row.code, `Carrier ${index + 1}`),
      status: stringValue(row.status ?? row.mode, 'Unknown'),
      labels: numberValue(row.labelsToday ?? row.labelCount),
      incidents: numberValue(row.incidents ?? row.errorCount),
    };
  });
}
