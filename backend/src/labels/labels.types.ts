export enum LabelTemplateType {
  PARCEL = 'PARCEL',
  LOCATION = 'LOCATION',
  CUSTOM = 'CUSTOM',
}

export enum LabelJobStatus {
  QUEUED = 'QUEUED',
  CLAIMED = 'CLAIMED',
  PRINTING = 'PRINTING',
  PRINTED = 'PRINTED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export interface LabelTemplateResponse {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: string;
  content: string;
  isActive: boolean;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface LabelPrintJobResponse {
  id: string;
  warehouseId: string;
  parcelId: string;
  templateId: string;
  status: string;
  printerName: string | null;
  copies: number;
  requestedByUserId: string | null;
  payload: unknown;
  errorMessage: string | null;
  printedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PrinterStationResponse {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  protocol: string;
  host: string | null;
  port: number | null;
  windowsPrinterName: string | null;
  dpi: number;
  labelWidthMm: number;
  labelHeightMm: number;
  status: string;
  defaultTemplateCode: string | null;
  metadata: unknown;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PrintAgentResponse {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  status: string;
  version: string | null;
  hostname: string | null;
  printerCodes: string[];
  metadata: unknown;
  lastSeenAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RuntimePrintJobResponse {
  id: string;
  warehouseId: string;
  printerCode: string | null;
  agentCode: string | null;
  templateCode: string | null;
  templateVersion: number;
  status: string;
  copies: number;
  attempts: number;
  maxAttempts: number;
  payload: unknown;
  renderedZpl: string;
  errorMessage: string | null;
  requestedByUserId: string | null;
  claimedAt: Date | string | null;
  claimExpiresAt: Date | string | null;
  printedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface LabelPreviewResponse {
  zpl: string;
  warnings: string[];
}

export interface ScanResolveResponse {
  parsed: unknown;
  resolved: {
    found: boolean;
    objectType: string | null;
    id: string | null;
    code: string | null;
    displayName: string | null;
    metadata: unknown;
  };
}
