import { ConflictException } from '@nestjs/common';

export interface StorageRequirementInput {
  temperatureMinCelsius?: number | null;
  temperatureMaxCelsius?: number | null;
  fragile?: boolean;
  hazardous?: boolean;
  oversized?: boolean;
  stackable?: boolean;
}

export interface PackagingLevelInput {
  levelCode: string;
  unitsPerLevel: number;
  parentLevelCode?: string | null;
  isDefault?: boolean | null;
}

export function normalizeMasterCode(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '-');
  if (!normalized) throw new ConflictException('Code cannot be empty.');
  return normalized;
}

export function normalizeBarcode(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ConflictException('Barcode cannot be empty.');
  return normalized;
}

export function normalizeStorageRequirement(input: StorageRequirementInput): Required<StorageRequirementInput> {
  const min = input.temperatureMinCelsius ?? null;
  const max = input.temperatureMaxCelsius ?? null;
  if (min !== null && max !== null && min > max) {
    throw new ConflictException('temperatureMinCelsius cannot be greater than temperatureMaxCelsius.');
  }
  return {
    temperatureMinCelsius: min,
    temperatureMaxCelsius: max,
    fragile: input.fragile ?? false,
    hazardous: input.hazardous ?? false,
    oversized: input.oversized ?? false,
    stackable: input.stackable ?? true,
  };
}

export function validatePackagingHierarchy(levels: PackagingLevelInput[]): void {
  const byCode = new Map<string, PackagingLevelInput>();
  let defaultCount = 0;
  for (const level of levels) {
    const code = normalizeMasterCode(level.levelCode);
    if (byCode.has(code)) throw new ConflictException(`Duplicate packaging level ${code}.`);
    if (!Number.isInteger(level.unitsPerLevel) || level.unitsPerLevel <= 0) {
      throw new ConflictException('unitsPerLevel must be a positive integer.');
    }
    if (level.isDefault) defaultCount += 1;
    byCode.set(code, { ...level, levelCode: code });
  }
  if (defaultCount > 1) throw new ConflictException('Only one default packaging level is allowed per SKU.');

  for (const level of byCode.values()) {
    const parent = level.parentLevelCode ? normalizeMasterCode(level.parentLevelCode) : null;
    if (!parent) continue;
    if (!byCode.has(parent)) throw new ConflictException(`Parent packaging level ${parent} does not exist.`);
    if (parent === level.levelCode) throw new ConflictException('Packaging level cannot be its own parent.');
    const parentLevel = byCode.get(parent);
    if (parentLevel && parentLevel.unitsPerLevel >= level.unitsPerLevel) {
      throw new ConflictException('Parent packaging level must contain fewer units than child level.');
    }
  }
}

export function convertUomQuantity(quantity: number, multiplier: number): number {
  if (!Number.isFinite(quantity) || quantity < 0) throw new ConflictException('Quantity must be non-negative.');
  if (!Number.isFinite(multiplier) || multiplier <= 0) throw new ConflictException('UoM multiplier must be greater than zero.');
  return Number((quantity * multiplier).toFixed(6));
}
