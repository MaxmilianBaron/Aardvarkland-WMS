import { useCallback, useRef, useState } from 'react';
import { ApiError } from './http';
import { pickLanguage, type BaseTranslations, type Language } from '../i18n/i18n';

export type ApiMutationStatus = 'idle' | 'running' | 'success' | 'error';

export interface ApiMutationState {
  status: ApiMutationStatus;
  message?: string;
  run: <T>(label: string, action: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
}

type MutationLanguage = Language;

function currentLanguage(): MutationLanguage {
  if (typeof document === 'undefined') return 'cs';
  const lang = document.documentElement.lang.toLowerCase();
  if (lang.startsWith('en')) return 'en';
  if (lang.startsWith('uk') || lang === 'ua') return 'ua';
  if (lang.startsWith('fr')) return 'fr';
  if (lang.startsWith('de')) return 'de';
  if (lang.startsWith('es')) return 'es';
  return 'cs';
}

function mutationMessage(language: MutationLanguage, status: Exclude<ApiMutationStatus, 'idle'>, label: string, error?: unknown): string {
  if (status === 'running') {
    const suffix = pickLanguage(language, { cs: 'probíhá...', en: 'is running...', ua: 'виконується...' });
    return `${label} ${suffix}`;
  }

  if (status === 'success') {
    const suffix = pickLanguage(language, { cs: 'dokončeno.', en: 'finished.', ua: 'завершено.' });
    return `${label} ${suffix}`;
  }

  const detail = mutationErrorDetail(language, error);
  const failed = pickLanguage(language, { cs: 'selhalo', en: 'failed', ua: 'не вдалося' });
  return `${label} ${failed}${detail}`;
}

function mutationErrorDetail(language: MutationLanguage, error: unknown): string {
  if (error instanceof ApiError) {
    const message = statusMessage(language, error.status);
    return message ? `: ${message}` : sanitizedErrorSuffix(error.message);
  }

  return error instanceof Error ? sanitizedErrorSuffix(error.message) : '';
}

function statusMessage(language: MutationLanguage, status: number): string {
  const messages = pickLanguage(language, errorMessages);
  return messages[status] ?? '';
}

function sanitizedErrorSuffix(message: string): string {
  const cleaned = message
    .replace(/\s+at\s+.+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .trim();
  return cleaned ? `: ${cleaned.slice(0, 160)}` : '';
}

const errorMessages: BaseTranslations<Record<number, string>> = {
  cs: {
    0: 'server neodpověděl',
    401: 'přihlášení vypršelo',
    403: 'chybí oprávnění',
    409: 'konflikt nebo akce už proběhla',
    428: 'požadavek není připravený, zkuste akci znovu',
    429: 'moc požadavků, zkuste to za chvíli',
    503: 'systém dočasně není připraven',
  },
  en: {
    0: 'the server did not respond',
    401: 'your session has expired',
    403: 'permission is missing',
    409: 'conflict or the action already finished',
    428: 'the request is not ready, try the action again',
    429: 'too many requests, try again shortly',
    503: 'the system is temporarily not ready',
  },
  ua: {
    0: 'сервер не відповів',
    401: 'сеанс входу завершився',
    403: 'бракує дозволу',
    409: 'конфлікт або дія вже виконана',
    428: 'запит не готовий, повторіть дію',
    429: 'забагато запитів, спробуйте трохи пізніше',
    503: 'система тимчасово не готова',
  },
};

export function useApiMutation(): ApiMutationState {
  const runningRef = useRef(false);
  const [status, setStatus] = useState<ApiMutationStatus>('idle');
  const [message, setMessage] = useState<string | undefined>();
  const reset = useCallback(() => { runningRef.current = false; setStatus('idle'); setMessage(undefined); }, []);
  const run = useCallback(async <T,>(label: string, action: () => Promise<T>) => {
    if (runningRef.current) {
      return undefined;
    }
    const language = currentLanguage();
    runningRef.current = true;
    setStatus('running');
    setMessage(mutationMessage(language, 'running', label));
    try {
      const result = await action();
      setStatus('success');
      setMessage(mutationMessage(language, 'success', label));
      return result;
    } catch (error: unknown) {
      setStatus('error');
      setMessage(mutationMessage(language, 'error', label, error));
      return undefined;
    } finally {
      runningRef.current = false;
    }
  }, []);
  return { status, message, run, reset };
}
