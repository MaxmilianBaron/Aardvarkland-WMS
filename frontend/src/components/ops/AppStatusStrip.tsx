import { pickLanguage } from '../../core/i18n/i18n';
import { APP_NAME } from '../../app/constants';
import { useWorkspace } from '../../core/workspace/workspace';

export function AppStatusStrip() {
  const { warehouse, clientScope, roleProfile, language } = useWorkspace();
  const aria = pickLanguage(language, { cs: 'Stav aplikace a aktivní scope', en: 'Application status and active scope', ua: 'Стан застосунку та активний контекст' });

  return (
    <section className="app-status-strip" aria-label={aria}>
      <span><strong>{roleProfile.shortLabel}</strong> · {warehouse.id} · {clientScope}</span>
      <span>{APP_NAME}</span>
    </section>
  );
}
