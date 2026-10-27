import { CarrierLabelResult } from '../carriers.types';
import { createMockCarrierLabelResult } from './carrier-adapter.helpers';
import { CarrierAdapter, CarrierAdapterExecutionInput } from './carrier-adapter.types';

abstract class DeterministicCarrierAdapter implements CarrierAdapter {
  abstract readonly carrier: string;
  abstract readonly adapterCode: string;

  async createLabel(input: CarrierAdapterExecutionInput): Promise<CarrierLabelResult> {
    return createMockCarrierLabelResult({ ...input.request, carrier: this.carrier }, this.adapterCode);
  }
}

export class CarrierAAdapter extends DeterministicCarrierAdapter {
  readonly carrier = 'CARRIER_A';
  readonly adapterCode = 'CARRIER_A_ADAPTER';
}

export class CarrierBAdapter extends DeterministicCarrierAdapter {
  readonly carrier = 'CARRIER_B';
  readonly adapterCode = 'CARRIER_B_ADAPTER';
}

export class CarrierCAdapter extends DeterministicCarrierAdapter {
  readonly carrier = 'CARRIER_C';
  readonly adapterCode = 'CARRIER_C_ADAPTER';
}

export class CarrierDAdapter extends DeterministicCarrierAdapter {
  readonly carrier = 'CARRIER_D';
  readonly adapterCode = 'CARRIER_D_ADAPTER';
}

export class GenericCarrierAdapter implements CarrierAdapter {
  constructor(readonly carrier: string) {}

  async createLabel(input: CarrierAdapterExecutionInput): Promise<CarrierLabelResult> {
    return createMockCarrierLabelResult(input.request, `${this.carrier}_GENERIC_ADAPTER`);
  }
}
