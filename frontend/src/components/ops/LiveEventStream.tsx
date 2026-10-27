import type { LiveEvent } from '../../core/types/wms';
import { Badge } from '../ui/Badge';
export function LiveEventStream({ events }: { events: LiveEvent[] }) {
  return <div className="live-stream">{events.map((event) => <article className="live-event" key={event.id}><div className="live-event__dot" /><div><div className="live-event__top"><strong>{event.title}</strong><Badge tone={event.severity} compact>{event.time}</Badge></div><p>{event.detail}</p><small>{event.actor}</small></div></article>)}</div>;
}
