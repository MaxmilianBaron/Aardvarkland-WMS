import { config } from '../../app/config';

export type FrontendEventType =
  | 'app_loaded'
  | 'js_error'
  | 'error_boundary'
  | 'api_failure'
  | 'blank_screen'
  | 'pwa_update'
  | 'service_worker'
  | 'offline_state';

export type FrontendEventSeverity = 'info' | 'warning' | 'error' | 'critical';

interface FrontendContext {
  route?: string;
  language?: string;
  roleId?: string;
}

interface FrontendEventInput {
  type: FrontendEventType;
  severity: FrontendEventSeverity;
  message?: string;
  source?: string;
  statusCode?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

let installed = false;
let currentContext: FrontendContext = {};

export function setFrontendObservabilityContext(context: FrontendContext) {
  currentContext = {
    route: context.route,
    language: context.language,
    roleId: context.roleId,
  };
}

export function installFrontendObservers() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    reportFrontendEvent({
      type: 'js_error',
      severity: 'error',
      message: event.message,
      source: event.filename || 'window.error',
      metadata: { line: event.lineno, column: event.colno },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportFrontendEvent({
      type: 'js_error',
      severity: 'error',
      message: event.reason instanceof Error ? event.reason.message : String(event.reason ?? 'Unhandled promise rejection'),
      source: 'unhandledrejection',
    });
  });

  window.addEventListener('online', () => {
    reportFrontendEvent({ type: 'offline_state', severity: 'info', message: 'browser-online' });
  });
  window.addEventListener('offline', () => {
    reportFrontendEvent({ type: 'offline_state', severity: 'warning', message: 'browser-offline' });
  });

  window.setTimeout(() => {
    const root = document.getElementById('root');
    if (!root || root.childElementCount > 0) return;
    reportFrontendEvent({
      type: 'blank_screen',
      severity: 'critical',
      message: 'Root element stayed empty after startup timeout.',
      source: 'startup-watchdog',
    });
  }, 8000);
}

export function reportFrontendEvent(input: FrontendEventInput) {
  if (typeof window === 'undefined') return;
  const payload = JSON.stringify({
    ...currentContext,
    ...input,
    appVersion: config.appVersion,
    occurredAt: new Date().toISOString(),
    browserOnline: navigator.onLine,
  });
  const url = `${config.apiBaseUrl}/observability/frontend-events`;

  try {
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      if (sent) return;
    }
  } catch {}

  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {});
}

export function redactedErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error ?? 'Unknown error').slice(0, 500);
}
