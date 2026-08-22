import { Component, ErrorInfo, PropsWithChildren, ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { redactedErrorMessage, reportFrontendEvent } from '../core/observability/frontendObservability';
import { pickLanguage, type Language } from '../core/i18n/i18n';

interface ErrorBoundaryState {
  error?: Error;
}

function currentLanguage(): Language {
  if (typeof document === 'undefined') return 'cs';
  const lang = document.documentElement.lang.toLowerCase();
  if (lang.startsWith('en')) return 'en';
  if (lang.startsWith('uk') || lang === 'ua') return 'ua';
  if (lang.startsWith('fr')) return 'fr';
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('es')) return 'es';
  return 'cs';
}

const errorCopy = {
  cs: {
    eyebrow: 'Obnova UI',
    title: 'Zobrazení se nepodařilo načíst',
    body: 'Data a session zůstávají uložené. Zkuste obrazovku obnovit.',
    retry: 'Zkusit znovu',
    reload: 'Obnovit stránku',
  },
  en: {
    eyebrow: 'UI recovery',
    title: 'The view could not be loaded',
    body: 'Data and session are still saved. Try refreshing the view.',
    retry: 'Try again',
    reload: 'Reload page',
  },
  ua: {
    eyebrow: 'Відновлення UI',
    title: 'Не вдалося завантажити екран',
    body: 'Дані та сесія збережені. Спробуйте оновити екран.',
    retry: 'Спробувати ще раз',
    reload: 'Оновити сторінку',
  },
};

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Aardvarkland UI render error', { error, componentStack: info.componentStack });
    reportFrontendEvent({
      type: 'error_boundary',
      severity: 'critical',
      message: redactedErrorMessage(error),
      source: 'react-error-boundary',
      metadata: { componentStack: info.componentStack?.slice(0, 1000) ?? '' },
    });
  }

  private reset = () => {
    this.setState({ error: undefined });
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const text = pickLanguage(currentLanguage(), errorCopy);

    return (
      <main className="error-boundary-page">
        <section className="error-boundary-card" role="alert" aria-live="assertive">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p>{text.body}</p>
          <code>{this.state.error.message}</code>
          <div className="error-boundary-actions">
            <Button tone="primary" onClick={this.reset}>{text.retry}</Button>
            <Button tone="secondary" onClick={() => window.location.reload()}>{text.reload}</Button>
          </div>
        </section>
      </main>
    );
  }
}
