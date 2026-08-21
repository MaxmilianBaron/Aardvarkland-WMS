export type ScanObjectType = 'LOC' | 'SKU' | 'HU' | 'PARCEL' | 'TASK';

export interface AardvarkScanCode {
  kind: 'AARD1';
  raw: string;
  objectType: ScanObjectType;
  warehouseCode: string;
  reference: string;
}

export interface Gs1ScanCode {
  kind: 'GS1';
  raw: string;
  normalized: string;
  parser: 'fallback' | 'gs1-syntax-engine';
  symbologyIdentifier: string | null;
  applicationIdentifiers: Record<string, string>;
  sscc: string | null;
  gtin: string | null;
  batch: string | null;
  expiry: string | null;
  serial: string | null;
  quantity: string | null;
  warnings: string[];
}

export interface RawScanCode {
  kind: 'RAW';
  raw: string;
  value: string;
}

export type ParsedScanCode = AardvarkScanCode | Gs1ScanCode | RawScanCode;

export interface Gs1ParserAdapter {
  parse(input: string): Gs1ScanCode | null;
}

const aardvarkTypes = new Set<ScanObjectType>(['LOC', 'SKU', 'HU', 'PARCEL', 'TASK']);
const groupSeparator = String.fromCharCode(29);
const symbologyIdentifierPattern = /^\][A-Za-z0-9]{2}/;

export function formatAardvarkCode(
  objectType: ScanObjectType,
  warehouseCode: string,
  reference: string,
): string {
  return `AARD1:${objectType}:${normalizeSegment(warehouseCode)}:${normalizeSegment(reference)}`;
}

export function parseScanCode(input: string, gs1Parser?: Gs1ParserAdapter): ParsedScanCode {
  const value = normalizeScannerInput(input);
  const aardvarkCode = parseAardvarkCode(value);
  if (aardvarkCode) {
    return aardvarkCode;
  }

  const gs1Code = gs1Parser?.parse(value) ?? parseGs1Code(value);
  if (gs1Code) {
    return gs1Code;
  }

  return {
    kind: 'RAW',
    raw: input,
    value,
  };
}

export function parseAardvarkCode(input: string): AardvarkScanCode | null {
  const parts = normalizeScannerInput(input).split(':');
  if (parts.length < 4 || parts[0]?.toUpperCase() !== 'AARD1') {
    return null;
  }

  const objectType = parts[1]?.toUpperCase();
  const warehouseCode = normalizeSegment(parts[2] ?? '');
  const reference = normalizeSegment(parts.slice(3).join(':'));

  if (!isScanObjectType(objectType) || !warehouseCode || !reference) {
    return null;
  }

  return {
    kind: 'AARD1',
    raw: input,
    objectType,
    warehouseCode,
    reference,
  };
}

export function matchesAardvarkWarehouse(
  code: AardvarkScanCode,
  warehouseCode: string,
): boolean {
  return code.warehouseCode === normalizeSegment(warehouseCode);
}

export function parseGs1Code(input: string): Gs1ScanCode | null {
  const normalized = normalizeScannerInput(input);
  const symbologyIdentifier = extractSymbologyIdentifier(normalized);
  const value = symbologyIdentifier ? normalized.slice(3) : normalized;
  if (!value) {
    return null;
  }

  const aiValues = value.includes('(')
    ? parseParenthesizedGs1(value)
    : parseCompactGs1(value);

  if (!Object.keys(aiValues).length) {
    return null;
  }

  return {
    kind: 'GS1',
    raw: input,
    normalized: value,
    parser: 'fallback',
    symbologyIdentifier,
    applicationIdentifiers: aiValues,
    sscc: aiValues['00'] ?? null,
    gtin: aiValues['01'] ?? null,
    batch: aiValues['10'] ?? null,
    expiry: aiValues['17'] ?? null,
    serial: aiValues['21'] ?? null,
    quantity: aiValues['37'] ?? null,
    warnings: validateGs1AiValues(aiValues),
  };
}

export function normalizeScannerInput(input: string): string {
  return input
    .replace(/\\u001d/gi, groupSeparator)
    .replace(/\\x1d/gi, groupSeparator)
    .replace(/<GS>/gi, groupSeparator)
    .replace(/\r?\n|\t/g, '')
    .trim();
}

function parseParenthesizedGs1(value: string): Record<string, string> {
  const aiValues: Record<string, string> = {};
  const pattern = /\((\d{2,4})\)([^()]*)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const ai = match[1];
    const content = match[2]?.trim();
    if (ai && content && isSupportedAi(ai)) {
      aiValues[ai] = trimGroupSeparator(content);
    }
  }

  return aiValues;
}

function parseCompactGs1(value: string): Record<string, string> {
  const aiValues: Record<string, string> = {};
  let offset = 0;

  while (offset < value.length) {
    const ai = supportedAis.find((candidate) => value.startsWith(candidate.ai, offset));
    if (!ai) {
      return {};
    }

    offset += ai.ai.length;

    if (ai.fixedLength !== null) {
      const content = value.slice(offset, offset + ai.fixedLength);
      if (content.length !== ai.fixedLength) {
        return {};
      }
      aiValues[ai.ai] = content;
      offset += ai.fixedLength;
      continue;
    }

    const separatorIndex = value.indexOf(groupSeparator, offset);
    const end = separatorIndex >= 0
      ? separatorIndex
      : Math.min(value.length, offset + ai.maxLength);
    const content = value.slice(offset, end);
    if (!content) {
      return {};
    }
    aiValues[ai.ai] = content;
    offset = separatorIndex >= 0 ? separatorIndex + 1 : end;
  }

  return aiValues;
}

function extractSymbologyIdentifier(value: string): string | null {
  const match = value.match(symbologyIdentifierPattern);
  return match?.[0] ?? null;
}

function isScanObjectType(value: unknown): value is ScanObjectType {
  return typeof value === 'string' && aardvarkTypes.has(value as ScanObjectType);
}

function normalizeSegment(value: string): string {
  return value.trim().toUpperCase();
}

function trimGroupSeparator(value: string): string {
  return value.replace(new RegExp(`${groupSeparator}.*$`), '').trim();
}

function isSupportedAi(ai: string): boolean {
  return supportedAis.some((candidate) => candidate.ai === ai);
}

function validateGs1AiValues(aiValues: Record<string, string>): string[] {
  const warnings: string[] = [];
  for (const definition of supportedAis) {
    const value = aiValues[definition.ai];
    if (value === undefined) {
      continue;
    }

    if (definition.fixedLength !== null && value.length !== definition.fixedLength) {
      warnings.push(`AI ${definition.ai} must be ${definition.fixedLength} characters.`);
    }

    if (value.length > definition.maxLength) {
      warnings.push(`AI ${definition.ai} exceeds maximum length ${definition.maxLength}.`);
    }

    if (definition.numeric && !/^\d+$/.test(value)) {
      warnings.push(`AI ${definition.ai} must be numeric.`);
    }
  }

  return warnings;
}

const supportedAis: Array<{ ai: string; fixedLength: number | null; maxLength: number; numeric: boolean }> = [
  { ai: '00', fixedLength: 18, maxLength: 18, numeric: true },
  { ai: '01', fixedLength: 14, maxLength: 14, numeric: true },
  { ai: '17', fixedLength: 6, maxLength: 6, numeric: true },
  { ai: '10', fixedLength: null, maxLength: 20, numeric: false },
  { ai: '21', fixedLength: null, maxLength: 20, numeric: false },
  { ai: '37', fixedLength: null, maxLength: 8, numeric: true },
];
