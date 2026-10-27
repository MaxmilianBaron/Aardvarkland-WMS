export enum AutomationDeviceStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  FAULTED = 'FAULTED',
}

export enum AutomationCommandStatus {
  QUEUED = 'QUEUED',
  CLAIMED = 'CLAIMED',
  SENT = 'SENT',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
  CANCELLED = 'CANCELLED',
}

export enum DockDoorStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  MAINTENANCE = 'MAINTENANCE',
  OCCUPIED = 'OCCUPIED',
}

export enum YardTrailerStatus {
  EXPECTED = 'EXPECTED',
  CHECKED_IN = 'CHECKED_IN',
  DOCKED = 'DOCKED',
  LOADING = 'LOADING',
  UNLOADING = 'UNLOADING',
  CHECKED_OUT = 'CHECKED_OUT',
  CANCELLED = 'CANCELLED',
}

export enum DockAppointmentStatus {
  SCHEDULED = 'SCHEDULED',
  CHECKED_IN = 'CHECKED_IN',
  DOCK_ASSIGNED = 'DOCK_ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum CrossDockPlanStatus {
  PLANNED = 'PLANNED',
  RELEASED = 'RELEASED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXCEPTION = 'EXCEPTION',
}

export enum VasTaskStatus {
  OPEN = 'OPEN',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum DomainEventDeliveryStatus {
  PENDING = 'PENDING',
  DISPATCHED = 'DISPATCHED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER',
  CANCELLED = 'CANCELLED',
}

export interface AutomationDeviceResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  code: string;
  deviceType: string;
  status: AutomationDeviceStatus;
  zone: string | null;
  lastHeartbeatAt: Date | null;
  capabilities: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutomationCommandResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  deviceId: string | null;
  commandType: string;
  status: AutomationCommandStatus;
  priority: number;
  correlationId: string | null;
  payload: unknown;
  attempts: number;
  notBeforeAt: Date | null;
  claimedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DockDoorResponse {
  id: string;
  warehouseId: string;
  code: string;
  status: DockDoorStatus;
  doorType: string;
  zone: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface DockAppointmentResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  appointmentNumber: string;
  direction: string;
  status: DockAppointmentStatus;
  plannedStartAt: Date;
  plannedEndAt: Date;
  dockDoorId: string | null;
  trailerId: string | null;
  carrier: string | null;
  externalReference: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface YardTrailerResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  trailerNumber: string;
  carrier: string | null;
  status: YardTrailerStatus;
  dockDoorId: string | null;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  dwellMinutes: number | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrossDockPlanLineInput {
  skuId: string;
  quantity: number;
  lotId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CrossDockPlanResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  status: CrossDockPlanStatus;
  priority: number;
  inboundShipmentId: string | null;
  outboundOrderId: string | null;
  reasonCode: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface VasServiceResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  code: string;
  name: string;
  serviceType: string;
  status: string;
  defaultDurationSeconds: number | null;
  instructions: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface KitBomResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  kitSkuId: string;
  code: string;
  status: string;
  version: number;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface VasTaskResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  serviceId: string | null;
  warehouseTaskId: string | null;
  status: VasTaskStatus;
  targetResourceType: string;
  targetResourceId: string;
  quantity: number;
  instructions: string | null;
  completedAt: Date | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface DomainEventResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  eventType: string;
  resourceType: string;
  resourceId: string;
  schemaVersion: number;
  eventKey: string;
  payload: unknown;
  metadata: unknown;
  occurredAt: Date;
  publishedAt: Date | null;
  createdAt: Date;
}

export interface WebhookSubscriptionResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  name: string;
  targetUrl: string;
  eventTypes: string[];
  status: string;
  secretRef: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookDeliveryAttemptResponse {
  id: string;
  warehouseId: string;
  ownerClientId: string | null;
  subscriptionId: string;
  domainEventId: string;
  status: DomainEventDeliveryStatus;
  attemptNumber: number;
  responseStatusCode: number | null;
  errorMessage: string | null;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
