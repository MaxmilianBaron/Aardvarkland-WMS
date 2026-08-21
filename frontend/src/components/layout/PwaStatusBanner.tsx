import { useEffect, useMemo, useState } from 'react';
import { activateWaitingServiceWorker, installPwaListeners, promptPwaInstall, registerWmsServiceWorker, type PwaState } from '../../app/pwa';
import type { RouteKey } from '../../app/navigation';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { reportFrontendEvent } from '../../core/observability/frontendObservability';
import { useWorkspace, type Language } from '../../core/workspace/workspace';
import { pickLanguage, type BaseTranslations } from '../../core/i18n/i18n';

const initialState: PwaState = {
  serviceWorker: 'unsupported',
  offline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  installPromptAvailable: false,
};

export function PwaStatusBanner({ route }: { route: RouteKey }) {
  const { language } = useWorkspace();
  const text = pickLanguage(language, copy);
  const [state, setState] = useState<PwaState>(initialState);
  const visible = route === '/rf' || state.offline || state.serviceWorker === 'update-available' || state.installPromptAvailable || state.serviceWorker === 'error';

  useEffect(() => {
    const apply = (patch: Partial<PwaState>) => setState((current) => ({ ...current, ...patch }));
    const cleanup = installPwaListeners(apply);
    void registerWmsServiceWorker(apply);
    return cleanup;
  }, []);

  const status = useMemo(() => {
    if (state.offline) return { label: text.offline, tone: 'warning' as const, description: text.offlineDetail };
    if (state.serviceWorker === 'update-available') return { label: text.updateReady, tone: 'warning' as const, description: text.updateDetail };
    if (state.serviceWorker === 'error') return { label: text.error, tone: 'critical' as const, description: text.errorDetail };
    if (state.serviceWorker === 'registering') return { label: text.loading, tone: 'neutral' as const, description: text.loadingDetail };
    if (state.serviceWorker === 'unsupported') return { label: text.browserOnly, tone: 'neutral' as const, description: text.browserOnlyDetail };
    return { label: text.ready, tone: 'good' as const, description: text.readyDetail };
  }, [state, text]);

  if (!visible) return null;

  const install = async () => {
    const accepted = await promptPwaInstall();
    setState((current) => ({ ...current, installPromptAvailable: false }));
    reportFrontendEvent({ type: 'service_worker', severity: 'info', message: accepted ? 'pwa-install-accepted' : 'pwa-install-dismissed' });
  };
  const update = async () => {
    await activateWaitingServiceWorker();
    reportFrontendEvent({ type: 'pwa_update', severity: 'info', message: 'service-worker-update-activated' });
    window.location.reload();
  };

  return (
    <aside className="pwa-status-banner" aria-live="polite">
      <div>
        <Badge tone={status.tone}>{status.label}</Badge>
        <span>{status.description}</span>
      </div>
      <div className="button-row">
        {state.installPromptAvailable && <Button size="sm" type="button" onClick={install}>{text.install}</Button>}
        {state.serviceWorker === 'update-available' && <Button size="sm" tone="primary" type="button" onClick={update}>{text.update}</Button>}
      </div>
    </aside>
  );
}

const copy: BaseTranslations<{
  ready: string;
  readyDetail: string;
  offline: string;
  offlineDetail: string;
  updateReady: string;
  updateDetail: string;
  error: string;
  errorDetail: string;
  loading: string;
  loadingDetail: string;
  browserOnly: string;
  browserOnlyDetail: string;
  install: string;
  update: string;
}> = {
  cs: {
    ready: 'PWA připraveno',
    readyDetail: 'RF obrazovka je instalovatelná a app shell se drží v lokální cache.',
    offline: 'Offline režim',
    offlineDetail: 'Aplikace běží z lokálního shellu. Provozní změny odešlete po návratu připojení.',
    updateReady: 'Aktualizace čeká',
    updateDetail: 'Je připravená nová verze frontend shellu.',
    error: 'PWA chyba',
    errorDetail: 'Service worker se nepodařilo zaregistrovat. Online provoz zůstává dostupný.',
    loading: 'PWA startuje',
    loadingDetail: 'Registruje se lokální app shell pro RF terminál.',
    browserOnly: 'Bez instalace',
    browserOnlyDetail: 'Prohlížeč nepodporuje service worker; aplikace poběží online.',
    install: 'Instalovat',
    update: 'Aktualizovat',
  },
  en: {
    ready: 'PWA ready',
    readyDetail: 'The RF screen is installable and the app shell is kept in local cache.',
    offline: 'Offline mode',
    offlineDetail: 'The app runs from the local shell. Send operational changes after connection returns.',
    updateReady: 'Update waiting',
    updateDetail: 'A new frontend shell version is ready.',
    error: 'PWA error',
    errorDetail: 'The service worker could not be registered. Online operation remains available.',
    loading: 'PWA starting',
    loadingDetail: 'Registering the local app shell for the RF terminal.',
    browserOnly: 'Browser only',
    browserOnlyDetail: 'This browser does not support service workers; the app will stay online-only.',
    install: 'Install',
    update: 'Update',
  },
  ua: {
    ready: 'PWA готове',
    readyDetail: 'RF екран можна встановити, а оболонка застосунку зберігається в локальному кеші.',
    offline: 'Офлайн режим',
    offlineDetail: 'Застосунок працює з локальної оболонки. Операційні зміни надішліть після відновлення з’єднання.',
    updateReady: 'Оновлення очікує',
    updateDetail: 'Готова нова версія frontend оболонки.',
    error: 'Помилка PWA',
    errorDetail: 'Не вдалося зареєструвати service worker. Онлайн робота лишається доступною.',
    loading: 'PWA запускається',
    loadingDetail: 'Реєструється локальна оболонка застосунку для RF термінала.',
    browserOnly: 'Лише браузер',
    browserOnlyDetail: 'Цей браузер не підтримує service worker; застосунок працюватиме тільки онлайн.',
    install: 'Встановити',
    update: 'Оновити',
  },
};
