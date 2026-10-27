export type PwaServiceWorkerState = 'unsupported' | 'registering' | 'ready' | 'update-available' | 'error';

export interface PwaState {
  serviceWorker: PwaServiceWorkerState;
  offline: boolean;
  installPromptAvailable: boolean;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let registrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function installPwaListeners(onChange: (state: Partial<PwaState>) => void): () => void {
  const onlineHandler = () => onChange({ offline: false });
  const offlineHandler = () => onChange({ offline: true });
  const installHandler = (event: Event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    onChange({ installPromptAvailable: true });
  };

  window.addEventListener('online', onlineHandler);
  window.addEventListener('offline', offlineHandler);
  window.addEventListener('beforeinstallprompt', installHandler);

  return () => {
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
    window.removeEventListener('beforeinstallprompt', installHandler);
  };
}

export async function registerWmsServiceWorker(onChange: (state: Partial<PwaState>) => void): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    onChange({ serviceWorker: 'unsupported' });
    return;
  }

  onChange({ serviceWorker: 'registering', offline: !navigator.onLine });
  registrationPromise ??= navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      if (registration.waiting) {
        onChange({ serviceWorker: 'update-available' });
      } else {
        onChange({ serviceWorker: 'ready' });
      }

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            onChange({ serviceWorker: 'update-available' });
          }
        });
      });
      return registration;
    })
    .catch(() => {
      onChange({ serviceWorker: 'error' });
      return null;
    });

  await registrationPromise;
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;
  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  return choice.outcome === 'accepted';
}

export async function activateWaitingServiceWorker(): Promise<void> {
  const registration = await registrationPromise;
  registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}
