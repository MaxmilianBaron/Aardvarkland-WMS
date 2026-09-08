export type LabelFieldType = 'text' | 'qr' | 'code128' | 'gs1-128' | 'datamatrix' | 'box' | 'line';

export interface LabelLayoutField {
  type: LabelFieldType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  value?: string;
  binding?: string;
  fontSize?: number;
  rotation?: 'N' | 'R' | 'I' | 'B';
  moduleSize?: number;
  lineWidth?: number;
}

export interface LabelLayout {
  widthMm: number;
  heightMm: number;
  dpi: number;
  orientation?: 'N' | 'I';
  fields: LabelLayoutField[];
}

export interface ZplRenderResult {
  zpl: string;
  warnings: string[];
}

const mmPerInch = 25.4;

export function renderZpl(layout: LabelLayout, payload: Record<string, unknown> = {}): ZplRenderResult {
  const warnings = [
    ...validateLabelLayout(layout),
    ...validateLabelFieldPayload(layout, payload),
  ];
  const widthDots = mmToDots(layout.widthMm, layout.dpi);
  const heightDots = mmToDots(layout.heightMm, layout.dpi);
  const lines = [
    '^XA',
    '^CI28',
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    layout.orientation === 'I' ? '^POI' : '^PON',
  ];

  for (const field of layout.fields) {
    lines.push(renderField(field, layout, payload));
  }

  lines.push('^XZ');

  return {
    zpl: lines.filter(Boolean).join('\n'),
    warnings,
  };
}

export function validateLabelLayout(layout: LabelLayout): string[] {
  const warnings: string[] = [];
  if (!Number.isFinite(layout.widthMm) || layout.widthMm <= 0) {
    warnings.push('Label width must be greater than zero.');
  }
  if (!Number.isFinite(layout.heightMm) || layout.heightMm <= 0) {
    warnings.push('Label height must be greater than zero.');
  }
  if (!Number.isFinite(layout.dpi) || layout.dpi < 150) {
    warnings.push('DPI must be at least 150.');
  }

  layout.fields.forEach((field, index) => {
    const label = `Field ${index + 1}`;
    if (!Number.isFinite(field.x) || !Number.isFinite(field.y)) {
      warnings.push(`${label} has invalid position.`);
    }
    if (field.x < 0 || field.y < 0) {
      warnings.push(`${label} starts outside the label.`);
    }
    if ((field.width ?? 0) < 0 || (field.height ?? 0) < 0) {
      warnings.push(`${label} has negative size.`);
    }
    if (field.x + (field.width ?? 0) > layout.widthMm || field.y + (field.height ?? 0) > layout.heightMm) {
      warnings.push(`${label} exceeds the label boundary.`);
    }
    if (field.type === 'qr' || field.type === 'datamatrix') {
      if ((field.width ?? 0) < 12 || (field.height ?? 0) < 12) {
        warnings.push(`${label} 2D code is too small for reliable scanning.`);
      }
    }
    if (field.type === 'code128' || field.type === 'gs1-128') {
      if ((field.width ?? 0) < 25 || (field.height ?? 0) < 8) {
        warnings.push(`${label} linear barcode is too small for reliable scanning.`);
      }
    }
    if (isBarcodeField(field.type) && field.moduleSize !== undefined && (field.moduleSize < 1 || field.moduleSize > 10)) {
      warnings.push(`${label} barcode module size must be between 1 and 10.`);
    }
  });

  return warnings;
}

export function validateZplDocument(zpl: string): string[] {
  const value = zpl.trim();
  const warnings: string[] = [];

  if (!value) {
    warnings.push('Rendered ZPL is empty.');
  }
  if (!value.startsWith('^XA')) {
    warnings.push('Rendered ZPL must start with ^XA.');
  }
  if (!value.endsWith('^XZ')) {
    warnings.push('Rendered ZPL must end with ^XZ.');
  }
  if (!/\^(BQ|BC|BX|FD|GB)/.test(value)) {
    warnings.push('Rendered ZPL does not contain a printable label command.');
  }
  if (value.length > 64000) {
    warnings.push('Rendered ZPL is unusually large for a warehouse label.');
  }
  if (value && ((value.match(/\^XA/g) ?? []).length !== 1 || (value.match(/\^XZ/g) ?? []).length !== 1)) {
    warnings.push('Rendered ZPL must contain exactly one label document.');
  }
  if (containsUnsafePrinterCommand(value)) {
    warnings.push('Rendered ZPL contains a printer-management or storage command that is not allowed.');
  }

  return warnings;
}

export function escapeZplFieldData(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 28) || code === 30 || code === 31
      ? ' '
      : character;
  }).join('')
    .replace(/\^/g, ' ')
    .replace(/~/g, ' ')
    .replace(/\r?\n|\t/g, ' ');
}

export function normalizeLabelLayout(value: unknown): LabelLayout {
  const record = isRecord(value) ? value : {};
  const fields = Array.isArray(record['fields']) ? record['fields'] : [];

  return {
    widthMm: numberValue(record['widthMm'], 100),
    heightMm: numberValue(record['heightMm'], 150),
    dpi: numberValue(record['dpi'], 203),
    orientation: record['orientation'] === 'I' ? 'I' : 'N',
    fields: fields.map(normalizeLabelField).filter((field): field is LabelLayoutField => field !== null),
  };
}

export function defaultLabelLayout(): LabelLayout {
  return {
    widthMm: 100,
    heightMm: 150,
    dpi: 203,
    orientation: 'N',
    fields: [
      { type: 'text', x: 6, y: 7, width: 88, height: 10, binding: 'title', fontSize: 7 },
      { type: 'qr', x: 6, y: 23, width: 34, height: 34, binding: 'code', moduleSize: 6 },
      { type: 'code128', x: 6, y: 65, width: 88, height: 18, binding: 'code' },
      { type: 'text', x: 6, y: 88, width: 88, height: 8, binding: 'subtitle', fontSize: 5 },
    ],
  };
}

function renderField(
  field: LabelLayoutField,
  layout: LabelLayout,
  payload: Record<string, unknown>,
): string {
  const x = mmToDots(field.x, layout.dpi);
  const y = mmToDots(field.y, layout.dpi);
  const value = resolveFieldValue(field, payload);
  const rotation = field.rotation ?? 'N';

  if (field.type === 'text') {
    const fontSize = mmToDots(field.fontSize ?? 5, layout.dpi);
    return `^FO${x},${y}^A0${rotation},${fontSize},${fontSize}^FD${zplText(value)}^FS`;
  }

  if (field.type === 'qr') {
    const moduleSize = clamp(Math.round(field.moduleSize ?? 6), 1, 10);
    return `^FO${x},${y}^BQN,2,${moduleSize}^FDLA,${zplText(value)}^FS`;
  }

  if (field.type === 'code128' || field.type === 'gs1-128') {
    const height = mmToDots(field.height ?? 18, layout.dpi);
    const data = field.type === 'gs1-128' ? `>;${value}` : value;
    return `^FO${x},${y}^BC${rotation},${height},Y,N,N^FD${zplText(data)}^FS`;
  }

  if (field.type === 'datamatrix') {
    const moduleSize = clamp(Math.round(field.moduleSize ?? 6), 1, 10);
    return `^FO${x},${y}^BX${rotation},${moduleSize},200^FD${zplText(value)}^FS`;
  }

  if (field.type === 'box') {
    const width = mmToDots(field.width ?? 20, layout.dpi);
    const height = mmToDots(field.height ?? 10, layout.dpi);
    const lineWidth = mmToDots(field.lineWidth ?? 0.35, layout.dpi);
    return `^FO${x},${y}^GB${width},${height},${Math.max(1, lineWidth)}^FS`;
  }

  if (field.type === 'line') {
    const width = mmToDots(field.width ?? 20, layout.dpi);
    const lineWidth = mmToDots(field.lineWidth ?? 0.35, layout.dpi);
    return `^FO${x},${y}^GB${width},${Math.max(1, lineWidth)},${Math.max(1, lineWidth)}^FS`;
  }

  return '';
}

function validateLabelFieldPayload(layout: LabelLayout, payload: Record<string, unknown>): string[] {
  const warnings: string[] = [];

  layout.fields.forEach((field, index) => {
    if (field.type !== 'text' || !field.width || !field.fontSize) {
      return;
    }

    const value = resolveFieldValue(field, payload);
    if (!value) {
      return;
    }

    const maxCharacters = Math.max(1, Math.floor(field.width / Math.max(1, field.fontSize * 0.45)));
    if (value.length > maxCharacters) {
      warnings.push(`Field ${index + 1} text may overflow the label.`);
    }
  });

  return warnings;
}

function normalizeLabelField(value: unknown): LabelLayoutField | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = typeof value['type'] === 'string' ? value['type'].toLowerCase() : '';
  if (!isLabelFieldType(type)) {
    return null;
  }

  return {
    type,
    x: numberValue(value['x'], 0),
    y: numberValue(value['y'], 0),
    width: optionalNumber(value['width']),
    height: optionalNumber(value['height']),
    value: stringOrUndefined(value['value']),
    binding: stringOrUndefined(value['binding']),
    fontSize: optionalNumber(value['fontSize']),
    rotation: isRotation(value['rotation']) ? value['rotation'] : 'N',
    moduleSize: optionalNumber(value['moduleSize']),
    lineWidth: optionalNumber(value['lineWidth']),
  };
}

function resolveFieldValue(field: LabelLayoutField, payload: Record<string, unknown>): string {
  if (field.binding) {
    const resolved = getPath(payload, field.binding);
    if (resolved !== undefined && resolved !== null) {
      return String(resolved);
    }
  }

  return field.value ?? '';
}

function getPath(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, payload);
}

function mmToDots(value: number, dpi: number): number {
  return Math.max(0, Math.round((value / mmPerInch) * dpi));
}

function zplText(value: string): string {
  return escapeZplFieldData(value);
}

function containsUnsafePrinterCommand(value: string): boolean {
  return /(?:\^DF|\^XF|\^ID|\^HW|\^WD|\^JU|\^JB|\^KP|\^KN|\^MP|\^CM|\^CC|\^CT|~JA|~JC|~JD|~JE|~JR|~EG|~HM|~HS|~HQ)/i.test(value);
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLabelFieldType(value: string): value is LabelFieldType {
  return ['text', 'qr', 'code128', 'gs1-128', 'datamatrix', 'box', 'line'].includes(value);
}

function isRotation(value: unknown): value is 'N' | 'R' | 'I' | 'B' {
  return value === 'N' || value === 'R' || value === 'I' || value === 'B';
}

function isBarcodeField(type: LabelFieldType): boolean {
  return type === 'qr' || type === 'code128' || type === 'gs1-128' || type === 'datamatrix';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
