import { pickLanguage } from '../../core/i18n/i18n';
import { Button } from '../ui/Button';
import { ApiResourceState } from '../../core/api/useApiResource';
import { useWorkspace } from '../../core/workspace/workspace';

type BannerProps<T> = {
  label: string;
  resource: ApiResourceState<T>;
};

export function DataSourceBanner<T>({ resource }: BannerProps<T>) {
  const { language } = useWorkspace();
  const text = pickLanguage(language, { cs: { error: 'Data se nepodařilo načíst.', refresh: 'Obnovit' }, en: { error: 'Data could not be loaded.', refresh: 'Refresh' }, ua: { error: 'Не вдалося завантажити дані.', refresh: 'Оновити' } });

  if (resource.status !== 'error') return null;

  return (
    <div className="inline-banner inline-banner--warning data-source-banner" role="alert" aria-live="polite">
      <span>{text.error}</span>
      <Button size="sm" type="button" onClick={resource.refresh}>{text.refresh}</Button>
    </div>
  );
}
