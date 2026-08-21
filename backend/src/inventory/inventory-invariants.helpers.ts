export interface StockQuantInvariantRecord {
  id: string;
  quantity: number;
  reservedQuantity?: number | null;
}

export interface ReservationInvariantRecord {
  id: string;
  stockQuantId: string;
  quantity: number;
  status: string;
}

export interface OutboundOrderLineInvariantRecord {
  id: string;
  orderedQuantity: number;
  pickedQuantity?: number | null;
}

export interface PackageContentInvariantRecord {
  id: string;
  outboundOrderLineId?: string | null;
  quantity: number;
}

export interface InventoryInvariantSnapshot {
  stockQuants?: StockQuantInvariantRecord[];
  reservations?: ReservationInvariantRecord[];
  outboundOrderLines?: OutboundOrderLineInvariantRecord[];
  packageContents?: PackageContentInvariantRecord[];
}

export interface InventoryInvariantViolation {
  code: string;
  entityType: string;
  entityId: string;
  message: string;
}

const ACTIVE_RESERVATION_STATUSES = new Set(['ACTIVE', 'ALLOCATED', 'RESERVED']);

export function findInventoryInvariantViolations(
  snapshot: InventoryInvariantSnapshot,
): InventoryInvariantViolation[] {
  const violations: InventoryInvariantViolation[] = [];
  const stockQuants = snapshot.stockQuants ?? [];
  const reservations = snapshot.reservations ?? [];
  const outboundOrderLines = snapshot.outboundOrderLines ?? [];
  const packageContents = snapshot.packageContents ?? [];

  for (const quant of stockQuants) {
    const quantity = quant.quantity ?? 0;
    const reservedQuantity = quant.reservedQuantity ?? 0;

    if (quantity < 0) {
      violations.push({
        code: 'NEGATIVE_STOCK_QUANTITY',
        entityType: 'stock_quant',
        entityId: quant.id,
        message: `Stock quant ${quant.id} has negative quantity ${quantity}.`,
      });
    }

    if (reservedQuantity < 0) {
      violations.push({
        code: 'NEGATIVE_RESERVED_QUANTITY',
        entityType: 'stock_quant',
        entityId: quant.id,
        message: `Stock quant ${quant.id} has negative reserved quantity ${reservedQuantity}.`,
      });
    }

    if (reservedQuantity > quantity) {
      violations.push({
        code: 'RESERVED_EXCEEDS_STOCK',
        entityType: 'stock_quant',
        entityId: quant.id,
        message: `Stock quant ${quant.id} reserves ${reservedQuantity}, but only has ${quantity}.`,
      });
    }
  }

  const reservedByQuant = new Map<string, number>();

  for (const reservation of reservations) {
    if (reservation.quantity < 0) {
      violations.push({
        code: 'NEGATIVE_RESERVATION_QUANTITY',
        entityType: 'reservation',
        entityId: reservation.id,
        message: `Reservation ${reservation.id} has negative quantity ${reservation.quantity}.`,
      });
    }

    if (ACTIVE_RESERVATION_STATUSES.has(reservation.status)) {
      reservedByQuant.set(
        reservation.stockQuantId,
        (reservedByQuant.get(reservation.stockQuantId) ?? 0) + reservation.quantity,
      );
    }
  }

  const quantById = new Map(stockQuants.map((quant) => [quant.id, quant]));

  for (const [stockQuantId, totalReserved] of reservedByQuant.entries()) {
    const quant = quantById.get(stockQuantId);

    if (!quant) {
      violations.push({
        code: 'RESERVATION_REFERENCES_MISSING_QUANT',
        entityType: 'stock_quant',
        entityId: stockQuantId,
        message: `Active reservations reference missing stock quant ${stockQuantId}.`,
      });
      continue;
    }

    if (totalReserved > quant.quantity) {
      violations.push({
        code: 'ACTIVE_RESERVATIONS_EXCEED_STOCK',
        entityType: 'stock_quant',
        entityId: stockQuantId,
        message: `Active reservations total ${totalReserved}, but stock quantity is ${quant.quantity}.`,
      });
    }
  }

  for (const quant of stockQuants) {
    const reservedQuantity = quant.reservedQuantity ?? 0;
    const activeReservedQuantity = reservedByQuant.get(quant.id) ?? 0;

    if (reservedQuantity !== activeReservedQuantity) {
      violations.push({
        code: 'RESERVED_QUANTITY_MISMATCH',
        entityType: 'stock_quant',
        entityId: quant.id,
        message: `Stock quant ${quant.id} reserved ${reservedQuantity}, but active reservations total ${activeReservedQuantity}.`,
      });
    }
  }

  const packedByLine = new Map<string, number>();

  for (const content of packageContents) {
    if (content.quantity <= 0) {
      violations.push({
        code: 'INVALID_PACKAGE_CONTENT_QUANTITY',
        entityType: 'package_content',
        entityId: content.id,
        message: `Package content ${content.id} has invalid quantity ${content.quantity}.`,
      });
    }

    if (content.outboundOrderLineId) {
      packedByLine.set(
        content.outboundOrderLineId,
        (packedByLine.get(content.outboundOrderLineId) ?? 0) + content.quantity,
      );
    }
  }

  for (const line of outboundOrderLines) {
    const pickedQuantity = line.pickedQuantity ?? 0;
    const packedQuantity = packedByLine.get(line.id) ?? 0;

    if (pickedQuantity < 0) {
      violations.push({
        code: 'NEGATIVE_PICKED_QUANTITY',
        entityType: 'outbound_order_line',
        entityId: line.id,
        message: `Outbound line ${line.id} has negative picked quantity ${pickedQuantity}.`,
      });
    }

    if (pickedQuantity > line.orderedQuantity) {
      violations.push({
        code: 'PICKED_EXCEEDS_ORDERED',
        entityType: 'outbound_order_line',
        entityId: line.id,
        message: `Outbound line ${line.id} picked ${pickedQuantity}, ordered ${line.orderedQuantity}.`,
      });
    }

    if (packedQuantity > pickedQuantity) {
      violations.push({
        code: 'PACKED_EXCEEDS_PICKED',
        entityType: 'outbound_order_line',
        entityId: line.id,
        message: `Outbound line ${line.id} packed ${packedQuantity}, picked ${pickedQuantity}.`,
      });
    }
  }

  return violations;
}
