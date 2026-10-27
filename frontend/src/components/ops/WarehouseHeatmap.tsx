import type { ZoneLoad } from '../../core/types/wms';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
export function WarehouseHeatmap({ zones }: { zones: ZoneLoad[] }) {
  return <div className="warehouse-map">{zones.map((zone) => <article className="warehouse-zone" key={zone.id}><div className="warehouse-zone__head"><div><strong>{zone.label}</strong><span>{zone.role}</span></div><Badge tone={zone.risk}>{zone.risk}</Badge></div><ProgressBar value={zone.utilization} label={`${zone.label} utilization`} /><div className="warehouse-zone__meta"><span>{zone.backlog} tasků</span><span>{zone.workers} lidí</span><span>{zone.utilization}% load</span></div></article>)}</div>;
}
