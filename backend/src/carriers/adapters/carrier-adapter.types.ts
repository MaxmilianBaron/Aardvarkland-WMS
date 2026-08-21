import { CarrierLabelRequest, CarrierLabelResult, CarrierTrackingStatus } from '../carriers.types';

export const CarrierAdapterMode = {
  MOCK: 'mock',
  SANDBOX: 'sandbox',
  PRODUCTION: 'production',
  CREDENTIAL: 'credential',
} as const;

export type CarrierAdapterMode = (typeof CarrierAdapterMode)[keyof typeof CarrierAdapterMode];

export interface CarrierCredentialContext {
  carrier: string;
  environment: string;
  accountNumber: string | null;
  metadata: Record<string, unknown>;
  secrets: Record<string, string>;
}

export interface CarrierAdapterExecutionInput {
  request: CarrierLabelRequest;
  credential: CarrierCredentialContext | null;
  mode: CarrierAdapterMode;
  timeoutMs: number;
  now?: Date;
}

export interface CarrierAdapterHttpRequest {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface CarrierAdapterHttpResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
  durationMs: number;
}

export interface CarrierWebhookSignatureInput {
  carrier: string;
  headers: Record<string, string | string[] | undefined>;
  payload: unknown;
  secret: string;
  toleranceSeconds: number;
}

export interface CarrierWebhookSignatureResult {
  ok: boolean;
  reason?: string;
  headerName?: string;
}

export interface CarrierTrackingWebhookNormalizedEvent {
  externalEventId: string | null;
  labelReference: string | null;
  trackingNumber: string | null;
  status: CarrierTrackingStatus;
  eventCode: string | null;
  message: string | null;
  occurredAt: string | null;
  rawPayload: Record<string, unknown>;
}

export interface CarrierAdapter {
  readonly carrier: string;
  createLabel(input: CarrierAdapterExecutionInput): Promise<CarrierLabelResult>;
}
