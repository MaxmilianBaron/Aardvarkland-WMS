import {
  WorkflowStatusSummary,
  WorkflowTransitionEvaluation,
  WorkflowTransitionIssue,
  WorkflowTransitionRequest,
  WmsWorkflowEntity,
  WmsWorkflowTransition,
} from './workflow.types';

export const WMS_WORKFLOW_TRANSITIONS: WmsWorkflowTransition[] = [
  transition('INBOUND_SHIPMENT', 'CREATED', 'EXPECTED', 'EXPECT', 'inbound.manage', false, 'ASN is expected and ready for dock scheduling.'),
  transition('INBOUND_SHIPMENT', 'EXPECTED', 'RECEIVING', 'START_RECEIVING', 'inbound.manage', false, 'Receiving has started at the dock.'),
  transition('INBOUND_SHIPMENT', 'RECEIVING', 'RECEIVED', 'CONFIRM_RECEIVED', 'inbound.manage', false, 'All expected receive confirmations are complete.'),
  transition('INBOUND_SHIPMENT', 'RECEIVED', 'CLOSED', 'CLOSE', 'inbound.manage', false, 'Inbound shipment is closed after putaway/reconciliation.'),
  transition('INBOUND_SHIPMENT', 'CREATED', 'CANCELLED', 'CANCEL', 'inbound.manage', true, 'Cancel an inbound shipment before warehouse execution.'),
  transition('INBOUND_SHIPMENT', 'EXPECTED', 'CANCELLED', 'CANCEL', 'inbound.manage', true, 'Cancel an expected inbound shipment.'),
  transition('INBOUND_SHIPMENT', 'RECEIVING', 'EXCEPTION', 'RAISE_EXCEPTION', 'exception.manage', true, 'Move receiving into exception handling.'),
  transition('INBOUND_SHIPMENT', 'EXCEPTION', 'RECEIVING', 'RESOLVE_EXCEPTION', 'exception.manage', true, 'Resume receiving after exception resolution.'),

  transition('OUTBOUND_ORDER', 'DRAFT', 'CREATED', 'RELEASE', 'outbound.manage', false, 'Release order from draft into allocation-ready state.'),
  transition('OUTBOUND_ORDER', 'CREATED', 'ALLOCATED', 'ALLOCATE', 'reservation.manage', false, 'Reserve stock and create/release pick work.'),
  transition('OUTBOUND_ORDER', 'ALLOCATED', 'PICKING', 'RELEASE_PICKING', 'fulfillment.manage', false, 'Release allocated order into RF picking.'),
  transition('OUTBOUND_ORDER', 'PICKING', 'PICKED', 'CONFIRM_PICKED', 'fulfillment.manage', false, 'All pick work has been confirmed.'),
  transition('OUTBOUND_ORDER', 'PICKED', 'PACKING', 'START_PACKING', 'shipment.manage', false, 'Start packing picked goods.'),
  transition('OUTBOUND_ORDER', 'PACKING', 'PACKED', 'CONFIRM_PACKED', 'shipment.manage', false, 'All picked goods are packed.'),
  transition('OUTBOUND_ORDER', 'PACKED', 'SHIPPED', 'CONFIRM_SHIPPED', 'shipment.manage', false, 'Carrier handover or load confirmation is complete.'),
  transition('OUTBOUND_ORDER', 'CREATED', 'CANCELLED', 'CANCEL', 'outbound.manage', true, 'Cancel order before allocation.'),
  transition('OUTBOUND_ORDER', 'ALLOCATED', 'CANCELLED', 'CANCEL', 'outbound.manage', true, 'Cancel allocated order and release reservations.'),
  transition('OUTBOUND_ORDER', 'PICKING', 'EXCEPTION', 'RAISE_EXCEPTION', 'exception.manage', true, 'Short pick, wrong item, or other pick exception.'),
  transition('OUTBOUND_ORDER', 'EXCEPTION', 'ALLOCATED', 'REALLOCATE', 'fulfillment.manage', true, 'Recover an exception by reallocating stock.'),
  transition('OUTBOUND_ORDER', 'EXCEPTION', 'CANCELLED', 'CANCEL', 'outbound.manage', true, 'Cancel order after unresolved exception.'),

  transition('WAREHOUSE_ORDER', 'DRAFT', 'RELEASED', 'RELEASE', 'warehouse-order.manage', false, 'Release warehouse order for execution.'),
  transition('WAREHOUSE_ORDER', 'EXCEPTION', 'RELEASED', 'RELEASE', 'warehouse-order.manage', true, 'Recover an exception and release order again.'),
  transition('WAREHOUSE_ORDER', 'RELEASED', 'IN_PROGRESS', 'START', 'warehouse-order.manage', false, 'Start warehouse order execution.'),
  transition('WAREHOUSE_ORDER', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'PARTIAL_COMPLETE', 'warehouse-order.manage', false, 'Record partial warehouse order completion.'),
  transition('WAREHOUSE_ORDER', 'RELEASED', 'COMPLETED', 'COMPLETE', 'warehouse-order.manage', false, 'Complete released warehouse order.'),
  transition('WAREHOUSE_ORDER', 'IN_PROGRESS', 'COMPLETED', 'COMPLETE', 'warehouse-order.manage', false, 'Complete in-progress warehouse order.'),
  transition('WAREHOUSE_ORDER', 'PARTIALLY_COMPLETED', 'COMPLETED', 'COMPLETE', 'warehouse-order.manage', false, 'Complete a partially completed warehouse order.'),
  transition('WAREHOUSE_ORDER', 'DRAFT', 'CANCELLED', 'CANCEL', 'warehouse-order.manage', true, 'Cancel draft warehouse order.'),
  transition('WAREHOUSE_ORDER', 'RELEASED', 'CANCELLED', 'CANCEL', 'warehouse-order.manage', true, 'Cancel released warehouse order and release linked reservations/tasks.'),
  transition('WAREHOUSE_ORDER', 'IN_PROGRESS', 'CANCELLED', 'CANCEL', 'warehouse-order.manage', true, 'Cancel in-progress warehouse order with a reason code.'),
  transition('WAREHOUSE_ORDER', 'PARTIALLY_COMPLETED', 'CANCELLED', 'CANCEL', 'warehouse-order.manage', true, 'Cancel partially completed warehouse order with a reason code.'),
  transition('WAREHOUSE_ORDER', 'RELEASED', 'EXCEPTION', 'RAISE_EXCEPTION', 'exception.manage', true, 'Move released warehouse order into exception handling.'),
  transition('WAREHOUSE_ORDER', 'IN_PROGRESS', 'EXCEPTION', 'RAISE_EXCEPTION', 'exception.manage', true, 'Move in-progress warehouse order into exception handling.'),

  transition('WAREHOUSE_TASK', 'OPEN', 'ASSIGNED', 'ASSIGN', 'task.manage', false, 'Assign work to an operator or robot resource.'),
  transition('WAREHOUSE_TASK', 'OPEN', 'IN_PROGRESS', 'START', 'task.manage', false, 'Start unassigned work directly.'),
  transition('WAREHOUSE_TASK', 'ASSIGNED', 'IN_PROGRESS', 'START', 'task.manage', false, 'Assigned operator starts the task.'),
  transition('WAREHOUSE_TASK', 'IN_PROGRESS', 'DONE', 'COMPLETE', 'task.manage', false, 'Task is physically confirmed.'),
  transition('WAREHOUSE_TASK', 'OPEN', 'BLOCKED', 'BLOCK', 'task.manage', true, 'Block task because dependencies or stock are not ready.'),
  transition('WAREHOUSE_TASK', 'ASSIGNED', 'BLOCKED', 'BLOCK', 'task.manage', true, 'Block assigned task.'),
  transition('WAREHOUSE_TASK', 'IN_PROGRESS', 'BLOCKED', 'BLOCK', 'task.manage', true, 'Block in-progress task.'),
  transition('WAREHOUSE_TASK', 'BLOCKED', 'OPEN', 'UNBLOCK', 'task.manage', true, 'Return blocked work to open queue.'),
  transition('WAREHOUSE_TASK', 'IN_PROGRESS', 'FAILED', 'FAIL', 'task.manage', true, 'Task failed and needs exception/recovery.'),
  transition('WAREHOUSE_TASK', 'OPEN', 'CANCELLED', 'CANCEL', 'task.manage', true, 'Cancel open task.'),
  transition('WAREHOUSE_TASK', 'ASSIGNED', 'CANCELLED', 'CANCEL', 'task.manage', true, 'Cancel assigned task.'),

  transition('RESERVATION', 'ACTIVE', 'PICKED', 'PICK', 'fulfillment.manage', false, 'Reserved stock was picked.'),
  transition('RESERVATION', 'ACTIVE', 'RELEASED', 'RELEASE', 'reservation.manage', true, 'Release reservation back to available stock.'),
  transition('RESERVATION', 'ACTIVE', 'CANCELLED', 'CANCEL', 'reservation.manage', true, 'Cancel reservation.'),

  transition('SCANNER_SESSION', 'ACTIVE', 'COMPLETED', 'COMPLETE', 'rf.manage', false, 'RF workflow completed successfully.'),
  transition('SCANNER_SESSION', 'ACTIVE', 'CANCELLED', 'CANCEL', 'rf.manage', true, 'Operator cancelled RF workflow.'),
  transition('SCANNER_SESSION', 'ACTIVE', 'EXPIRED', 'EXPIRE', 'rf.manage', false, 'Session timed out due to inactivity.'),

  transition('CYCLE_COUNT_PLAN', 'DRAFT', 'RELEASED', 'RELEASE', 'cycle-count.manage', false, 'Release count plan and freeze scope.'),
  transition('CYCLE_COUNT_PLAN', 'RELEASED', 'COUNTING', 'START_COUNTING', 'cycle-count.manage', false, 'Counting has started.'),
  transition('CYCLE_COUNT_PLAN', 'COUNTING', 'RECONCILING', 'SUBMIT_COUNTS', 'cycle-count.manage', false, 'Counts submitted and waiting for variance decision.'),
  transition('CYCLE_COUNT_PLAN', 'RECONCILING', 'APPROVED', 'APPROVE', 'cycle-count.manage', false, 'Approve variances and release freezes.'),
  transition('CYCLE_COUNT_PLAN', 'DRAFT', 'CANCELLED', 'CANCEL', 'cycle-count.manage', true, 'Cancel draft count plan.'),
  transition('CYCLE_COUNT_PLAN', 'RELEASED', 'CANCELLED', 'CANCEL', 'cycle-count.manage', true, 'Cancel released count plan and release freezes.'),
  transition('CYCLE_COUNT_TASK', 'OPEN', 'IN_PROGRESS', 'START', 'cycle-count.manage', false, 'Operator starts blind count.'),
  transition('CYCLE_COUNT_TASK', 'IN_PROGRESS', 'SUBMITTED', 'SUBMIT', 'cycle-count.manage', false, 'Submit counted quantity.'),
  transition('CYCLE_COUNT_TASK', 'SUBMITTED', 'APPROVED', 'APPROVE', 'cycle-count.manage', false, 'Approve count result.'),
  transition('CYCLE_COUNT_TASK', 'SUBMITTED', 'REJECTED', 'REJECT', 'cycle-count.manage', true, 'Reject count and request recount.'),
  transition('CYCLE_COUNT_TASK', 'OPEN', 'CANCELLED', 'CANCEL', 'cycle-count.manage', true, 'Cancel count task.'),

  transition('REPLENISHMENT_DEMAND', 'OPEN', 'TASK_CREATED', 'CREATE_TASK', 'replenishment.manage', false, 'Create replenishment task from demand.'),
  transition('REPLENISHMENT_DEMAND', 'TASK_CREATED', 'COMPLETED', 'CONFIRM_REPLENISHED', 'replenishment.manage', false, 'Replenishment task confirmed.'),
  transition('REPLENISHMENT_DEMAND', 'OPEN', 'CANCELLED', 'CANCEL', 'replenishment.manage', true, 'Cancel demand.'),
  transition('REPLENISHMENT_DEMAND', 'TASK_CREATED', 'CANCELLED', 'CANCEL', 'replenishment.manage', true, 'Cancel demand and related work.'),

  transition('SHIPMENT', 'DRAFT', 'PACKING', 'START_PACKING', 'shipment.manage', false, 'Start packing shipment.'),
  transition('SHIPMENT', 'PACKING', 'STAGED', 'STAGE', 'shipment.manage', false, 'Move packed packages to staging.'),
  transition('SHIPMENT', 'STAGED', 'LOADING', 'START_LOADING', 'shipment.manage', false, 'Start loading staged shipment.'),
  transition('SHIPMENT', 'STAGED', 'SHIPPED', 'SHIP', 'shipment.manage', false, 'Confirm shipment directly from staging.'),
  transition('SHIPMENT', 'LOADING', 'SHIPPED', 'SHIP', 'shipment.manage', false, 'Confirm loaded shipment as shipped.'),
  transition('SHIPMENT', 'PACKING', 'EXCEPTION', 'RAISE_EXCEPTION', 'exception.manage', true, 'Shipment packing exception.'),
  transition('SHIPMENT', 'EXCEPTION', 'PACKING', 'RESOLVE_EXCEPTION', 'exception.manage', true, 'Return shipment to packing after exception resolution.'),
  transition('SHIPMENT', 'DRAFT', 'CANCELLED', 'CANCEL', 'shipment.manage', true, 'Cancel draft shipment.'),
  transition('SHIPMENT', 'PACKING', 'CANCELLED', 'CANCEL', 'shipment.manage', true, 'Cancel packing shipment.'),
  transition('SHIPMENT_PACKAGE', 'OPEN', 'PACKED', 'PACK', 'shipment.manage', false, 'Package is packed.'),
  transition('SHIPMENT_PACKAGE', 'PACKED', 'STAGED', 'STAGE', 'shipment.manage', false, 'Package staged for loading.'),
  transition('SHIPMENT_PACKAGE', 'STAGED', 'LOADED', 'LOAD', 'shipment.manage', false, 'Package loaded onto carrier/trailer.'),
  transition('SHIPMENT_PACKAGE', 'LOADED', 'SHIPPED', 'SHIP', 'shipment.manage', false, 'Package left the warehouse.'),
  transition('SHIPMENT_PACKAGE', 'PACKED', 'CANCELLED', 'CANCEL', 'shipment.manage', true, 'Cancel package before ship confirmation.'),
];

const TERMINAL_STATUSES_BY_ENTITY: Record<WmsWorkflowEntity, Set<string>> = {
  INBOUND_SHIPMENT: new Set(['CLOSED', 'CANCELLED']),
  OUTBOUND_ORDER: new Set(['SHIPPED', 'CANCELLED']),
  WAREHOUSE_ORDER: new Set(['COMPLETED', 'CANCELLED']),
  WAREHOUSE_TASK: new Set(['DONE', 'FAILED', 'CANCELLED']),
  RESERVATION: new Set(['PICKED', 'RELEASED', 'CANCELLED']),
  SCANNER_SESSION: new Set(['COMPLETED', 'CANCELLED', 'EXPIRED']),
  CYCLE_COUNT_PLAN: new Set(['APPROVED', 'CANCELLED']),
  CYCLE_COUNT_TASK: new Set(['APPROVED', 'CANCELLED']),
  REPLENISHMENT_DEMAND: new Set(['COMPLETED', 'CANCELLED']),
  SHIPMENT: new Set(['SHIPPED', 'CANCELLED']),
  SHIPMENT_PACKAGE: new Set(['SHIPPED', 'CANCELLED']),
};

export function getWorkflowSummary(entityInput: string): WorkflowStatusSummary | null {
  const entity = normalizeWorkflowEntity(entityInput);

  if (!entity) {
    return null;
  }

  const transitions = getTransitionsForEntity(entity);
  const statuses = Array.from(
    new Set(transitions.flatMap((candidate) => [candidate.from, candidate.to])),
  ).sort();
  const terminalStatuses = Array.from(TERMINAL_STATUSES_BY_ENTITY[entity]).sort();

  return {
    entity,
    statuses,
    terminalStatuses,
    transitions,
  };
}

export function getAllowedWorkflowTransitions(
  entityInput: string,
  currentStatusInput: string,
): WmsWorkflowTransition[] {
  const entity = normalizeWorkflowEntity(entityInput);
  const currentStatus = normalizeStatus(currentStatusInput);

  if (!entity) {
    return [];
  }

  return WMS_WORKFLOW_TRANSITIONS.filter(
    (candidate) => candidate.entity === entity && candidate.from === currentStatus,
  ).map(markTerminalTransition);
}

export function evaluateWorkflowTransition(
  input: WorkflowTransitionRequest,
): WorkflowTransitionEvaluation {
  const entity = normalizeWorkflowEntity(input.entity);
  const currentStatus = normalizeStatus(input.currentStatus);
  const action = normalizeOptionalStatus(input.action);
  const targetStatus = normalizeOptionalStatus(input.targetStatus);
  const reasonCode = normalizeOptionalStatus(input.reasonCode);
  const actorPermissions = new Set((input.actorPermissions ?? []).map(normalizePermission));
  const issues: WorkflowTransitionIssue[] = [];

  if (!entity) {
    return baseEvaluation(null, currentStatus, action, targetStatus, [], [
      { code: 'UNKNOWN_ENTITY', message: `Workflow entity ${input.entity} is not supported.` },
    ]);
  }

  const allowedTransitions = getAllowedWorkflowTransitions(entity, currentStatus);

  if (allowedTransitions.length === 0) {
    return baseEvaluation(entity, currentStatus, action, targetStatus, [], [
      {
        code: 'UNKNOWN_STATUS',
        message: `No workflow transitions are available from ${entity}.${currentStatus}.`,
      },
    ]);
  }

  const transition = allowedTransitions.find((candidate) => {
    if (action && candidate.action !== action) {
      return false;
    }

    if (targetStatus && candidate.to !== targetStatus) {
      return false;
    }

    return true;
  }) ?? null;

  if (!transition) {
    if (action && !allowedTransitions.some((candidate) => candidate.action === action)) {
      issues.push({
        code: 'UNKNOWN_ACTION',
        message: `Action ${action} is not valid from ${entity}.${currentStatus}.`,
      });
    }

    if (targetStatus && !allowedTransitions.some((candidate) => candidate.to === targetStatus)) {
      issues.push({
        code: 'INVALID_TARGET_STATUS',
        message: `Target status ${targetStatus} is not valid from ${entity}.${currentStatus}.`,
      });
    }

    if (!action && !targetStatus) {
      issues.push({
        code: 'UNKNOWN_ACTION',
        message: 'Provide action or targetStatus to validate a specific transition.',
      });
    }

    return baseEvaluation(entity, currentStatus, action, targetStatus, allowedTransitions, issues);
  }

  if (transition.reasonRequired && !reasonCode) {
    issues.push({
      code: 'REASON_REQUIRED',
      message: `Transition ${transition.action} requires a reasonCode.`,
    });
  }

  if (transition.permission && actorPermissions.size > 0 && !actorPermissions.has(transition.permission)) {
    issues.push({
      code: 'PERMISSION_REQUIRED',
      message: `Transition ${transition.action} requires permission ${transition.permission}.`,
    });
  }

  return {
    allowed: issues.length === 0,
    entity,
    currentStatus,
    action: transition.action,
    targetStatus: transition.to,
    transition,
    allowedTransitions,
    issues,
  };
}

export function assertWorkflowTransitionAllowed(input: WorkflowTransitionRequest): WmsWorkflowTransition {
  const evaluation = evaluateWorkflowTransition(input);

  if (!evaluation.allowed || !evaluation.transition) {
    throw new Error(evaluation.issues.map((issue) => issue.message).join(' ') || 'Workflow transition is not allowed.');
  }

  return evaluation.transition;
}

export function normalizeWorkflowEntity(value: string): WmsWorkflowEntity | null {
  const normalized = normalizeStatus(value);

  return isWmsWorkflowEntity(normalized) ? normalized : null;
}

function getTransitionsForEntity(entity: WmsWorkflowEntity): WmsWorkflowTransition[] {
  return WMS_WORKFLOW_TRANSITIONS.filter((transition) => transition.entity === entity).map(markTerminalTransition);
}

function baseEvaluation(
  entity: WmsWorkflowEntity | null,
  currentStatus: string,
  action: string | null,
  targetStatus: string | null,
  allowedTransitions: WmsWorkflowTransition[],
  issues: WorkflowTransitionIssue[],
): WorkflowTransitionEvaluation {
  return {
    allowed: false,
    entity,
    currentStatus,
    action,
    targetStatus,
    transition: null,
    allowedTransitions,
    issues,
  };
}

function markTerminalTransition(transition: WmsWorkflowTransition): WmsWorkflowTransition {
  return {
    ...transition,
    terminal: TERMINAL_STATUSES_BY_ENTITY[transition.entity].has(transition.to),
  };
}

function transition(
  entity: WmsWorkflowEntity,
  from: string,
  to: string,
  action: string,
  permission: string | undefined,
  reasonRequired: boolean,
  description: string,
): WmsWorkflowTransition {
  return {
    entity,
    from,
    to,
    action,
    permission,
    reasonRequired,
    description,
    terminal: false,
  };
}

function normalizeStatus(value: string): string {
  return value.trim().replace(/[\s-]+/g, '_').toUpperCase();
}

function normalizeOptionalStatus(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim().length === 0) {
    return null;
  }

  return normalizeStatus(value);
}

function normalizePermission(value: string): string {
  return value.trim().toLowerCase();
}

function isWmsWorkflowEntity(value: string): value is WmsWorkflowEntity {
  return Object.values(WmsWorkflowEntity).includes(value as WmsWorkflowEntity);
}
