export type PrintAgentReportedStatus = 'PRINTING' | 'PRINTED' | 'FAILED' | 'CANCELLED';

const allowedTransitions: Record<string, ReadonlySet<PrintAgentReportedStatus>> = {
  CLAIMED: new Set(['PRINTING', 'PRINTED', 'FAILED', 'CANCELLED']),
  PRINTING: new Set(['PRINTING', 'PRINTED', 'FAILED', 'CANCELLED']),
  PRINTED: new Set(['PRINTED']),
  FAILED: new Set(['FAILED']),
  CANCELLED: new Set(['CANCELLED']),
};

export function isPrintAgentStatusTransitionAllowed(
  currentStatus: string,
  reportedStatus: PrintAgentReportedStatus,
): boolean {
  return allowedTransitions[currentStatus]?.has(reportedStatus) ?? false;
}
