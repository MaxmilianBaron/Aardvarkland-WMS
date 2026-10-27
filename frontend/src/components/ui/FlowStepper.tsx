import { pickLanguage } from '../../core/i18n/i18n';
import { Badge } from './Badge';
import { cx } from '../../core/utils/format';
import { useWorkspace } from '../../core/workspace/workspace';

export interface FlowStep { id: string; label: string; detail: string; state: 'done' | 'active' | 'next' | 'blocked'; }

export function FlowStepper({ steps }: { steps: readonly FlowStep[] }) {
  const { language } = useWorkspace();
  const labels = pickLanguage(language, { cs: { done: 'Hotovo', active: 'Aktivní', next: 'Další', blocked: 'Blokováno' }, en: { done: 'Done', active: 'Active', next: 'Next', blocked: 'Blocked' }, ua: { done: 'Готово', active: 'Актив.', next: 'Далі', blocked: 'Заблоковано' } });
  return <div className="flow-stepper">{steps.map((step, index) => <article key={step.id} className={cx('flow-stepper__item', `is-${step.state}`)}><span>{index + 1}</span><div><strong>{step.label}</strong><p>{step.detail}</p></div><Badge tone={step.state === 'done' ? 'good' : step.state === 'blocked' ? 'critical' : step.state === 'active' ? 'warning' : 'neutral'} compact>{labels[step.state]}</Badge></article>)}</div>;
}
