export interface BillingPdfLineInput {
  lineNumber: number;
  eventType: string;
  description: string;
  quantity: number;
  netAmountMinor: number;
  taxAmountMinor: number;
  grossAmountMinor: number;
  currency: string;
}

export interface BillingInvoicePdfInput {
  documentType: 'INVOICE' | 'CREDIT_NOTE';
  documentNumber: string;
  sourceDocumentNumber?: string | null;
  clientCode: string;
  warehouseCode: string;
  currency: string;
  subtotalMinor: number;
  taxTotalMinor: number;
  totalAmountMinor: number;
  periodStart?: Date | string | null;
  periodEnd?: Date | string | null;
  status: string;
  lines: BillingPdfLineInput[];
}

export function buildBillingPdfBase64(input: BillingInvoicePdfInput): string {
  return buildPdfBuffer({
    title: `${input.documentType} ${input.documentNumber}`,
    lines: buildBillingPdfLines(input),
  }).toString('base64');
}

function buildBillingPdfLines(input: BillingInvoicePdfInput): string[] {
  const lines = [
    `${input.documentType.replace('_', ' ')} ${input.documentNumber}`,
    `Status: ${input.status}`,
    `Client: ${input.clientCode}`,
    `Warehouse: ${input.warehouseCode}`,
    `Currency: ${input.currency}`,
  ];

  if (input.sourceDocumentNumber) {
    lines.push(`Source invoice: ${input.sourceDocumentNumber}`);
  }
  if (input.periodStart && input.periodEnd) {
    lines.push(`Period: ${toIsoDate(input.periodStart)} - ${toIsoDate(input.periodEnd)}`);
  }

  lines.push(
    `Subtotal: ${formatMinor(input.subtotalMinor, input.currency)}`,
    `Tax: ${formatMinor(input.taxTotalMinor, input.currency)}`,
    `Total: ${formatMinor(input.totalAmountMinor, input.currency)}`,
    '',
    'Lines:',
  );

  for (const line of input.lines.slice(0, 32)) {
    lines.push(
      `${line.lineNumber}. ${line.eventType} qty=${line.quantity} net=${formatMinor(line.netAmountMinor, line.currency)} tax=${formatMinor(line.taxAmountMinor, line.currency)} gross=${formatMinor(line.grossAmountMinor, line.currency)}`,
    );
    lines.push(`   ${line.description}`);
  }

  if (input.lines.length > 32) {
    lines.push(`... ${input.lines.length - 32} more lines omitted in compact PDF export`);
  }

  return lines.flatMap(wrapPdfLine);
}

function buildPdfBuffer(input: { title: string; lines: string[] }): Buffer {
  const content = buildPageContent(input.lines);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
  ];

  const chunks: string[] = ['%PDF-1.4\n'];
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join(''), 'latin1'));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(''), 'latin1');
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push('0000000000 65535 f \n');
  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  return Buffer.from(chunks.join(''), 'latin1');
}

function buildPageContent(lines: string[]): string {
  const escapedTitle = pdfEscape(lines[0] ?? 'WMS document');
  const content = ['BT', '/F1 16 Tf', '50 800 Td', `(${escapedTitle}) Tj`, '/F1 9 Tf', '0 -22 Td'];

  for (const line of lines.slice(1, 70)) {
    content.push(`(${pdfEscape(toPdfSafeText(line))}) Tj`, '0 -12 Td');
  }

  content.push('ET');
  return content.join('\n');
}

function wrapPdfLine(value: string): string[] {
  const text = toPdfSafeText(value);
  const width = 92;
  if (text.length <= width) {
    return [text];
  }

  const wrapped: string[] = [];
  let cursor = text;
  while (cursor.length > width) {
    let cut = cursor.lastIndexOf(' ', width);
    if (cut <= 0) cut = width;
    wrapped.push(cursor.slice(0, cut));
    cursor = cursor.slice(cut).trimStart();
  }
  if (cursor) wrapped.push(cursor);
  return wrapped;
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function toPdfSafeText(value: string): string {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '?');
}

function toIsoDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function formatMinor(value: number, currency: string): string {
  return `${(Math.trunc(value) / 100).toFixed(2)} ${currency}`;
}
