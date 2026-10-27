import { RfExpectedScan, RfStepKey, RfWorkflowType } from './rf-workflows.types';

export interface RfTaskLike {
  type: string;
  quantity?: number | null;
  fromLocation?: { code?: string | null; barcode?: string | null } | null;
  toLocation?: { code?: string | null; barcode?: string | null } | null;
  sku?: { code?: string | null; barcode?: string | null } | null;
  handlingUnit?: { code?: string | null } | null;
}

export interface RfStepPlan {
  key: string;
  instruction: string;
  expected: RfExpectedScan;
}

export type RfStepDefinitionKind =
  | 'SOURCE_LOCATION'
  | 'DESTINATION_LOCATION'
  | 'ITEM_OR_HU'
  | 'ITEM'
  | 'HANDLING_UNIT'
  | 'QUANTITY'
  | 'COMPLETE';

export interface RfStepDefinition {
  key: string;
  kind: RfStepDefinitionKind;
  optional?: boolean;
}

export const RF_WORKFLOW_DEFINITIONS: Record<RfWorkflowType, RfStepDefinition[]> = {
  [RfWorkflowType.RECEIVE]: [
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU' },
    { key: RfStepKey.CONFIRM_QUANTITY, kind: 'QUANTITY' },
    { key: RfStepKey.SCAN_DESTINATION_LOCATION, kind: 'DESTINATION_LOCATION', optional: true },
  ],
  [RfWorkflowType.PUTAWAY]: [
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU' },
    { key: RfStepKey.SCAN_SOURCE_LOCATION, kind: 'SOURCE_LOCATION', optional: true },
    { key: RfStepKey.SCAN_DESTINATION_LOCATION, kind: 'DESTINATION_LOCATION' },
    { key: RfStepKey.CONFIRM_QUANTITY, kind: 'QUANTITY' },
  ],
  [RfWorkflowType.PICK]: [
    { key: RfStepKey.SCAN_SOURCE_LOCATION, kind: 'SOURCE_LOCATION' },
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU' },
    { key: RfStepKey.CONFIRM_QUANTITY, kind: 'QUANTITY' },
    { key: RfStepKey.SCAN_DESTINATION_LOCATION, kind: 'DESTINATION_LOCATION', optional: true },
  ],
  [RfWorkflowType.PACK]: [
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU' },
    { key: RfStepKey.CONFIRM_QUANTITY, kind: 'QUANTITY' },
    { key: RfStepKey.SCAN_DESTINATION_LOCATION, kind: 'DESTINATION_LOCATION', optional: true },
  ],
  [RfWorkflowType.MOVE]: [
    { key: RfStepKey.SCAN_SOURCE_LOCATION, kind: 'SOURCE_LOCATION' },
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU', optional: true },
    { key: RfStepKey.CONFIRM_QUANTITY, kind: 'QUANTITY' },
    { key: RfStepKey.SCAN_DESTINATION_LOCATION, kind: 'DESTINATION_LOCATION' },
  ],
  [RfWorkflowType.COUNT]: [
    { key: RfStepKey.SCAN_SOURCE_LOCATION, kind: 'SOURCE_LOCATION' },
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU', optional: true },
    { key: RfStepKey.CONFIRM_QUANTITY, kind: 'QUANTITY' },
  ],
  [RfWorkflowType.REPLENISH]: [
    { key: RfStepKey.SCAN_SOURCE_LOCATION, kind: 'SOURCE_LOCATION' },
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU' },
    { key: RfStepKey.CONFIRM_QUANTITY, kind: 'QUANTITY' },
    { key: RfStepKey.SCAN_DESTINATION_LOCATION, kind: 'DESTINATION_LOCATION' },
  ],
  [RfWorkflowType.LOAD]: [
    { key: RfStepKey.SCAN_ITEM_OR_HANDLING_UNIT, kind: 'ITEM_OR_HU' },
    { key: RfStepKey.SCAN_DESTINATION_LOCATION, kind: 'DESTINATION_LOCATION', optional: true },
  ],
};

export function workflowFromTaskType(taskType: string): RfWorkflowType {
  return isRfWorkflowType(taskType) ? taskType : RfWorkflowType.MOVE;
}

export function buildRfStepPlanSequence(task: RfTaskLike): RfStepPlan[] {
  const workflow = workflowFromTaskType(task.type);
  const definitions = RF_WORKFLOW_DEFINITIONS[workflow] ?? RF_WORKFLOW_DEFINITIONS.MOVE;
  const steps = definitions
    .map((definition) => stepPlanFromDefinition(task, definition))
    .filter((step): step is RfStepPlan => step !== null);

  if (steps.length === 0) {
    return [quantityStep(task.quantity ?? null)];
  }

  return dedupeConsecutiveStepKeys(steps);
}

export function getInitialStepForTask(task: RfTaskLike): RfStepPlan {
  return buildRfStepPlanSequence(task)[0] ?? quantityStep(task.quantity ?? null);
}

export function getNextStepAfterScan(
  task: RfTaskLike,
  completedStepKey: string,
): RfStepPlan | null {
  const steps = buildRfStepPlanSequence(task);
  const index = steps.findIndex((step) => step.key === completedStepKey);

  if (index < 0) {
    return null;
  }

  return steps[index + 1] ?? null;
}

export function isExpectedScan(expected: RfExpectedScan, scannedValue: string): boolean {
  const normalizedScan = normalizeScan(scannedValue);
  const candidates = compact([expected.value, ...(expected.alternatives ?? [])]).map(normalizeScan);

  if (expected.type === 'QUANTITY' || expected.type === 'NONE') {
    return true;
  }

  return candidates.includes(normalizedScan);
}

export function quantityStep(quantity: number | null): RfStepPlan {
  return {
    key: RfStepKey.CONFIRM_QUANTITY,
    instruction: quantity ? `Potvrď množství ${quantity}` : 'Potvrď množství',
    expected: { type: 'QUANTITY', value: quantity === null ? null : String(quantity) },
  };
}

function stepPlanFromDefinition(task: RfTaskLike, definition: RfStepDefinition): RfStepPlan | null {
  switch (definition.kind) {
    case 'SOURCE_LOCATION':
      return locationStep(
        definition.key,
        task.fromLocation,
        'zdrojovou lokaci',
        definition.optional,
      );
    case 'DESTINATION_LOCATION':
      return locationStep(definition.key, task.toLocation, 'cílovou lokaci', definition.optional);
    case 'ITEM_OR_HU':
      return task.handlingUnit?.code
        ? handlingUnitStep(task.handlingUnit.code, definition.key)
        : itemStep(task, definition.key, definition.optional);
    case 'ITEM':
      return itemStep(task, definition.key, definition.optional);
    case 'HANDLING_UNIT':
      return task.handlingUnit?.code
        ? handlingUnitStep(task.handlingUnit.code, definition.key)
        : optionalOrFallback(definition.optional);
    case 'QUANTITY':
      return quantityStep(task.quantity ?? null);
    case 'COMPLETE':
      return {
        key: RfStepKey.COMPLETE_TASK,
        instruction: 'Dokonči RF workflow.',
        expected: { type: 'NONE', value: null },
      };
    default:
      return null;
  }
}

function locationStep(
  key: string,
  location: { code?: string | null; barcode?: string | null } | null | undefined,
  label: string,
  optional?: boolean,
): RfStepPlan | null {
  if (!location?.code && !location?.barcode) {
    return optionalOrFallback(optional);
  }

  return {
    key,
    instruction: `Naskenuj ${label} ${location.code ?? location.barcode}`,
    expected: {
      type: 'LOCATION',
      value: location.barcode ?? location.code ?? null,
      alternatives: compact([location.code, location.barcode]),
    },
  };
}

function itemStep(task: RfTaskLike, key: string, optional?: boolean): RfStepPlan | null {
  if (!task.sku?.code && !task.sku?.barcode) {
    return optionalOrFallback(optional);
  }

  return {
    key,
    instruction: `Naskenuj SKU ${task.sku.code ?? task.sku.barcode}`,
    expected: {
      type: 'SKU',
      value: task.sku.barcode ?? task.sku.code ?? null,
      alternatives: compact([task.sku.code, task.sku.barcode]),
    },
  };
}

function handlingUnitStep(code: string, key: string): RfStepPlan {
  return {
    key,
    instruction: `Naskenuj HU ${code}`,
    expected: { type: 'HANDLING_UNIT', value: code },
  };
}

function optionalOrFallback(optional: boolean | undefined): RfStepPlan | null {
  void optional;

  return null;
}

function dedupeConsecutiveStepKeys(steps: RfStepPlan[]): RfStepPlan[] {
  return steps.filter((step, index) => index === 0 || steps[index - 1]?.key !== step.key);
}

function isRfWorkflowType(value: string): value is RfWorkflowType {
  return Object.values(RfWorkflowType).includes(value as RfWorkflowType);
}

function normalizeScan(value: string): string {
  return value.trim().toUpperCase();
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
  );
}
