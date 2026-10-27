export interface AuditLogResponse {
  id: string;
  actorUserId: string | null;
  actorDisplayName: string | null;
  actorEmail: string | null;
  warehouseId: string | null;
  warehouseCode: string | null;
  warehouseName: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface AuditWriteInput {
  actorUserId?: string | null;
  warehouseId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: unknown;
}

export interface AuditHashManifestEntry {
  id: string;
  createdAt: string;
  rowHash: string;
  chainHash: string;
}

export interface AuditHashManifestResponse {
  generatedAt: string;
  count: number;
  sha256: string;
  firstCreatedAt: string | null;
  lastCreatedAt: string | null;
  entries: AuditHashManifestEntry[];
}

export interface AuditExportResponse {
  generatedAt: string;
  count: number;
  sha256: string;
  entries: AuditLogResponse[];
  manifest: AuditHashManifestResponse;
}
