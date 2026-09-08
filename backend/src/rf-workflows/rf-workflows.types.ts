export const RfWorkflowType = {
  RECEIVE: 'RECEIVE',
  PUTAWAY: 'PUTAWAY',
  PICK: 'PICK',
  PACK: 'PACK',
  MOVE: 'MOVE',
  COUNT: 'COUNT',
  REPLENISH: 'REPLENISH',
  LOAD: 'LOAD',
} as const;

export type RfWorkflowType = (typeof RfWorkflowType)[keyof typeof RfWorkflowType];

export const ScannerSessionStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
} as const;

export type ScannerSessionStatus = (typeof ScannerSessionStatus)[keyof typeof ScannerSessionStatus];

export const RfStepStatus = {
  OPEN: 'OPEN',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;

export type RfStepStatus = (typeof RfStepStatus)[keyof typeof RfStepStatus];

export const RfStepKey = {
  SCAN_SOURCE_LOCATION: 'SCAN_SOURCE_LOCATION',
  SCAN_DESTINATION_LOCATION: 'SCAN_DESTINATION_LOCATION',
  SCAN_ITEM: 'SCAN_ITEM',
  SCAN_HANDLING_UNIT: 'SCAN_HANDLING_UNIT',
  SCAN_ITEM_OR_HANDLING_UNIT: 'SCAN_ITEM_OR_HANDLING_UNIT',
  CONFIRM_QUANTITY: 'CONFIRM_QUANTITY',
  COMPLETE_TASK: 'COMPLETE_TASK',
} as const;

export type RfStepKey = (typeof RfStepKey)[keyof typeof RfStepKey];

export const RfExceptionCode = {
  SHORT_PICK: 'SHORT_PICK',
  WRONG_ITEM: 'WRONG_ITEM',
  WRONG_LOCATION: 'WRONG_LOCATION',
  DAMAGED_STOCK: 'DAMAGED_STOCK',
  MISSING_HU: 'MISSING_HU',
  BARCODE_NOT_RECOGNIZED: 'BARCODE_NOT_RECOGNIZED',
} as const;

export type RfExceptionCode = (typeof RfExceptionCode)[keyof typeof RfExceptionCode];

export interface RfExpectedScan {
  type: 'LOCATION' | 'SKU' | 'HANDLING_UNIT' | 'QUANTITY' | 'NONE';
  value: string | null;
  alternatives?: string[];
}

export interface RfTaskSummary {
  id: string;
  type: string;
  status: string;
  quantity: number | null;
  skuCode: string | null;
  fromLocationCode: string | null;
  toLocationCode: string | null;
  handlingUnitCode: string | null;
}

export interface RfInstructionResponse {
  sessionId: string;
  status: ScannerSessionStatus;
  workflow: RfWorkflowType;
  task: RfTaskSummary | null;
  step: {
    key: string | null;
    sequence: number | null;
    instruction: string;
    expected: RfExpectedScan;
    errorCode: string | null;
  };
  nextActions: string[];
  metadata: unknown;
}

export interface RfExceptionResponse {
  exceptionId: string;
  taskId: string | null;
  taskStatus: string | null;
  orderId: string | null;
  orderStatus: string | null;
  releasedReservedQuantity: number;
}

export interface RfQueueTaskResponse extends RfTaskSummary {
  priority: number;
  dueAt: Date | null;
  externalReference: string | null;
  assignedUserId: string | null;
  workflow: RfWorkflowType;
  suggestedAction: 'START' | 'RESUME' | 'WAIT';
}

export interface RfQueueResponse {
  warehouseId: string;
  generatedAt: Date;
  filters: {
    workflow?: string;
    zone?: string;
    assignedToMe?: boolean;
  };
  tasks: RfQueueTaskResponse[];
  offlineQueue: {
    queued: number;
    failed: number;
    syncedToday: number;
  };
}

export interface RfOfflineSyncItemResponse {
  idempotencyKey: string;
  status: 'QUEUED' | 'SYNCED' | 'FAILED' | 'DUPLICATE';
  sessionId: string | null;
  taskId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface RfOfflineSyncResponse {
  warehouseId: string;
  dryRun: boolean;
  received: number;
  synced: number;
  queued: number;
  failed: number;
  duplicates: number;
  items: RfOfflineSyncItemResponse[];
}
