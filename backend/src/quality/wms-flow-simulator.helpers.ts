import {
  applyAtomicReservationSnapshot,
  AtomicReservationAttempt,
  StockReservationSnapshot,
} from '../database/concurrency.helpers';
import { validatePackageContentsAgainstPickedQuantities } from '../shipping/shipping.helpers';
import {
  isShipmentReadyToShip,
  validatePackingInvariants,
  validateStockInvariants,
  WmsInvariantIssue,
} from './wms-invariants.helpers';

export interface WmsFlowStockQuant extends StockReservationSnapshot {
  sku: string;
  location: string;
}

export interface WmsFlowReservation {
  id: string;
  stockQuantId: string;
  quantity: number;
  status: 'ACTIVE' | 'PICKED' | 'RELEASED' | 'CANCELLED';
}

export interface WmsFlowOrderLine {
  id: string;
  lineNumber: string;
  sku: string;
  orderedQuantity: number;
  pickedQuantity: number;
}

export interface WmsFlowPackageContent {
  outboundOrderLineId: string | null;
  sku: string;
  quantity: number;
}

export interface WmsFlowShipment {
  id: string;
  status: 'PACKING' | 'STAGED' | 'LOADING' | 'SHIPPED' | 'EXCEPTION';
  carrier: string;
  packageCount: number;
  labelledPackageCount: number;
  stagedOrLoadedPackageCount: number;
  hasShipmentLevelLabel: boolean;
}

export interface WmsFlowState {
  stockQuants: WmsFlowStockQuant[];
  reservations: WmsFlowReservation[];
  outboundOrderLines: WmsFlowOrderLine[];
  packageContents: WmsFlowPackageContent[];
  shipment: WmsFlowShipment;
  events: string[];
}

export interface ConcurrentReservationAttemptInput extends AtomicReservationAttempt {
  id: string;
}

export interface ConcurrentReservationSimulationResult {
  finalStockQuant: WmsFlowStockQuant;
  acceptedAttempts: string[];
  rejectedAttempts: Array<{ id: string; reason: string; availableBefore: number }>;
}

export function createFlowState(input: {
  sku?: string;
  location?: string;
  onHandQuantity: number;
  orderedQuantity: number;
  carrier?: string;
}): WmsFlowState {
  if (!Number.isInteger(input.onHandQuantity) || input.onHandQuantity < 0) {
    throw new Error('onHandQuantity must be a non-negative integer.');
  }

  if (!Number.isInteger(input.orderedQuantity) || input.orderedQuantity <= 0) {
    throw new Error('orderedQuantity must be a positive integer.');
  }

  const sku = normalizeCode(input.sku ?? 'SKU-1');
  const location = normalizeCode(input.location ?? 'A-01-01');

  return {
    stockQuants: [
      {
        id: 'quant-1',
        sku,
        location,
        quantity: input.onHandQuantity,
        reservedQuantity: 0,
        version: 0,
      },
    ],
    reservations: [],
    outboundOrderLines: [
      {
        id: 'line-1',
        lineNumber: '1',
        sku,
        orderedQuantity: input.orderedQuantity,
        pickedQuantity: 0,
      },
    ],
    packageContents: [],
    shipment: {
      id: 'shipment-1',
      status: 'PACKING',
      carrier: normalizeCode(input.carrier ?? 'CARRIER_A'),
      packageCount: 0,
      labelledPackageCount: 0,
      stagedOrLoadedPackageCount: 0,
      hasShipmentLevelLabel: false,
    },
    events: ['FLOW_CREATED'],
  };
}

export function reserveFlowStock(
  state: WmsFlowState,
  quantity: number,
  reservationId = `reservation-${state.reservations.length + 1}`,
): WmsFlowState {
  const next = cloneState(state);
  const quant = next.stockQuants[0];

  if (!quant) {
    throw new Error('No stock quant exists in flow state.');
  }

  const result = applyAtomicReservationSnapshot(quant, {
    quantity,
    expectedVersion: quant.version,
  });

  if (!result.success) {
    throw new Error(`Reservation failed: ${result.reason}`);
  }

  next.stockQuants[0] = { ...quant, ...result.stockQuant };
  next.reservations.push({ id: reservationId, stockQuantId: quant.id, quantity, status: 'ACTIVE' });
  next.events.push('STOCK_RESERVED');

  return next;
}

export function pickFlowReservation(
  state: WmsFlowState,
  reservationId: string,
  quantity: number,
): WmsFlowState {
  const next = cloneState(state);
  const reservation = next.reservations.find((candidate) => candidate.id === reservationId);

  if (!reservation || reservation.status !== 'ACTIVE') {
    throw new Error(`Active reservation ${reservationId} was not found.`);
  }

  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > reservation.quantity) {
    throw new Error('Pick quantity must be positive and no greater than reservation quantity.');
  }

  const quant = next.stockQuants.find((candidate) => candidate.id === reservation.stockQuantId);
  const line = next.outboundOrderLines.find((candidate) => candidate.sku === quant?.sku);

  if (!quant || !line) {
    throw new Error('Pick context is incomplete.');
  }

  if (quant.quantity < quantity || quant.reservedQuantity < quantity) {
    throw new Error('Pick quantity exceeds reserved stock.');
  }

  if (line.pickedQuantity + quantity > line.orderedQuantity) {
    throw new Error('Pick quantity exceeds ordered quantity.');
  }

  quant.quantity -= quantity;
  quant.reservedQuantity -= quantity;
  quant.version = typeof quant.version === 'number' ? quant.version + 1 : quant.version;
  reservation.quantity -= quantity;
  line.pickedQuantity += quantity;

  if (reservation.quantity === 0) {
    reservation.status = 'PICKED';
  }

  next.events.push('STOCK_PICKED');

  return next;
}

export function releaseShortPickRemainder(
  state: WmsFlowState,
  reservationId: string,
  shortQuantity: number,
): WmsFlowState {
  const next = cloneState(state);
  const reservation = next.reservations.find((candidate) => candidate.id === reservationId);

  if (!reservation || reservation.status !== 'ACTIVE') {
    throw new Error(`Active reservation ${reservationId} was not found for short-pick release.`);
  }

  if (!Number.isInteger(shortQuantity) || shortQuantity <= 0 || shortQuantity > reservation.quantity) {
    throw new Error('Short quantity must be positive and no greater than reservation quantity.');
  }

  const quant = next.stockQuants.find((candidate) => candidate.id === reservation.stockQuantId);

  if (!quant || quant.reservedQuantity < shortQuantity) {
    throw new Error('Short-pick release exceeds reserved quantity.');
  }

  quant.reservedQuantity -= shortQuantity;
  quant.version = typeof quant.version === 'number' ? quant.version + 1 : quant.version;
  reservation.quantity -= shortQuantity;

  if (reservation.quantity === 0) {
    reservation.status = 'RELEASED';
  }

  next.events.push('SHORT_PICK_REPORTED');

  return next;
}


export function cancelFlowReservations(state: WmsFlowState): WmsFlowState {
  const next = cloneState(state);

  for (const reservation of next.reservations) {
    if (reservation.status !== 'ACTIVE') {
      continue;
    }

    const quant = next.stockQuants.find((candidate) => candidate.id === reservation.stockQuantId);

    if (!quant || quant.reservedQuantity < reservation.quantity) {
      throw new Error(`Cannot cancel reservation ${reservation.id}; reserved stock is inconsistent.`);
    }

    quant.reservedQuantity -= reservation.quantity;
    quant.version = typeof quant.version === 'number' ? quant.version + 1 : quant.version;
    reservation.status = 'CANCELLED';
  }

  next.events.push('ORDER_CANCELLED_RESERVATIONS_RELEASED');

  return next;
}

export function replenishFlowPickFace(state: WmsFlowState, quantity: number): WmsFlowState {
  const next = cloneState(state);
  const quant = next.stockQuants[0];

  if (!quant) {
    throw new Error('No stock quant exists in flow state.');
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('Replenishment quantity must be a positive integer.');
  }

  quant.quantity += quantity;
  quant.version = typeof quant.version === 'number' ? quant.version + 1 : quant.version;
  next.events.push('REPLENISHMENT_COMPLETED');

  return next;
}

export function packFlowOrderLine(state: WmsFlowState, quantity: number): WmsFlowState {
  const next = cloneState(state);
  const line = next.outboundOrderLines[0];

  if (!line) {
    throw new Error('No outbound line exists in flow state.');
  }

  const result = validatePackageContentsAgainstPickedQuantities(
    next.outboundOrderLines.map((candidate) => ({
      id: candidate.id,
      lineNumber: candidate.lineNumber,
      sku: candidate.sku,
      orderedQuantity: candidate.orderedQuantity,
      pickedQuantity: candidate.pickedQuantity,
    })),
    next.packageContents,
    [{ outboundOrderLineReference: line.lineNumber, sku: line.sku, quantity }],
  );

  if (!result.ok) {
    throw new Error(result.issues.map((issue) => issue.message).join(' '));
  }

  for (const content of result.resolvedContents) {
    next.packageContents.push({
      outboundOrderLineId: content.outboundOrderLineId,
      sku: content.sku,
      quantity: content.quantity,
    });
  }

  next.shipment.packageCount += 1;
  next.shipment.labelledPackageCount += 1;
  next.events.push('ORDER_PACKED');

  return next;
}

export function stageAndShipFlow(state: WmsFlowState): WmsFlowState {
  const staged = cloneState(state);
  staged.shipment.status = 'STAGED';
  staged.shipment.stagedOrLoadedPackageCount = staged.shipment.packageCount;
  staged.events.push('SHIPMENT_STAGED');

  if (!isShipmentReadyToShip({
    packageCount: staged.shipment.packageCount,
    stagedOrLoadedPackageCount: staged.shipment.stagedOrLoadedPackageCount,
    carrierRequiresLabel: staged.shipment.carrier !== 'INTERNAL',
    labelledPackageCount: staged.shipment.labelledPackageCount,
    hasShipmentLevelLabel: staged.shipment.hasShipmentLevelLabel,
  })) {
    throw new Error('Shipment is not ready to ship.');
  }

  staged.shipment.status = 'SHIPPED';
  staged.events.push('SHIPMENT_SHIPPED');

  return staged;
}

export function validateFlowState(state: WmsFlowState): WmsInvariantIssue[] {
  return [
    ...validateStockInvariants(
      state.stockQuants.map((quant) => ({
        id: quant.id,
        quantity: quant.quantity,
        reservedQuantity: quant.reservedQuantity,
      })),
      state.reservations.map((reservation) => ({
        id: reservation.id,
        stockQuantId: reservation.stockQuantId,
        quantity: reservation.quantity,
        status: reservation.status,
      })),
    ),
    ...validatePackingInvariants(
      state.outboundOrderLines.map((line) => ({
        id: line.id,
        lineNumber: line.lineNumber,
        orderedQuantity: line.orderedQuantity,
        pickedQuantity: line.pickedQuantity,
      })),
      state.packageContents.map((content) => ({
        outboundOrderLineId: content.outboundOrderLineId,
        quantity: content.quantity,
      })),
    ),
  ];
}

export function runReceiveReservePickPackShipScenario(): WmsFlowState {
  const created = createFlowState({ onHandQuantity: 10, orderedQuantity: 4 });
  const reserved = reserveFlowStock(created, 4, 'reservation-1');
  const picked = pickFlowReservation(reserved, 'reservation-1', 4);
  const packed = packFlowOrderLine(picked, 4);

  return stageAndShipFlow(packed);
}


export function runCancelReleasesReservationsScenario(): WmsFlowState {
  const created = createFlowState({ onHandQuantity: 10, orderedQuantity: 6, carrier: 'INTERNAL' });
  const reserved = reserveFlowStock(created, 6, 'reservation-1');

  return cancelFlowReservations(reserved);
}

export function runShortPickReplenishRecoveryScenario(): WmsFlowState {
  const created = createFlowState({ onHandQuantity: 3, orderedQuantity: 5 });
  const firstReserved = reserveFlowStock(created, 3, 'reservation-1');
  const firstPicked = pickFlowReservation(firstReserved, 'reservation-1', 2);
  const shortPicked = releaseShortPickRemainder(firstPicked, 'reservation-1', 1);
  const replenished = replenishFlowPickFace(shortPicked, 3);
  const secondReserved = reserveFlowStock(replenished, 3, 'reservation-2');
  const secondPicked = pickFlowReservation(secondReserved, 'reservation-2', 3);
  const packed = packFlowOrderLine(secondPicked, 5);

  return stageAndShipFlow(packed);
}

export function simulateConcurrentReservations(
  stockQuant: WmsFlowStockQuant,
  attempts: ConcurrentReservationAttemptInput[],
): ConcurrentReservationSimulationResult {
  let current = { ...stockQuant };
  const acceptedAttempts: string[] = [];
  const rejectedAttempts: Array<{ id: string; reason: string; availableBefore: number }> = [];

  for (const attempt of attempts) {
    const result = applyAtomicReservationSnapshot(current, attempt);

    if (result.success) {
      current = { ...current, ...result.stockQuant };
      acceptedAttempts.push(attempt.id);
    } else {
      rejectedAttempts.push({
        id: attempt.id,
        reason: result.reason,
        availableBefore: result.availableBefore,
      });
    }
  }

  return {
    finalStockQuant: current,
    acceptedAttempts,
    rejectedAttempts,
  };
}

function cloneState(state: WmsFlowState): WmsFlowState {
  return {
    stockQuants: state.stockQuants.map((quant) => ({ ...quant })),
    reservations: state.reservations.map((reservation) => ({ ...reservation })),
    outboundOrderLines: state.outboundOrderLines.map((line) => ({ ...line })),
    packageContents: state.packageContents.map((content) => ({ ...content })),
    shipment: { ...state.shipment },
    events: [...state.events],
  };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}
