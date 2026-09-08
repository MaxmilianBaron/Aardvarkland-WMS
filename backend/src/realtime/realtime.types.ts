export interface RealtimeEnvelope<TData extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  warehouseId: string;
  type: string;
  occurredAt: string;
  data: TData;
}

export interface PublishRealtimeEventInput<
  TData extends Record<string, unknown> = Record<string, unknown>,
> {
  id?: string;
  warehouseId?: string;
  type: string;
  occurredAt?: Date;
  data: TData;
}
