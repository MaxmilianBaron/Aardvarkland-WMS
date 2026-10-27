import { ConflictException } from '@nestjs/common';

import { ReturnDisposition, ReturnLineStatus, ReturnOrderStatus } from './returns.types';

export function normalizeReturnReference(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException('Return reference cannot be empty.');
  return normalized;
}

export function assertReturnQuantity(quantity: number, label = 'quantity'): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new ConflictException(`${label} must be a positive integer.`);
  }
  return quantity;
}

export function decideReturnDisposition(disposition: ReturnDisposition): {
  disposition: ReturnDisposition;
  createsStock: boolean;
  stockStatus: 'AVAILABLE' | 'QUARANTINE' | 'DAMAGED' | null;
  closesLine: boolean;
} {
  switch (disposition) {
    case ReturnDisposition.RESTOCK:
      return { disposition, createsStock: true, stockStatus: 'AVAILABLE', closesLine: true };
    case ReturnDisposition.QUARANTINE:
      return { disposition, createsStock: true, stockStatus: 'QUARANTINE', closesLine: true };
    case ReturnDisposition.DAMAGED:
      return { disposition, createsStock: true, stockStatus: 'DAMAGED', closesLine: true };
    case ReturnDisposition.SCRAP:
    case ReturnDisposition.SUPPLIER_RETURN:
      return { disposition, createsStock: false, stockStatus: null, closesLine: true };
    default:
      throw new ConflictException('Unsupported return disposition.');
  }
}

export function nextReturnLineStatus(input: {
  expectedQuantity: number;
  receivedQuantity: number;
  inspectedQuantity: number;
  disposition?: ReturnDisposition | null;
}): ReturnLineStatus {
  if (input.disposition && input.inspectedQuantity >= input.expectedQuantity) return ReturnLineStatus.CLOSED;
  if (input.inspectedQuantity > 0) return ReturnLineStatus.PARTIALLY_INSPECTED;
  if (input.receivedQuantity >= input.expectedQuantity) return ReturnLineStatus.RECEIVED;
  if (input.receivedQuantity > 0) return ReturnLineStatus.PARTIALLY_RECEIVED;
  return ReturnLineStatus.OPEN;
}

export function nextReturnOrderStatus(lineStatuses: ReturnLineStatus[]): ReturnOrderStatus {
  if (lineStatuses.length === 0) return ReturnOrderStatus.CREATED;
  if (lineStatuses.every((status) => status === ReturnLineStatus.CLOSED || status === ReturnLineStatus.REJECTED)) {
    return ReturnOrderStatus.CLOSED;
  }
  if (lineStatuses.some((status) => status.includes('INSPECTED') || status === ReturnLineStatus.CLOSED)) {
    return ReturnOrderStatus.INSPECTION;
  }
  if (lineStatuses.some((status) => status !== ReturnLineStatus.OPEN)) return ReturnOrderStatus.RECEIVING;
  return ReturnOrderStatus.CREATED;
}
