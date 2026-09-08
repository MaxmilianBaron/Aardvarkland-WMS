import { Badge } from '../ui/Badge';
import type { Severity } from '../../core/types/wms';
export interface OperationTimelineEvent { time: string; title: string; detail: string; severity?: Severity; }
export function OperationTimeline({ events }: { events: OperationTimelineEvent[] }) {
  return <div className="operation-timeline">{events.map((event) => <article key={`${event.time}-${event.title}`}><span>{event.time}</span><div><strong>{event.title}</strong><p>{event.detail}</p></div><Badge tone={event.severity ?? 'neutral'} compact>{event.severity ?? 'info'}</Badge></article>)}</div>;
}
