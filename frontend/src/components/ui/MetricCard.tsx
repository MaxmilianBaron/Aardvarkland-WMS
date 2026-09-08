import type { Metric } from '../../core/types/wms';
import { Badge } from './Badge';

export function MetricCard({ metric }: { metric: Metric }) {
  return (
    <div className="metric-card">
      <div className="metric-card__top">
        <span>{metric.label}</span>
        <Badge tone={metric.severity} compact>{metric.severity === 'good' ? 'OK' : metric.severity === 'warning' ? 'Pozor' : metric.severity === 'critical' ? 'Riziko' : 'Stav'}</Badge>
      </div>
      <strong>{metric.value}</strong>
      <p>{metric.change}</p>
    </div>
  );
}
