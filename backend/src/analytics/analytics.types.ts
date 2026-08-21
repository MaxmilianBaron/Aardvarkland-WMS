import { ParcelStatus, WarehouseLocationType } from '../generated/prisma/client';

export interface AnalyticsWarehouseScope {
  id: string;
  code: string;
  name: string;
  timezone: string;
}

export interface AnalyticsWindow {
  days: number;
  since: Date;
}

export interface AnalyticsCountByStatus {
  status: ParcelStatus;
  count: number;
  ratio: number;
}

export interface AnalyticsCountByLocationType {
  type: WarehouseLocationType;
  count: number;
}

export type OptionalMetricCounterKey =
  | 'open'
  | 'pending'
  | 'failed'
  | 'queued'
  | 'ready'
  | 'inProgress';

export type OptionalOperationalMetric = {
  available: boolean;
  total: number;
} & Partial<Record<OptionalMetricCounterKey, number>>;

export interface ParcelAnalyticsSnapshot {
  total: number;
  createdInWindow: number;
  updatedInWindow: number;
  exceptionRatio: number;
  byStatus: AnalyticsCountByStatus[];
}

export interface LocationAnalyticsSnapshot {
  total: number;
  active: number;
  inactive: number;
  byType: AnalyticsCountByLocationType[];
}

export interface AnalyticsOverview {
  generatedAt: Date;
  warehouse: AnalyticsWarehouseScope;
  window: AnalyticsWindow;
  parcels: ParcelAnalyticsSnapshot;
  locations: LocationAnalyticsSnapshot;
  exceptions: OptionalOperationalMetric;
  inbound: OptionalOperationalMetric;
  outbound: OptionalOperationalMetric;
  labelJobs: OptionalOperationalMetric;
  notifications: OptionalOperationalMetric;
}

export interface ParcelStatusAnalytics {
  generatedAt: Date;
  warehouse: AnalyticsWarehouseScope;
  total: number;
  byStatus: AnalyticsCountByStatus[];
}
