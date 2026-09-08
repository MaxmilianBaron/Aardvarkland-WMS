export const WmsInvariantSeverity = {
  WARNING: 'WARNING',
  ERROR: 'ERROR',
} as const;

export type WmsInvariantSeverity =
  (typeof WmsInvariantSeverity)[keyof typeof WmsInvariantSeverity];

export interface WmsInvariantIssue {
  type: string;
  severity: WmsInvariantSeverity;
  message: string;
  resourceType: string;
  resourceId: string | null;
  expected?: number | null;
  actual?: number | null;
}

export interface WmsInvariantStockQuant {
  id: string;
  quantity: number;
  reservedQuantity: number;
}

export interface WmsInvariantReservation {
  id: string;
  stockQuantId: string | null;
  quantity: number;
  status: string;
}

export interface WmsInvariantOutboundLine {
  id: string;
  orderedQuantity: number;
  pickedQuantity: number;
}

export interface WmsInvariantPackageContent {
  id: string;
  outboundOrderLineId: string | null;
  quantity: number;
}

export interface ValidateWmsInvariantsInput {
  stockQuants?: WmsInvariantStockQuant[];
  reservations?: WmsInvariantReservation[];
  outboundOrderLines?: WmsInvariantOutboundLine[];
  packageContents?: WmsInvariantPackageContent[];
}

export function validateWmsInvariants(input: ValidateWmsInvariantsInput): WmsInvariantIssue[] {
  return [
    ...validateStockQuantityInvariants(input.stockQuants ?? [], input.reservations ?? []),
    ...validateOutboundQuantityInvariants(
      input.outboundOrderLines ?? [],
      input.packageContents ?? [],
    ),
  ];
}

export function validateStockQuantityInvariants(
  stockQuants: WmsInvariantStockQuant[],
  reservations: WmsInvariantReservation[],
): WmsInvariantIssue[] {
  const issues: WmsInvariantIssue[] = [];
  const activeReservationQuantityByQuant = new Map<string, number>();

  for (const reservation of reservations) {
    if (reservation.status !== 'ACTIVE') {
      continue;
    }

    if (reservation.quantity <= 0) {
      issues.push({
        type: 'ACTIVE_RESERVATION_NON_POSITIVE_QUANTITY',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Active reservation quantity must be greater than zero.',
        resourceType: 'reservation',
        resourceId: reservation.id,
        expected: 1,
        actual: reservation.quantity,
      });
    }

    if (!reservation.stockQuantId) {
      issues.push({
        type: 'ACTIVE_RESERVATION_MISSING_QUANT',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Active reservation must reference a stock quant.',
        resourceType: 'reservation',
        resourceId: reservation.id,
      });
      continue;
    }

    activeReservationQuantityByQuant.set(
      reservation.stockQuantId,
      (activeReservationQuantityByQuant.get(reservation.stockQuantId) ?? 0) + reservation.quantity,
    );
  }

  for (const quant of stockQuants) {
    if (quant.quantity < 0) {
      issues.push({
        type: 'NEGATIVE_QUANT_QUANTITY',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Stock quant quantity cannot be negative.',
        resourceType: 'stock_quant',
        resourceId: quant.id,
        expected: 0,
        actual: quant.quantity,
      });
    }

    if (quant.reservedQuantity < 0) {
      issues.push({
        type: 'NEGATIVE_RESERVED_QUANTITY',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Reserved quantity cannot be negative.',
        resourceType: 'stock_quant',
        resourceId: quant.id,
        expected: 0,
        actual: quant.reservedQuantity,
      });
    }

    if (quant.reservedQuantity > quant.quantity) {
      issues.push({
        type: 'RESERVED_EXCEEDS_ON_HAND',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Reserved quantity cannot exceed on-hand quantity.',
        resourceType: 'stock_quant',
        resourceId: quant.id,
        expected: quant.quantity,
        actual: quant.reservedQuantity,
      });
    }

    const activeReservationQuantity = activeReservationQuantityByQuant.get(quant.id) ?? 0;

    if (activeReservationQuantity !== quant.reservedQuantity) {
      issues.push({
        type: 'RESERVED_QUANTITY_MISMATCH',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Stock quant reservedQuantity must match the sum of ACTIVE reservations.',
        resourceType: 'stock_quant',
        resourceId: quant.id,
        expected: activeReservationQuantity,
        actual: quant.reservedQuantity,
      });
    }
  }

  return issues;
}

export function validateOutboundQuantityInvariants(
  outboundOrderLines: WmsInvariantOutboundLine[],
  packageContents: WmsInvariantPackageContent[],
): WmsInvariantIssue[] {
  const issues: WmsInvariantIssue[] = [];
  const packedByLine = calculatePackedQuantityByOrderLine(packageContents);

  for (const line of outboundOrderLines) {
    if (line.orderedQuantity < 0) {
      issues.push({
        type: 'NEGATIVE_ORDERED_QUANTITY',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Ordered quantity cannot be negative.',
        resourceType: 'outbound_order_line',
        resourceId: line.id,
        expected: 0,
        actual: line.orderedQuantity,
      });
    }

    if (line.pickedQuantity < 0) {
      issues.push({
        type: 'NEGATIVE_PICKED_QUANTITY',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Picked quantity cannot be negative.',
        resourceType: 'outbound_order_line',
        resourceId: line.id,
        expected: 0,
        actual: line.pickedQuantity,
      });
    }

    if (line.pickedQuantity > line.orderedQuantity) {
      issues.push({
        type: 'PICKED_EXCEEDS_ORDERED',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Picked quantity cannot exceed ordered quantity.',
        resourceType: 'outbound_order_line',
        resourceId: line.id,
        expected: line.orderedQuantity,
        actual: line.pickedQuantity,
      });
    }

    const packedQuantity = packedByLine.get(line.id) ?? 0;

    if (packedQuantity > line.pickedQuantity) {
      issues.push({
        type: 'PACKED_EXCEEDS_PICKED',
        severity: WmsInvariantSeverity.ERROR,
        message: 'Packed quantity cannot exceed picked quantity.',
        resourceType: 'outbound_order_line',
        resourceId: line.id,
        expected: line.pickedQuantity,
        actual: packedQuantity,
      });
    }
  }

  return issues;
}

export function calculatePackedQuantityByOrderLine(
  packageContents: WmsInvariantPackageContent[],
): Map<string, number> {
  const packedByLine = new Map<string, number>();

  for (const content of packageContents) {
    if (!content.outboundOrderLineId) {
      continue;
    }

    packedByLine.set(
      content.outboundOrderLineId,
      (packedByLine.get(content.outboundOrderLineId) ?? 0) + content.quantity,
    );
  }

  return packedByLine;
}
