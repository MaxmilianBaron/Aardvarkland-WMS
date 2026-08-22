import { ControlTowerRisk, StatusCount } from './control-tower.types';

export function summarizeCounts(
  rows: Array<{
    key?: string | null;
    status?: string | null;
    type?: string | null;
    severity?: string | null;
    _count?: number | { _all?: number };
  }>,
): StatusCount[] {
  return rows
    .map((row) => ({
      key: String(row.key ?? row.status ?? row.type ?? row.severity ?? 'UNKNOWN'),
      count: readCount(row._count),
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => (b.count === a.count ? a.key.localeCompare(b.key) : b.count - a.count));
}

export function countByKey(rows: StatusCount[], keys: string[]): number {
  const keySet = new Set(keys);
  return rows.filter((row) => keySet.has(row.key)).reduce((sum, row) => sum + row.count, 0);
}

export function buildControlTowerRisks(input: {
  openTasks: number;
  staleTasks: number;
  cutoffRiskOrders: number;
  carrierExceptions: number;
  criticalOpenExceptions: number;
  unreleasedWaves: number;
  openSlottingRecommendations?: number;
}): ControlTowerRisk[] {
  const risks: ControlTowerRisk[] = [];
  if (input.criticalOpenExceptions > 0) {
    risks.push({
      code: 'CRITICAL_EXCEPTIONS_OPEN',
      severity: 'CRITICAL',
      message: 'Critical warehouse exceptions are open.',
      metric: input.criticalOpenExceptions,
    });
  }
  if (input.cutoffRiskOrders > 0) {
    risks.push({
      code: 'CUTOFF_RISK_ORDERS',
      severity: input.cutoffRiskOrders >= 10 ? 'CRITICAL' : 'HIGH',
      message: 'Orders are approaching carrier cutoff while not shipped.',
      metric: input.cutoffRiskOrders,
    });
  }
  if (input.carrierExceptions > 0) {
    risks.push({
      code: 'CARRIER_TRACKING_EXCEPTIONS',
      severity: input.carrierExceptions >= 10 ? 'HIGH' : 'MEDIUM',
      message: 'Carrier tracking exceptions need review.',
      metric: input.carrierExceptions,
    });
  }
  if (input.staleTasks > 0) {
    risks.push({
      code: 'STALE_TASK_BACKLOG',
      severity:
        input.staleTasks >= Math.max(10, Math.floor(input.openTasks / 2)) ? 'HIGH' : 'MEDIUM',
      message: 'Warehouse tasks have been open longer than the stale-task window.',
      metric: input.staleTasks,
    });
  }
  if ((input.openSlottingRecommendations ?? 0) > 0) {
    risks.push({
      code: 'SLOTTING_RECOMMENDATIONS_OPEN',
      severity: (input.openSlottingRecommendations ?? 0) >= 25 ? 'MEDIUM' : 'LOW',
      message: 'Open slotting recommendations can improve pick-path efficiency.',
      metric: input.openSlottingRecommendations ?? 0,
    });
  }
  if (input.unreleasedWaves > 0) {
    risks.push({
      code: 'UNRELEASED_WAVES',
      severity: 'LOW',
      message: 'Planned/draft pick waves are waiting for release.',
      metric: input.unreleasedWaves,
    });
  }
  return risks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function getCutoffWindow(now: Date, hours: number): { from: Date; to: Date } {
  const normalizedHours = Math.max(1, Math.min(hours, 72));
  return { from: now, to: new Date(now.getTime() + normalizedHours * 60 * 60 * 1000) };
}

export function getStaleTaskThreshold(now: Date, minutes: number): Date {
  const normalizedMinutes = Math.max(5, Math.min(minutes, 60 * 24 * 14));
  return new Date(now.getTime() - normalizedMinutes * 60 * 1000);
}

function readCount(value: number | { _all?: number } | undefined): number {
  if (typeof value === 'number') return value;
  return value?._all ?? 0;
}

function severityRank(severity: ControlTowerRisk['severity']): number {
  switch (severity) {
    case 'CRITICAL':
      return 4;
    case 'HIGH':
      return 3;
    case 'MEDIUM':
      return 2;
    case 'LOW':
      return 1;
  }
}
