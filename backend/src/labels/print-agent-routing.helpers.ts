export interface PrintAgentRouting {
  printerCodes: string[];
  acceptUnassignedJobs: boolean;
  legacyWarehouseClaim: boolean;
}

export interface RuntimeJobRoute {
  agentCode?: string | null;
  printerCode?: string | null;
}

export function normalizePrinterCodes(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<string>();
  const codes: string[] = [];

  for (const item of values) {
    if (typeof item !== 'string') continue;
    const code = normalizeCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }

  return codes;
}

export function readPrinterCodesFromAgentMetadata(metadata: unknown): string[] {
  const record = isRecord(metadata) ? metadata : {};
  return normalizePrinterCodes(record['printerCodes']);
}

export function withConfiguredPrinterCodes(
  metadata: Record<string, unknown> | undefined,
  printerCodes: unknown,
): Record<string, unknown> {
  const next = isRecord(metadata) ? { ...metadata } : {};
  if (printerCodes !== undefined) {
    next['printerCodes'] = normalizePrinterCodes(printerCodes);
  }
  return next;
}

export function buildPrintAgentRouting(
  configuredPrinterCodes: unknown,
  reportedPrinterCodes: unknown,
  acceptUnassignedJobs?: boolean,
): PrintAgentRouting {
  const configured = normalizePrinterCodes(configuredPrinterCodes);
  const reported = normalizePrinterCodes(reportedPrinterCodes);
  const printerCodes = configured.length > 0 ? configured : reported;
  const legacyWarehouseClaim = printerCodes.length === 0;

  return {
    printerCodes,
    acceptUnassignedJobs: legacyWarehouseClaim || acceptUnassignedJobs === true,
    legacyWarehouseClaim,
  };
}

export function isRuntimePrintJobClaimableByAgent(
  job: RuntimeJobRoute,
  agentCode: string,
  routing: PrintAgentRouting,
): boolean {
  const normalizedAgent = normalizeCode(agentCode);
  const jobAgent = normalizeNullableCode(job.agentCode);
  const jobPrinter = normalizeNullableCode(job.printerCode);

  if (jobAgent && jobAgent !== normalizedAgent) {
    return false;
  }
  if (jobAgent === normalizedAgent) {
    return true;
  }
  if (routing.legacyWarehouseClaim) {
    return true;
  }
  if (!jobPrinter) {
    return routing.acceptUnassignedJobs;
  }

  return routing.printerCodes.includes(jobPrinter);
}

function normalizeNullableCode(value: string | null | undefined): string | null {
  const normalized = normalizeCode(value ?? '');
  return normalized || null;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
