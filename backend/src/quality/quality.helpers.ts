import { ConflictException } from '@nestjs/common';

import { QualityInspectionResult, QualityInspectionStatus } from './quality.types';

export function normalizeInspectionNumber(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) throw new ConflictException('Inspection number cannot be empty.');
  return normalized;
}

export function calculateSampleQuantity(input: {
  quantity: number;
  samplePercent: number;
  minSampleQuantity?: number;
  maxSampleQuantity?: number | null;
}): number {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new ConflictException('Quantity must be positive.');
  if (!Number.isFinite(input.samplePercent) || input.samplePercent <= 0 || input.samplePercent > 100) {
    throw new ConflictException('samplePercent must be in range 0-100.');
  }
  const min = input.minSampleQuantity ?? 1;
  const max = input.maxSampleQuantity ?? input.quantity;
  return Math.max(min, Math.min(max, Math.ceil((input.quantity * input.samplePercent) / 100)));
}

export function decideQualityDisposition(result: QualityInspectionResult): {
  result: QualityInspectionResult;
  inspectionStatus: QualityInspectionStatus;
  stockStatus: 'AVAILABLE' | 'BLOCKED' | 'QUARANTINE' | 'DAMAGED' | null;
  lotStatus: 'ACTIVE' | 'HOLD' | 'QUARANTINED' | 'RELEASED' | null;
  lotQualityStatus: 'RELEASED' | 'PENDING_QA' | 'HOLD' | 'REJECTED' | null;
} {
  switch (result) {
    case QualityInspectionResult.PASS:
    case QualityInspectionResult.RELEASE:
      return {
        result,
        inspectionStatus: QualityInspectionStatus.PASSED,
        stockStatus: 'AVAILABLE',
        lotStatus: 'RELEASED',
        lotQualityStatus: 'RELEASED',
      };
    case QualityInspectionResult.HOLD:
      return {
        result,
        inspectionStatus: QualityInspectionStatus.QUARANTINED,
        stockStatus: 'BLOCKED',
        lotStatus: 'HOLD',
        lotQualityStatus: 'HOLD',
      };
    case QualityInspectionResult.QUARANTINE:
      return {
        result,
        inspectionStatus: QualityInspectionStatus.QUARANTINED,
        stockStatus: 'QUARANTINE',
        lotStatus: 'QUARANTINED',
        lotQualityStatus: 'PENDING_QA',
      };
    case QualityInspectionResult.FAIL:
      return {
        result,
        inspectionStatus: QualityInspectionStatus.FAILED,
        stockStatus: 'DAMAGED',
        lotStatus: 'HOLD',
        lotQualityStatus: 'REJECTED',
      };
    default:
      throw new ConflictException('Unsupported quality inspection result.');
  }
}
