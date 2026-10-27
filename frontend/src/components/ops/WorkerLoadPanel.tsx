import type { WorkerLoad, Severity } from '../../core/types/wms';
import { Badge } from '../ui/Badge';
import { ProgressBar } from '../ui/ProgressBar';
function loadTone(value: number): Severity { if (value >= 92) return 'critical'; if (value >= 78) return 'warning'; if (value >= 55) return 'neutral'; return 'good'; }
export function WorkerLoadPanel({ workers }: { workers: WorkerLoad[] }) {
  return <div className="worker-load-grid">{workers.map((worker) => <article className="worker-load" key={worker.id}><div><strong>{worker.name}</strong><span>{worker.role} · zóna {worker.zone}</span></div><Badge tone={loadTone(worker.utilization)}>{worker.utilization}%</Badge><ProgressBar value={worker.utilization} /><small>{worker.activeTask}</small></article>)}</div>;
}
