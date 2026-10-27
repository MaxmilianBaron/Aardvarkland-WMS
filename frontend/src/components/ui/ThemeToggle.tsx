import { useEffect, useState } from 'react';
import { cx } from '../../core/utils/format';
import { pickLanguage, type Language } from '../../core/i18n/i18n';

type ThemeMode = 'light' | 'dark';

const themeStorageKey = 'aardvarkland-ui-theme';

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';

  try {
    const stored = window.localStorage.getItem(themeStorageKey);
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function ThemeToggle({ language, className }: { language: Language; className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const darkMode = theme === 'dark';
  const label = darkMode
    ? pickLanguage(language, { cs: 'Přepnout na světlý režim', en: 'Switch to light mode', ua: 'Перемкнути на світлий режим' })
    : pickLanguage(language, { cs: 'Přepnout na tmavý režim', en: 'Switch to dark mode', ua: 'Перемкнути на темний режим' });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {}
  }, [theme]);

  return (
    <button
      type="button"
      className={cx('theme-toggle', className)}
      onClick={() => setTheme(darkMode ? 'light' : 'dark')}
      aria-pressed={darkMode}
      aria-label={label}
      title={label}
    >
      {darkMode ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2" />
      <path d="M12 19.5v2" />
      <path d="m4.6 4.6 1.4 1.4" />
      <path d="m18 18 1.4 1.4" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="m4.6 19.4 1.4-1.4" />
      <path d="m18 6 1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.6A7.8 7.8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6Z" />
    </svg>
  );
}
