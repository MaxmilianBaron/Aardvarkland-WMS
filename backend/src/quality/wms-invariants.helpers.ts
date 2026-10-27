export interface StockQuantInvariantInput {
  id: string;
  quantity: number;
  reservedQuantity: number;
}

export interface ReservationInvariantInput {
  id: string;
  stockQuantId: string;
  quantity: number;
  status: string;
}

export interface OutboundLinePackingInvariantInput {
  id: string;
  lineNumber?: string | null;
  orderedQuantity: number;
  pickedQuantity: number;
}

export interface PackageContentInvariantInput {
  outboundOrderLineId: string | null;
  quantity: number;
}

export interface WmsInvariantIssue {
  code: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
  resourceId?: string | null;
  expected?: number | null;
  actual?: number | null;
}

export function validateStockInvariants(
  quants: StockQuantInvariantInput[],
  reservations: ReservationInvariantInput[],
): WmsInvariantIssue[] {
  const issues: WmsInvariantIssue[] = [];
  const activeReservedByQuant = new Map<string, number>();

  for (const reservation of reservations) {
    if (reservation.status !== 'ACTIVE') {
      continue;
    }

    if (reservation.quantity <= 0) {
      issues.push({
        code: 'ACTIVE_RESERVATION_NON_POSITIVE_QUANTITY',
        severity: 'ERROR',
        message: 'Active reservation quantity must be greater than zero.',
        resourceId: reservation.id,
        actual: reservation.quantity,
      });
    }

    activeReservedByQuant.set(
      reservation.stockQuantId,
      (activeReservedByQuant.get(reservation.stockQuantId) ?? 0) + reservation.quantity,
    );
  }

  for (const quant of quants) {
    if (quant.quantity < 0) {
      issues.push({
        code: 'NEGATIVE_STOCK_QUANTITY',
        severity: 'ERROR',
        message: 'Stock quantity cannot be negative.',
        resourceId: quant.id,
        actual: quant.quantity,
      });
    }

    if (quant.reservedQuantity < 0) {
      issues.push({
        code: 'NEGATIVE_RESERVED_QUANTITY',
        severity: 'ERROR',
        message: 'Reserved quantity cannot be negative.',
        resourceId: quant.id,
        actual: quant.reservedQuantity,
      });
    }

    if (quant.reservedQuantity > quant.quantity) {
      issues.push({
        code: 'RESERVED_EXCEEDS_ON_HAND',
        severity: 'ERROR',
        message: 'Reserved quantity cannot exceed on-hand stock.',
        resourceId: quant.id,
        expected: quant.quantity,
        actual: quant.reservedQuantity,
      });
    }

    const activeReserved = activeReservedByQuant.get(quant.id) ?? 0;

    if (activeReserved !== quant.reservedQuantity) {
      issues.push({
        code: 'RESERVED_QUANTITY_MISMATCH',
        severity: 'ERROR',
        message: 'Stock quant reserved quantity must match active reservations.',
        resourceId: quant.id,
        expected: activeReserved,
        actual: quant.reservedQuantity,
      });
    }
  }

  return issues;
}

export function validatePackingInvariants(
  lines: OutboundLinePackingInvariantInput[],
  contents: PackageContentInvariantInput[],
): WmsInvariantIssue[] {
  const issues: WmsInvariantIssue[] = [];
  const packedByLine = new Map<string, number>();

  for (const content of contents) {
    if (!content.outboundOrderLineId) {
      continue;
    }

    packedByLine.set(
      content.outboundOrderLineId,
      (packedByLine.get(content.outboundOrderLineId) ?? 0) + content.quantity,
    );
  }

  for (const line of lines) {
    const label = line.lineNumber ?? line.id;

    if (line.pickedQuantity < 0 || line.orderedQuantity < 0) {
      issues.push({
        code: 'NEGATIVE_OUTBOUND_LINE_QUANTITY',
        severity: 'ERROR',
        message: `Outbound line ${label} has a negative quantity.`,
        resourceId: line.id,
      });
    }

    if (line.pickedQuantity > line.orderedQuantity) {
      issues.push({
        code: 'PICKED_EXCEEDS_ORDERED',
        severity: 'ERROR',
        message: `Outbound line ${label} picked quantity exceeds ordered quantity.`,
        resourceId: line.id,
        expected: line.orderedQuantity,
        actual: line.pickedQuantity,
      });
    }

    const packedQuantity = packedByLine.get(line.id) ?? 0;

    if (packedQuantity > line.pickedQuantity) {
      issues.push({
        code: 'PACKED_EXCEEDS_PICKED',
        severity: 'ERROR',
        message: `Outbound line ${label} packed quantity exceeds picked quantity.`,
        resourceId: line.id,
        expected: line.pickedQuantity,
        actual: packedQuantity,
      });
    }
  }

  return issues;
}

export function isShipmentReadyToShip(input: {
  packageCount: number;
  stagedOrLoadedPackageCount: number;
  carrierRequiresLabel: boolean;
  labelledPackageCount: number;
  hasShipmentLevelLabel: boolean;
}): boolean {
  if (input.packageCount <= 0 || input.stagedOrLoadedPackageCount <= 0) {
    return false;
  }

  if (!input.carrierRequiresLabel) {
    return true;
  }

  return input.hasShipmentLevelLabel || input.labelledPackageCount >= input.packageCount;
}
