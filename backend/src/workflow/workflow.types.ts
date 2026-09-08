export const WmsWorkflowEntity = {
  INBOUND_SHIPMENT: 'INBOUND_SHIPMENT',
  OUTBOUND_ORDER: 'OUTBOUND_ORDER',
  WAREHOUSE_ORDER: 'WAREHOUSE_ORDER',
  WAREHOUSE_TASK: 'WAREHOUSE_TASK',
  RESERVATION: 'RESERVATION',
  SCANNER_SESSION: 'SCANNER_SESSION',
  CYCLE_COUNT_PLAN: 'CYCLE_COUNT_PLAN',
  CYCLE_COUNT_TASK: 'CYCLE_COUNT_TASK',
  REPLENISHMENT_DEMAND: 'REPLENISHMENT_DEMAND',
  SHIPMENT: 'SHIPMENT',
  SHIPMENT_PACKAGE: 'SHIPMENT_PACKAGE',
} as const;

export type WmsWorkflowEntity = (typeof WmsWorkflowEntity)[keyof typeof WmsWorkflowEntity];

export interface WmsWorkflowTransition {
  entity: WmsWorkflowEntity;
  from: string;
  to: string;
  action: string;
  permission?: string;
  reasonRequired?: boolean;
  terminal?: boolean;
  description: string;
}

export interface WorkflowTransitionRequest {
  entity: string;
  currentStatus: string;
  action?: string | null;
  targetStatus?: string | null;
  reasonCode?: string | null;
  actorPermissions?: string[] | null;
}

export interface WorkflowTransitionIssue {
  code:
    | 'UNKNOWN_ENTITY'
    | 'UNKNOWN_STATUS'
    | 'UNKNOWN_ACTION'
    | 'INVALID_TARGET_STATUS'
    | 'REASON_REQUIRED'
    | 'PERMISSION_REQUIRED';
  message: string;
}

export interface WorkflowTransitionEvaluation {
  allowed: boolean;
  entity: WmsWorkflowEntity | null;
  currentStatus: string;
  action: string | null;
  targetStatus: string | null;
  transition: WmsWorkflowTransition | null;
  allowedTransitions: WmsWorkflowTransition[];
  issues: WorkflowTransitionIssue[];
}

export interface WorkflowStatusSummary {
  entity: WmsWorkflowEntity;
  statuses: string[];
  terminalStatuses: string[];
  transitions: WmsWorkflowTransition[];
}
