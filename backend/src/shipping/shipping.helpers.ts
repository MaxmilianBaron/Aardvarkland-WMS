let shipmentNumberSequence = 0;

export function makeShipmentNumber(date = new Date()): string {
  shipmentNumberSequence = (shipmentNumberSequence + 1) % 1000;
  return `SHP-${date
    .toISOString()
    .replace(/[-:TZ.]/g, '')
    .slice(0, 17)}-${String(shipmentNumberSequence).padStart(3, '0')}`;
}

export function makePackageCode(shipmentNumber: string, sequence: number): string {
  return `${shipmentNumber}-PKG-${String(sequence).padStart(3, '0')}`;
}

export function makeTrackingNumber(
  carrier: string | null | undefined,
  packageCode: string,
): string {
  const prefix =
    carrier
      ?.trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'WMS';
  return `${prefix}-${packageCode
    .replace(/[^A-Z0-9]/gi, '')
    .slice(-12)
    .toUpperCase()}`;
}

export interface PackingOrderLineInput {
  id: string;
  lineNumber?: string | null;
  sku: string;
  orderedQuantity: number;
  pickedQuantity: number;
}

export interface ExistingPackageContentInput {
  outboundOrderLineId?: string | null;
  sku: string;
  quantity: number;
}

export interface RequestedPackageContentInput {
  outboundOrderLineReference?: string | null;
  sku: string;
  quantity: number;
  metadata?: Record<string, unknown>;
}

export interface ResolvedPackageContentInput {
  outboundOrderLineId: string;
  sku: string;
  quantity: number;
  metadata?: Record<string, unknown>;
  remainingPickedQuantity: number;
  alreadyPackedQuantity: number;
}

export interface PackingValidationIssue {
  code:
    | 'NO_CONTENTS'
    | 'UNKNOWN_LINE'
    | 'AMBIGUOUS_SKU'
    | 'SKU_MISMATCH'
    | 'INVALID_LINE_QUANTITY'
    | 'OVER_PACKED'
    | 'LINE_PICKED_EXCEEDS_ORDERED';
  message: string;
  outboundOrderLineId?: string | null;
  sku?: string | null;
}

export interface PackingValidationResult {
  ok: boolean;
  issues: PackingValidationIssue[];
  resolvedContents: ResolvedPackageContentInput[];
}

export function validatePackageContentsAgainstPickedQuantities(
  lines: PackingOrderLineInput[],
  existingContents: ExistingPackageContentInput[],
  requestedContents: RequestedPackageContentInput[],
): PackingValidationResult {
  const issues: PackingValidationIssue[] = [];
  const resolvedContents: ResolvedPackageContentInput[] = [];
  const linesById = new Map(lines.map((line) => [line.id, line]));
  const linesByLineNumber = new Map(
    lines
      .filter((line) => isPresent(line.lineNumber))
      .map((line) => [normalizeCodeLike(line.lineNumber as string), line]),
  );
  const linesBySku = groupBy(lines, (line) => normalizeCodeLike(line.sku));
  const alreadyPackedByLineId = sumPackedQuantitiesByLine(existingContents);
  const requestedByLineId = new Map<string, number>();

  if (requestedContents.length === 0) {
    issues.push({
      code: 'NO_CONTENTS',
      message: 'Outbound shipment packages must include at least one package content row.',
    });
  }

  for (const line of lines) {
    if (line.pickedQuantity > line.orderedQuantity) {
      issues.push({
        code: 'LINE_PICKED_EXCEEDS_ORDERED',
        message: `Line ${line.lineNumber ?? line.id} has picked quantity above ordered quantity.`,
        outboundOrderLineId: line.id,
        sku: line.sku,
      });
    }
  }

  for (const content of requestedContents) {
    const line = resolvePackingLine(content, linesById, linesByLineNumber, linesBySku);

    if (!line) {
      issues.push({
        code: 'UNKNOWN_LINE',
        message: `Package content SKU ${content.sku} does not match an outbound order line.`,
        sku: content.sku,
      });
      continue;
    }

    if (line === 'AMBIGUOUS_SKU') {
      issues.push({
        code: 'AMBIGUOUS_SKU',
        message: `Package content SKU ${content.sku} matches multiple order lines; provide outboundOrderLineReference.`,
        sku: content.sku,
      });
      continue;
    }

    if (normalizeCodeLike(content.sku) !== normalizeCodeLike(line.sku)) {
      issues.push({
        code: 'SKU_MISMATCH',
        message: `Package content SKU ${content.sku} does not match line SKU ${line.sku}.`,
        outboundOrderLineId: line.id,
        sku: content.sku,
      });
      continue;
    }

    if (!Number.isInteger(content.quantity) || content.quantity <= 0) {
      issues.push({
        code: 'INVALID_LINE_QUANTITY',
        message: `Package content quantity must be positive for SKU ${content.sku}.`,
        outboundOrderLineId: line.id,
        sku: content.sku,
      });
      continue;
    }

    requestedByLineId.set(line.id, (requestedByLineId.get(line.id) ?? 0) + content.quantity);
    const alreadyPackedQuantity = alreadyPackedByLineId.get(line.id) ?? 0;
    const remainingPickedQuantity = Math.max(0, line.pickedQuantity - alreadyPackedQuantity);

    resolvedContents.push({
      outboundOrderLineId: line.id,
      sku: normalizeCodeLike(content.sku),
      quantity: content.quantity,
      metadata: content.metadata,
      remainingPickedQuantity,
      alreadyPackedQuantity,
    });
  }

  for (const [lineId, requestedQuantity] of requestedByLineId.entries()) {
    const line = linesById.get(lineId);

    if (!line) {
      continue;
    }

    const alreadyPackedQuantity = alreadyPackedByLineId.get(lineId) ?? 0;
    const remainingPickedQuantity = line.pickedQuantity - alreadyPackedQuantity;

    if (requestedQuantity > remainingPickedQuantity) {
      issues.push({
        code: 'OVER_PACKED',
        message: `Line ${line.lineNumber ?? line.id} cannot pack ${requestedQuantity}; remaining picked quantity is ${Math.max(remainingPickedQuantity, 0)}.`,
        outboundOrderLineId: line.id,
        sku: line.sku,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    resolvedContents: issues.length === 0 ? resolvedContents : [],
  };
}

export function carrierRequiresLabel(carrier: string | null | undefined): boolean {
  const normalized = carrier?.trim().toUpperCase();

  if (!normalized) {
    return false;
  }

  return !['INTERNAL', 'PICKUP', 'WILL_CALL', 'CUSTOMER_PICKUP'].includes(normalized);
}

function resolvePackingLine(
  content: RequestedPackageContentInput,
  linesById: Map<string, PackingOrderLineInput>,
  linesByLineNumber: Map<string, PackingOrderLineInput>,
  linesBySku: Map<string, PackingOrderLineInput[]>,
): PackingOrderLineInput | 'AMBIGUOUS_SKU' | null {
  const reference = content.outboundOrderLineReference?.trim();

  if (reference) {
    return linesById.get(reference) ?? linesByLineNumber.get(normalizeCodeLike(reference)) ?? null;
  }

  const matches = linesBySku.get(normalizeCodeLike(content.sku)) ?? [];

  if (matches.length > 1) {
    return 'AMBIGUOUS_SKU';
  }

  return matches[0] ?? null;
}

function sumPackedQuantitiesByLine(contents: ExistingPackageContentInput[]): Map<string, number> {
  const quantities = new Map<string, number>();

  for (const content of contents) {
    if (!content.outboundOrderLineId) {
      continue;
    }

    quantities.set(
      content.outboundOrderLineId,
      (quantities.get(content.outboundOrderLineId) ?? 0) + content.quantity,
    );
  }

  return quantities;
}

function groupBy<T>(values: T[], getKey: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const value of values) {
    const key = getKey(value);
    const group = groups.get(key) ?? [];
    group.push(value);
    groups.set(key, group);
  }

  return groups;
}

function normalizeCodeLike(value: string): string {
  return value.trim().toUpperCase();
}

function isPresent(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
