import { FormEvent, useEffect, useState } from 'react';
import { login } from '../../core/api/auth';
import { ApiError } from '../../core/api/http';
import { Button } from '../../components/ui/Button';
import { FlagIcon } from '../../components/ui/FlagIcon';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { APP_SHORT_NAME, APP_TAGLINES } from '../../app/constants';
import { languageLocale, languageMenuItems, pickLanguage, supportedLanguages, type BaseTranslations, type Language } from '../../core/i18n/i18n';

const LOCAL_LOGIN_DOMAIN = 'aardvarkland.local';
const languageStorageKey = 'aardvarkland-ui-language';

type LoginLanguage = Language;

const loginCopy: BaseTranslations<Record<string, string>> = {
  cs: {
    tagline: APP_TAGLINES.cs,
    languageAria: 'Přepnout jazyk',
    title: 'Přihlášení',
    subtitle: 'Přihlaste se ke svému účtu.',
    loginName: 'Přihlašovací jméno',
    password: 'Heslo',
    mfaCode: 'MFA kód',
    mfaCodeHint: 'Zadejte 6místný kód z ověřovací aplikace.',
    error: 'Špatné přihlašovací jméno nebo heslo.',
    mfaError: 'MFA kód se nepodařilo ověřit.',
    loading: 'Ověřuju...',
    submit: 'Přihlásit se',
    verify: 'Ověřit',
    changeLogin: 'Změnit přihlášení',
  },
  en: {
    tagline: APP_TAGLINES.en,
    languageAria: 'Switch language',
    title: 'Sign in',
    subtitle: 'Sign in to your account.',
    loginName: 'Login name',
    password: 'Password',
    mfaCode: 'MFA code',
    mfaCodeHint: 'Enter the 6-digit code from your authenticator app.',
    error: 'Incorrect login name or password.',
    mfaError: 'The MFA code could not be verified.',
    loading: 'Verifying...',
    submit: 'Sign in',
    verify: 'Verify',
    changeLogin: 'Change sign-in',
  },
  ua: {
    tagline: APP_TAGLINES.ua,
    languageAria: 'Перемкнути мову',
    title: 'Вхід',
    subtitle: 'Увійдіть до свого облікового запису.',
    loginName: 'Ім’я для входу',
    password: 'Пароль',
    mfaCode: 'Код MFA',
    mfaCodeHint: 'Введіть 6-значний код із застосунку автентифікації.',
    error: 'Неправильне ім’я для входу або пароль.',
    mfaError: 'Не вдалося перевірити код MFA.',
    loading: 'Перевіряю...',
    submit: 'Увійти',
    verify: 'Перевірити',
    changeLogin: 'Змінити вхід',
  },
};

function toLoginEmail(loginName: string) {
  const trimmed = loginName.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed.toLowerCase()}@${LOCAL_LOGIN_DOMAIN}`;
}

function getInitialLanguage(): LoginLanguage {
  if (typeof window === 'undefined') return 'cs';

  try {
    const stored = window.localStorage.getItem(languageStorageKey);
    return supportedLanguages.includes(stored as Language) ? stored as Language : 'cs';
  } catch {
    return 'cs';
  }
}

export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [loginName, setLoginName] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [language, setLanguage] = useState<LoginLanguage>(getInitialLanguage);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const text = pickLanguage(language, loginCopy);

  useEffect(() => {
    document.documentElement.lang = languageLocale(language);
    try {
      window.localStorage.setItem(languageStorageKey, language);
    } catch {}
  }, [language]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const normalizedMfaCode = mfaCode.trim();
      await login({
        email: toLoginEmail(loginName),
        password,
        mfaCode: mfaRequired ? normalizedMfaCode : undefined,
      });
      onLogin();
    } catch (error: unknown) {
      if (!mfaRequired && isMfaRequiredError(error)) {
        setMfaRequired(true);
        setMfaCode('');
      } else {
        setErrorMessage(mfaRequired ? text.mfaError : text.error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-controls" aria-label={pickLanguage(language, { cs: 'Nastavení přihlášení', en: 'Login settings', ua: 'Налаштування входу' })}>
        <LoginLanguageMenu language={language} setLanguage={setLanguage} ariaLabel={text.languageAria} />
        <ThemeToggle language={language} />
      </div>
      <section className="login-card">
        <div className="login-card__visual">
          <div className="login-logo login-logo--image"><img src="/assets/aardvarkland-icon.png" alt="" /></div>
          <h1 className="login-brand">
            <span className="login-brand__name">{APP_SHORT_NAME}</span>
            <span className="login-brand__tagline">{text.tagline}</span>
          </h1>
        </div>
        <form className="login-form" onSubmit={submit} autoComplete="off">
          <div className="login-form__header">
            <h2>{text.title}</h2>
            <p>{text.subtitle}</p>
          </div>
          {!mfaRequired ? (
            <>
              <label>
                {text.loginName}
                <input
                  value={loginName}
                  onChange={(event) => setLoginName(event.target.value)}
                  type="text"
                  autoComplete="off"
                  name="aardvarkland-login-name"
                  required
                />
              </label>
              <label>
                {text.password}
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="off"
                  name="aardvarkland-login-password"
                  required
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {text.mfaCode}
                <input
                  value={mfaCode}
                  onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="aardvarkland-mfa-code"
                  aria-describedby="login-mfa-hint"
                  required
                  autoFocus
                />
                <span id="login-mfa-hint" className="form-hint">{text.mfaCodeHint}</span>
              </label>
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  setMfaRequired(false);
                  setMfaCode('');
                  setErrorMessage(null);
                }}
              >
                {text.changeLogin}
              </button>
            </>
          )}
          {errorMessage && <div className="inline-banner inline-banner--warning" role="alert"><span>{errorMessage}</span></div>}
          <Button className="login-submit" tone="primary" size="lg" type="submit" disabled={loading}>{loading ? text.loading : mfaRequired ? text.verify : text.submit}</Button>
          <p className="login-footer">© 2026 Aardvarkland</p>
        </form>
      </section>
    </main>
  );
}

function isMfaRequiredError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  const payload = error.payload;
  if (!payload || typeof payload !== 'object') return false;

  const apiError = (payload as { error?: unknown }).error;
  if (!apiError || typeof apiError !== 'object') return false;

  const code = (apiError as { code?: unknown }).code;
  if (code === 'MFA_CODE_REQUIRED') return true;

  const details = (apiError as { details?: unknown }).details;
  return Array.isArray(details) && details.some((detail) => (
    detail && typeof detail === 'object' && (detail as { code?: unknown }).code === 'MFA_CODE_REQUIRED'
  ));
}

function LoginLanguageMenu({
  language,
  setLanguage,
  ariaLabel,
}: {
  language: LoginLanguage;
  setLanguage: (language: LoginLanguage) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const items = languageMenuItems;

  return (
    <div className="language-menu login-language-menu">
      <button
        className="language-switch"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={ariaLabel}
        aria-expanded={open}
        title={ariaLabel}
      >
        <FlagIcon code={language} />
      </button>
      {open && (
        <div className="language-menu__list" role="menu" aria-label={ariaLabel}>
          {items.map((item) => (
            <button
              key={item.language}
              type="button"
              role="menuitemradio"
              aria-checked={language === item.language}
              aria-label={item.label}
              className={language === item.language ? 'is-active' : undefined}
              onClick={() => {
                setLanguage(item.language);
                setOpen(false);
              }}
            >
              <FlagIcon code={item.language} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
