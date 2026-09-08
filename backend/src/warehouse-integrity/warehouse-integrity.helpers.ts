import {
  WarehouseIntegrityCarrierLabel,
  WarehouseIntegrityIssue,
  WarehouseIntegrityResponse,
  WarehouseIntegritySeverity,
  WarehouseIntegritySnapshot,
  WarehouseIntegrityStatus,
} from './warehouse-integrity.types';

const ACTIVE_RESERVATION_STATUSES = new Set(['ACTIVE', 'ALLOCATED', 'RESERVED']);
const SHIPPED_SHIPMENT_STATUSES = new Set(['SHIPPED', 'LOADED']);
const TERMINAL_OUTBOUND_STATUSES = new Set(['CANCELLED', 'SHIPPED', 'CLOSED']);
const TASK_DONE_STATUSES = new Set(['DONE', 'COMPLETED']);
const TASK_WORK_STATUSES = new Set(['IN_PROGRESS', 'STARTED']);
const ORDER_LINE_DONE_STATUSES = new Set(['DONE', 'COMPLETED']);
const QUANT_BOUND_STOCK_MOVEMENT_TYPES = new Set([
  'RECEIVE',
  'PUTAWAY',
  'MOVE',
  'RESERVE',
  'PICK',
  'PACK',
  'SHIP',
  'BLOCK',
  'UNBLOCK',
  'CANCEL_RESERVATION',
]);
const VALID_LABEL_STATUSES = new Set(['PRINTED', 'GENERATED', 'SENT']);
const CARRIERS_WITHOUT_LABEL_REQUIREMENT = new Set([
  'INTERNAL',
  'PICKUP',
  'WILL_CALL',
  'CUSTOMER_PICKUP',
]);

export function evaluateWarehouseIntegritySnapshot(
  snapshot: WarehouseIntegritySnapshot,
): WarehouseIntegrityResponse {
  const checkedAt = snapshot.checkedAt ?? new Date();
  const issues = [
    ...validateStock(snapshot),
    ...validateReservationOrderLinks(snapshot),
    ...validateOutboundPacking(snapshot),
    ...validateShipping(snapshot),
    ...validateActiveFreezes(snapshot),
    ...validateHandlingUnits(snapshot),
    ...validateWarehouseTasks(snapshot),
    ...validateWarehouseOrders(snapshot),
    ...validateStockMovements(snapshot),
  ];
  const errorCount = issues.filter(
    (issue) => issue.severity === WarehouseIntegritySeverity.ERROR,
  ).length;
  const warningCount = issues.length - errorCount;

  return {
    warehouseId: snapshot.warehouseId,
    checkedAt,
    status: errorCount === 0 ? WarehouseIntegrityStatus.OK : WarehouseIntegrityStatus.ISSUES,
    summary: {
      errorCount,
      warningCount,
      stockQuantCount: snapshot.stockQuants?.length ?? 0,
      reservationCount: snapshot.reservations?.length ?? 0,
      outboundOrderCount: snapshot.outboundOrders?.length ?? 0,
      outboundOrderLineCount: snapshot.outboundOrderLines?.length ?? 0,
      packageContentCount: snapshot.packageContents?.length ?? 0,
      shipmentCount: snapshot.shipments?.length ?? 0,
      shipmentPackageCount: snapshot.shipmentPackages?.length ?? 0,
      carrierLabelCount: snapshot.carrierLabels?.length ?? 0,
      activeFreezeCount: snapshot.stockFreezes?.filter((freeze) => freeze.status === 'ACTIVE').length ?? 0,
      handlingUnitCount: snapshot.handlingUnits?.length ?? 0,
      warehouseTaskCount: snapshot.warehouseTasks?.length ?? 0,
      warehouseOrderCount: snapshot.warehouseOrders?.length ?? 0,
      warehouseOrderLineCount: snapshot.warehouseOrderLines?.length ?? 0,
      stockMovementCount: snapshot.stockMovements?.length ?? 0,
    },
    issues,
  };
}

function validateStock(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const quants = snapshot.stockQuants ?? [];
  const reservations = snapshot.reservations ?? [];
  const quantById = new Map(quants.map((quant) => [quant.id, quant]));
  const activeReservationQuantityByQuant = new Map<string, number>();

  for (const quant of quants) {
    const quantity = quant.quantity ?? 0;
    const reservedQuantity = quant.reservedQuantity ?? 0;

    if (quantity < 0) {
      issues.push(errorIssue('NEGATIVE_STOCK_QUANTITY', 'stock_quant', quant.id, 'Stock quant quantity cannot be negative.', 0, quantity));
    }

    if (reservedQuantity < 0) {
      issues.push(errorIssue('NEGATIVE_RESERVED_QUANTITY', 'stock_quant', quant.id, 'Reserved quantity cannot be negative.', 0, reservedQuantity));
    }

    if (reservedQuantity > quantity) {
      issues.push(errorIssue('RESERVED_EXCEEDS_ON_HAND', 'stock_quant', quant.id, 'Reserved quantity cannot exceed on-hand quantity.', quantity, reservedQuantity));
    }
  }

  for (const reservation of reservations) {
    const quantity = reservation.quantity ?? 0;

    if (quantity <= 0 && ACTIVE_RESERVATION_STATUSES.has(reservation.status)) {
      issues.push(errorIssue('ACTIVE_RESERVATION_NON_POSITIVE', 'reservation', reservation.id, 'Active reservation quantity must be positive.', 1, quantity));
    }

    if (!ACTIVE_RESERVATION_STATUSES.has(reservation.status)) {
      continue;
    }

    if (!reservation.stockQuantId) {
      issues.push(errorIssue('ACTIVE_RESERVATION_MISSING_QUANT', 'reservation', reservation.id, 'Active reservation must reference a stock quant.'));
      continue;
    }

    if (!quantById.has(reservation.stockQuantId)) {
      issues.push(errorIssue('ACTIVE_RESERVATION_REFERENCES_MISSING_QUANT', 'reservation', reservation.id, `Active reservation references missing stock quant ${reservation.stockQuantId}.`));
      continue;
    }

    activeReservationQuantityByQuant.set(
      reservation.stockQuantId,
      (activeReservationQuantityByQuant.get(reservation.stockQuantId) ?? 0) + quantity,
    );
  }

  for (const quant of quants) {
    const activeReserved = activeReservationQuantityByQuant.get(quant.id) ?? 0;
    const reservedQuantity = quant.reservedQuantity ?? 0;

    if (activeReserved !== reservedQuantity) {
      issues.push(errorIssue('RESERVED_QUANTITY_MISMATCH', 'stock_quant', quant.id, 'Stock quant reservedQuantity must match the sum of active reservations.', activeReserved, reservedQuantity));
    }
  }

  return issues;
}

function validateReservationOrderLinks(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const ordersById = new Map((snapshot.outboundOrders ?? []).map((order) => [order.id, order]));
  const linesById = new Map((snapshot.outboundOrderLines ?? []).map((line) => [line.id, line]));

  for (const reservation of snapshot.reservations ?? []) {
    if (!ACTIVE_RESERVATION_STATUSES.has(reservation.status)) {
      continue;
    }

    if (reservation.outboundOrderId) {
      const order = ordersById.get(reservation.outboundOrderId);

      if (!order) {
        issues.push(errorIssue('ACTIVE_RESERVATION_REFERENCES_MISSING_OUTBOUND_ORDER', 'reservation', reservation.id, `Active reservation references missing outbound order ${reservation.outboundOrderId}.`));
      } else if (TERMINAL_OUTBOUND_STATUSES.has(order.status)) {
        issues.push(errorIssue('ACTIVE_RESERVATION_ON_TERMINAL_OUTBOUND_ORDER', 'reservation', reservation.id, `Active reservation cannot remain linked to terminal outbound order ${reservation.outboundOrderId}.`));
      }
    }

    if (reservation.outboundOrderLineId && !linesById.has(reservation.outboundOrderLineId)) {
      issues.push(errorIssue('ACTIVE_RESERVATION_REFERENCES_MISSING_OUTBOUND_LINE', 'reservation', reservation.id, `Active reservation references missing outbound order line ${reservation.outboundOrderLineId}.`));
    }
  }

  return issues;
}

function validateOutboundPacking(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const lines = snapshot.outboundOrderLines ?? [];
  const contents = snapshot.packageContents ?? [];
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const packedByLine = new Map<string, number>();

  for (const content of contents) {
    const quantity = content.quantity ?? 0;

    if (quantity <= 0) {
      issues.push(errorIssue('PACKAGE_CONTENT_NON_POSITIVE', 'package_content', content.id, 'Package content quantity must be positive.', 1, quantity));
    }

    if (!content.outboundOrderLineId) {
      issues.push(warningIssue('PACKAGE_CONTENT_MISSING_LINE', 'package_content', content.id, 'Package content is not linked to an outbound order line.'));
      continue;
    }

    if (!lineById.has(content.outboundOrderLineId)) {
      issues.push(errorIssue('PACKAGE_CONTENT_REFERENCES_MISSING_LINE', 'package_content', content.id, `Package content references missing outbound order line ${content.outboundOrderLineId}.`));
      continue;
    }

    packedByLine.set(
      content.outboundOrderLineId,
      (packedByLine.get(content.outboundOrderLineId) ?? 0) + quantity,
    );
  }

  for (const line of lines) {
    const ordered = line.orderedQuantity ?? 0;
    const picked = line.pickedQuantity ?? 0;
    const packed = packedByLine.get(line.id) ?? 0;

    if (ordered < 0) {
      issues.push(errorIssue('NEGATIVE_ORDERED_QUANTITY', 'outbound_order_line', line.id, 'Ordered quantity cannot be negative.', 0, ordered));
    }

    if (picked < 0) {
      issues.push(errorIssue('NEGATIVE_PICKED_QUANTITY', 'outbound_order_line', line.id, 'Picked quantity cannot be negative.', 0, picked));
    }

    if (picked > ordered) {
      issues.push(errorIssue('PICKED_EXCEEDS_ORDERED', 'outbound_order_line', line.id, 'Picked quantity cannot exceed ordered quantity.', ordered, picked));
    }

    if (packed > picked) {
      issues.push(errorIssue('PACKED_EXCEEDS_PICKED', 'outbound_order_line', line.id, 'Packed quantity cannot exceed picked quantity.', picked, packed));
    }
  }

  return issues;
}

function validateShipping(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const packagesByShipment = groupBy(snapshot.shipmentPackages ?? [], (pkg) => pkg.shipmentId ?? '');
  const labelsByShipment = groupBy(snapshot.carrierLabels ?? [], (label) => label.shipmentId ?? '');

  for (const shipment of snapshot.shipments ?? []) {
    if (!SHIPPED_SHIPMENT_STATUSES.has(shipment.status)) {
      continue;
    }

    const packages = packagesByShipment.get(shipment.id) ?? [];

    if (packages.length === 0) {
      issues.push(errorIssue('SHIPPED_SHIPMENT_WITHOUT_PACKAGES', 'shipment', shipment.id, 'Shipped shipment must have at least one package.'));
    }

    if (carrierRequiresLabel(shipment.carrier) && !hasUsableCarrierLabel(labelsByShipment.get(shipment.id) ?? [])) {
      issues.push(errorIssue('CARRIER_SHIPMENT_MISSING_LABEL', 'shipment', shipment.id, 'Carrier shipment requires at least one usable carrier label.'));
    }
  }

  return issues;
}

function validateActiveFreezes(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const quantIds = new Set((snapshot.stockQuants ?? []).map((quant) => quant.id));

  for (const freeze of snapshot.stockFreezes ?? []) {
    if (freeze.status !== 'ACTIVE' || !freeze.stockQuantId) {
      continue;
    }

    if (!quantIds.has(freeze.stockQuantId)) {
      issues.push(errorIssue('ACTIVE_FREEZE_REFERENCES_MISSING_QUANT', 'stock_freeze', freeze.id, `Active stock freeze references missing stock quant ${freeze.stockQuantId}.`));
    }
  }

  return issues;
}

function validateHandlingUnits(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const huById = new Map((snapshot.handlingUnits ?? []).map((hu) => [hu.id, hu]));

  for (const hu of snapshot.handlingUnits ?? []) {
    if (hu.parentId && !huById.has(hu.parentId)) {
      issues.push(warningIssue('HANDLING_UNIT_REFERENCES_MISSING_PARENT', 'handling_unit', hu.id, `Handling unit references missing parent ${hu.parentId}.`));
    }
  }

  for (const quant of snapshot.stockQuants ?? []) {
    if (!quant.handlingUnitId) {
      continue;
    }

    const hu = huById.get(quant.handlingUnitId);

    if (!hu) {
      issues.push(errorIssue('STOCK_QUANT_REFERENCES_MISSING_HANDLING_UNIT', 'stock_quant', quant.id, `Stock quant references missing handling unit ${quant.handlingUnitId}.`));
      continue;
    }

    if (quant.locationId && hu.currentLocationId && quant.locationId !== hu.currentLocationId) {
      issues.push(errorIssue('HANDLING_UNIT_QUANT_LOCATION_MISMATCH', 'stock_quant', quant.id, 'Stock quant location must match its handling unit current location.'));
    }
  }

  return issues;
}

function validateWarehouseTasks(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const reservationIds = new Set((snapshot.reservations ?? []).map((reservation) => reservation.id));
  const huIds = new Set((snapshot.handlingUnits ?? []).map((hu) => hu.id));

  for (const task of snapshot.warehouseTasks ?? []) {
    const quantity = task.quantity ?? 0;

    if (TASK_DONE_STATUSES.has(task.status)) {
      if (!task.startedAt) {
        issues.push(warningIssue('WAREHOUSE_TASK_DONE_WITHOUT_STARTED_AT', 'warehouse_task', task.id, 'Completed warehouse task should keep a startedAt timestamp.'));
      }

      if (!task.completedAt) {
        issues.push(errorIssue('WAREHOUSE_TASK_DONE_WITHOUT_COMPLETED_AT', 'warehouse_task', task.id, 'Completed warehouse task must have a completedAt timestamp.'));
      }

      if (quantity <= 0) {
        issues.push(errorIssue('WAREHOUSE_TASK_DONE_NON_POSITIVE_QUANTITY', 'warehouse_task', task.id, 'Completed warehouse task quantity must be positive.', 1, quantity));
      }
    }

    if (TASK_WORK_STATUSES.has(task.status) && !task.startedAt) {
      issues.push(warningIssue('WAREHOUSE_TASK_IN_PROGRESS_WITHOUT_STARTED_AT', 'warehouse_task', task.id, 'In-progress warehouse task should have a startedAt timestamp.'));
    }

    if (task.reservationId && !reservationIds.has(task.reservationId)) {
      issues.push(errorIssue('WAREHOUSE_TASK_REFERENCES_MISSING_RESERVATION', 'warehouse_task', task.id, `Warehouse task references missing reservation ${task.reservationId}.`));
    }

    if (task.handlingUnitId && !huIds.has(task.handlingUnitId)) {
      issues.push(warningIssue('WAREHOUSE_TASK_REFERENCES_MISSING_HANDLING_UNIT', 'warehouse_task', task.id, `Warehouse task references missing handling unit ${task.handlingUnitId}.`));
    }
  }

  return issues;
}

function validateWarehouseOrders(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const orderIds = new Set((snapshot.warehouseOrders ?? []).map((order) => order.id));

  for (const line of snapshot.warehouseOrderLines ?? []) {
    const requested = line.requestedQuantity ?? 0;
    const allocated = line.allocatedQuantity ?? 0;
    const completed = line.completedQuantity ?? 0;

    if (line.warehouseOrderId && !orderIds.has(line.warehouseOrderId)) {
      issues.push(errorIssue('WAREHOUSE_ORDER_LINE_REFERENCES_MISSING_ORDER', 'warehouse_order_line', line.id, `Warehouse order line references missing warehouse order ${line.warehouseOrderId}.`));
    }

    if (requested < 0) {
      issues.push(errorIssue('WAREHOUSE_ORDER_LINE_NEGATIVE_REQUESTED', 'warehouse_order_line', line.id, 'Warehouse order requested quantity cannot be negative.', 0, requested));
    }

    if (allocated < 0) {
      issues.push(errorIssue('WAREHOUSE_ORDER_LINE_NEGATIVE_ALLOCATED', 'warehouse_order_line', line.id, 'Warehouse order allocated quantity cannot be negative.', 0, allocated));
    }

    if (completed < 0) {
      issues.push(errorIssue('WAREHOUSE_ORDER_LINE_NEGATIVE_COMPLETED', 'warehouse_order_line', line.id, 'Warehouse order completed quantity cannot be negative.', 0, completed));
    }

    if (allocated > requested) {
      issues.push(errorIssue('WAREHOUSE_ORDER_LINE_ALLOCATED_EXCEEDS_REQUESTED', 'warehouse_order_line', line.id, 'Warehouse order allocated quantity cannot exceed requested quantity.', requested, allocated));
    }

    if (completed > requested) {
      issues.push(errorIssue('WAREHOUSE_ORDER_LINE_COMPLETED_EXCEEDS_REQUESTED', 'warehouse_order_line', line.id, 'Warehouse order completed quantity cannot exceed requested quantity.', requested, completed));
    }

    if (ORDER_LINE_DONE_STATUSES.has(line.status) && completed < requested) {
      issues.push(warningIssue('WAREHOUSE_ORDER_LINE_DONE_NOT_FULLY_COMPLETED', 'warehouse_order_line', line.id, 'Completed warehouse order line should have completedQuantity equal to requestedQuantity.'));
    }
  }

  return issues;
}

function validateStockMovements(snapshot: WarehouseIntegritySnapshot): WarehouseIntegrityIssue[] {
  const issues: WarehouseIntegrityIssue[] = [];
  const quantIds = new Set((snapshot.stockQuants ?? []).map((quant) => quant.id));
  const reservationIds = new Set((snapshot.reservations ?? []).map((reservation) => reservation.id));
  const taskIds = new Set((snapshot.warehouseTasks ?? []).map((task) => task.id));

  for (const movement of snapshot.stockMovements ?? []) {
    const quantity = movement.quantity ?? 0;

    if (quantity <= 0) {
      issues.push(errorIssue('STOCK_MOVEMENT_NON_POSITIVE_QUANTITY', 'stock_movement', movement.id, 'Stock movement quantity must be positive.', 1, quantity));
    }

    if (QUANT_BOUND_STOCK_MOVEMENT_TYPES.has(movement.type)) {
      if (!movement.stockQuantId) {
        issues.push(errorIssue('STOCK_MOVEMENT_MISSING_QUANT', 'stock_movement', movement.id, 'Stock movement must reference a stock quant.'));
      } else if (!quantIds.has(movement.stockQuantId)) {
        issues.push(errorIssue('STOCK_MOVEMENT_REFERENCES_MISSING_QUANT', 'stock_movement', movement.id, `Stock movement references missing stock quant ${movement.stockQuantId}.`));
      }
    }

    if (movement.reservationId && !reservationIds.has(movement.reservationId)) {
      issues.push(errorIssue('STOCK_MOVEMENT_REFERENCES_MISSING_RESERVATION', 'stock_movement', movement.id, `Stock movement references missing reservation ${movement.reservationId}.`));
    }

    if (movement.taskId && !taskIds.has(movement.taskId)) {
      issues.push(warningIssue('STOCK_MOVEMENT_REFERENCES_MISSING_TASK', 'stock_movement', movement.id, `Stock movement references missing warehouse task ${movement.taskId}.`));
    }
  }

  return issues;
}

export function carrierRequiresLabel(carrier: string | null | undefined): boolean {
  const normalized = carrier?.trim().toUpperCase();

  if (!normalized) {
    return false;
  }

  return !CARRIERS_WITHOUT_LABEL_REQUIREMENT.has(normalized);
}

function hasUsableCarrierLabel(labels: WarehouseIntegrityCarrierLabel[]): boolean {
  return labels.some((label) => !label.status || VALID_LABEL_STATUSES.has(label.status));
}

function groupBy<T>(items: T[], keySelector: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    const key = keySelector(item);

    if (!key) {
      continue;
    }

    const bucket = grouped.get(key) ?? [];
    bucket.push(item);
    grouped.set(key, bucket);
  }

  return grouped;
}

function errorIssue(
  code: string,
  entityType: string,
  entityId: string | null,
  message: string,
  expected?: number | null,
  actual?: number | null,
): WarehouseIntegrityIssue {
  return {
    code,
    severity: WarehouseIntegritySeverity.ERROR,
    entityType,
    entityId,
    message,
    ...(expected !== undefined ? { expected } : {}),
    ...(actual !== undefined ? { actual } : {}),
  };
}

function warningIssue(
  code: string,
  entityType: string,
  entityId: string | null,
  message: string,
): WarehouseIntegrityIssue {
  return {
    code,
    severity: WarehouseIntegritySeverity.WARNING,
    entityType,
    entityId,
    message,
  };
}
