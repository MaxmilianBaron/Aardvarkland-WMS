import { useState } from 'react';
import type { NextBestAction } from '../../core/types/wms';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
export function NextBestActions({ actions }: { actions: NextBestAction[] }) {
  const [done, setDone] = useState<string[]>([]);
  return <div className="nba-stack">{actions.map((action) => { const accepted = done.includes(action.id); return <article className="nba-card" key={action.id}><div className="nba-card__marker" /><div className="nba-card__body"><div className="nba-card__top"><Badge tone={accepted ? 'good' : action.severity}>{accepted ? 'queued' : action.severity}</Badge><span>{action.impact}</span></div><strong>{action.title}</strong><p>{action.detail}</p></div><Button size="sm" tone={accepted ? 'secondary' : 'primary'} onClick={() => setDone((items) => [...new Set([...items, action.id])])}>{accepted ? 'V queue' : action.cta}</Button></article>; })}</div>;
}
