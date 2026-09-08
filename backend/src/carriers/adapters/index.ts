import { normalizeCarrierCode } from '../carriers.helpers';
import { CarrierLabelResult } from '../carriers.types';
import { createMockCarrierLabelResult, normalizeCarrierWebhookSignature, normalizeTrackingWebhookPayload } from './carrier-adapter.helpers';
import { CarrierAdapterExecutionInput, CarrierAdapterMode } from './carrier-adapter.types';
import {
  CarrierAAdapter,
  CarrierBAdapter,
  CarrierCAdapter,
  CarrierDAdapter,
  GenericCarrierAdapter,
} from './provider-carrier-adapters';

export * from './carrier-adapter.helpers';
export * from './carrier-adapter.types';

export async function createCarrierLabelWithAdapter(input: CarrierAdapterExecutionInput): Promise<CarrierLabelResult> {
  const carrier = normalizeCarrierCode(input.request.carrier);
  if (input.mode === CarrierAdapterMode.MOCK) {
    return createMockCarrierLabelResult(input.request);
  }

  const adapter = carrier === 'CARRIER_A'
    ? new CarrierAAdapter()
    : carrier === 'CARRIER_B'
      ? new CarrierBAdapter()
      : carrier === 'CARRIER_C'
        ? new CarrierCAdapter()
        : carrier === 'CARRIER_D'
          ? new CarrierDAdapter()
          : new GenericCarrierAdapter(carrier);

  return adapter.createLabel(input);
}

export { normalizeCarrierWebhookSignature, normalizeTrackingWebhookPayload };
