import { Badge } from './Badge';
import type { ApiResourceStatus } from '../../core/api/useApiResource';
import { useWorkspace, type Language } from '../../core/workspace/workspace';
import { pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';

interface ResourceFreshnessProps {
  status: ApiResourceStatus;
  refreshedAt?: string;
  ageSeconds: number | null;
  stale: boolean;
}

export function ResourceFreshness({ status, refreshedAt, ageSeconds, stale }: ResourceFreshnessProps) {
  const { language } = useWorkspace();
  const text = pickLanguage(language, copy);
  const label = status === 'loading'
    ? text.loading
    : status === 'error'
      ? text.error
      : stale
        ? text.stale
        : refreshedAt
          ? `${text.updated} ${refreshedAt}`
          : text.notLoaded;

  return (
    <div className="resource-freshness">
      <Badge tone={status === 'error' ? 'critical' : stale ? 'warning' : status === 'loading' ? 'neutral' : 'good'}>{label}</Badge>
      {ageSeconds !== null && <span>{formatAge(ageSeconds, text)}</span>}
    </div>
  );
}

function formatAge(ageSeconds: number, text: typeof copy.cs): string {
  if (ageSeconds < 60) return `${ageSeconds} ${text.seconds}`;
  return `${Math.floor(ageSeconds / 60)} ${text.minutes}`;
}

const copy: BaseTranslations<{
  updated: string;
  loading: string;
  error: string;
  stale: string;
  notLoaded: string;
  seconds: string;
  minutes: string;
}> = {
  cs: { updated: 'Aktualizováno', loading: 'Načítá se', error: 'Chyba dat', stale: 'Zastaralé', notLoaded: 'Bez dat', seconds: 's', minutes: 'min' },
  en: { updated: 'Updated', loading: 'Loading', error: 'Data error', stale: 'Stale', notLoaded: 'No data', seconds: 's', minutes: 'min' },
  ua: { updated: 'Оновлено', loading: 'Завантаження', error: 'Помилка даних', stale: 'Застаріло', notLoaded: 'Немає даних', seconds: 'с', minutes: 'хв' },
};
