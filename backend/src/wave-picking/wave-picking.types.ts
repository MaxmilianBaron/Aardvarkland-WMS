export enum PickWaveStatus {
  DRAFT = 'DRAFT',
  PLANNED = 'PLANNED',
  RELEASED = 'RELEASED',
  PICKING = 'PICKING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXCEPTION = 'EXCEPTION',
}

export enum PickWaveOrderStatus {
  PLANNED = 'PLANNED',
  RELEASED = 'RELEASED',
  PICKING = 'PICKING',
  PICKED = 'PICKED',
  CANCELLED = 'CANCELLED',
  EXCEPTION = 'EXCEPTION',
}

export enum PickCartStatus {
  AVAILABLE = 'AVAILABLE',
  ASSIGNED = 'ASSIGNED',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
}

export enum PickToteStatus {
  EMPTY = 'EMPTY',
  ASSIGNED = 'ASSIGNED',
  FULL = 'FULL',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

export enum PickWaveStrategy {
  SINGLE_ORDER = 'SINGLE_ORDER',
  BATCH = 'BATCH',
  ZONE = 'ZONE',
  CARRIER_CUTOFF = 'CARRIER_CUTOFF',
  PRIORITY = 'PRIORITY',
}

export interface PickWaveResponse {
  id: string;
  warehouseId: string;
  waveNumber: string;
  status: PickWaveStatus | string;
  priority: number;
  strategy: string;
  carrier: string | null;
  serviceLevel: string | null;
  zone: string | null;
  cutoffAt: string | null;
  releasedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  orderCount?: number;
  taskCount?: number;
  toteCount?: number;
  cartCount?: number;
  metadata?: unknown;
}

export interface PickWaveOrderResponse {
  id: string;
  waveId: string;
  outboundOrderId: string;
  status: PickWaveOrderStatus | string;
  sequence: number;
  pickedAt: string | null;
  orderNumber?: string;
}

export interface PickWaveTaskResponse {
  id: string;
  waveId: string;
  warehouseTaskId: string;
  status: string;
  sequence: number;
  zone: string | null;
  taskType?: string;
  taskPriority?: number;
}

export interface PickCartResponse {
  id: string;
  warehouseId: string;
  waveId: string | null;
  code: string;
  status: PickCartStatus | string;
  assignedUserId: string | null;
  toteCount?: number;
  metadata?: unknown;
}

export interface PickToteResponse {
  id: string;
  warehouseId: string;
  pickCartId: string | null;
  waveId: string | null;
  outboundOrderId: string | null;
  code: string;
  status: PickToteStatus | string;
  capacityUnits: number | null;
  metadata?: unknown;
}

export interface PickWaveDetailResponse extends PickWaveResponse {
  orders: PickWaveOrderResponse[];
  tasks: PickWaveTaskResponse[];
  carts: PickCartResponse[];
  totes: PickToteResponse[];
}

export interface PickWaveReleaseSummary {
  wave: PickWaveResponse;
  ordersReleased: number;
  tasksLinked: number;
  tasksCreated: number;
  cartAssigned: boolean;
  toteAssignments: number;
}
