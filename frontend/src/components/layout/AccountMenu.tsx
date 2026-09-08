import { FormEvent, useEffect, useMemo, useState } from 'react';
import { toSVG } from 'bwip-js/generic';
import { svgPreviewDataUri } from '../../core/scanning/svgPreview';
import { changePassword, disableMfa, getMfaStatus, logout, startMfaSetup, verifyMfaSetup, type MfaSetupResponse, type MfaStatusResponse } from '../../core/api/auth';
import { useWorkspace } from '../../core/workspace/workspace';
import { pickLanguage } from '../../core/i18n/i18n';

interface AccountMenuProps {
  onLogout: () => void;
}

export function AccountMenu({ onLogout }: AccountMenuProps) {
  const {
    currentUser,
    language,
    roleProfile,
    warehouseId,
    workContext,
    workContextStatus,
    saveWorkContext,
    refreshWorkContext,
  } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextSaving, setContextSaving] = useState(false);
  const [contextForm, setContextForm] = useState({
    warehouseId,
    zone: '',
    shiftCode: '',
    rfMode: 'DESKTOP' as 'DESKTOP' | 'MOBILE' | 'TERMINAL',
    scannerDeviceReference: '',
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaStatus, setMfaStatus] = useState<MfaStatusResponse | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaSetupResponse | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const text = pickLanguage(language, accountCopy);

  const displayName = currentUser?.displayName || currentUser?.email || text.account;
  const contextWarehouses = workContext?.availableWarehouses.length
    ? workContext.availableWarehouses
    : (currentUser?.warehouses ?? []).map((warehouse) => ({
      id: warehouse.warehouseId,
      code: warehouse.warehouseCode,
      name: warehouse.warehouseName,
    }));
  const activeContextLabel = [
    workContext?.warehouse.code ?? warehouseId,
    workContext?.zone,
    workContext?.shiftCode,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    if (!contextOpen || !workContext) return;
    setContextForm({
      warehouseId: workContext.warehouse.code || workContext.warehouse.id,
      zone: workContext.zone ?? '',
      shiftCode: workContext.shiftCode ?? '',
      rfMode: workContext.rfMode,
      scannerDeviceReference: workContext.scannerDeviceReference ?? '',
    });
  }, [contextOpen, workContext]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword !== repeatPassword) {
      setError(text.mismatch);
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
      setChangingPassword(false);
      setMessage(text.success);
      await logout();
      onLogout();
    } catch {
      setError(text.failed);
    } finally {
      setLoading(false);
    }
  };

  const openPasswordForm = () => {
    setError(null);
    setMessage(null);
    setMfaOpen(false);
    setContextOpen(false);
    setChangingPassword(true);
  };

  const openContextMenu = async () => {
    setError(null);
    setMessage(null);
    setChangingPassword(false);
    setMfaOpen(false);
    setContextOpen(true);
    setContextForm({
      warehouseId: workContext?.warehouse.code || warehouseId,
      zone: workContext?.zone ?? '',
      shiftCode: workContext?.shiftCode ?? '',
      rfMode: workContext?.rfMode ?? 'DESKTOP',
      scannerDeviceReference: workContext?.scannerDeviceReference ?? '',
    });
    await refreshWorkContext();
  };

  const submitWorkContext = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setContextSaving(true);
    const result = await saveWorkContext({
      warehouseId: contextForm.warehouseId,
      zone: normalizeNullable(contextForm.zone),
      shiftCode: normalizeNullable(contextForm.shiftCode),
      rfMode: contextForm.rfMode,
      scannerDeviceReference: normalizeNullable(contextForm.scannerDeviceReference),
      metadata: { source: 'account-menu' },
    });
    setContextSaving(false);
    if (result) {
      setMessage(text.contextSaved);
      setContextOpen(false);
    } else {
      setError(text.contextFailed);
    }
  };

  const loadMfaStatus = async () => {
    setMfaLoading(true);
    try {
      setMfaStatus(await getMfaStatus());
    } catch {
      setError(text.mfaStatusFailed);
    } finally {
      setMfaLoading(false);
    }
  };

  const openMfaMenu = async () => {
    setError(null);
    setMessage(null);
    setChangingPassword(false);
    setContextOpen(false);
    setMfaOpen(true);
    setMfaStatus(null);
    setMfaSetup(null);
    setMfaCode('');
    await loadMfaStatus();
  };

  const beginMfaSetup = async () => {
    setError(null);
    setMessage(null);
    setMfaLoading(true);
    try {
      setMfaSetup(await startMfaSetup());
      setMfaCode('');
    } catch {
      setError(text.mfaSetupFailed);
    } finally {
      setMfaLoading(false);
    }
  };

  const submitMfaSetup = async (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeMfaCode(mfaCode);
    setError(null);
    setMessage(null);

    if (!isMfaCode(code)) {
      setError(text.mfaCodeInvalid);
      return;
    }

    setMfaLoading(true);
    try {
      await verifyMfaSetup({ code });
      setMessage(text.mfaEnabled);
      await logout();
      onLogout();
    } catch {
      setError(text.mfaVerifyFailed);
    } finally {
      setMfaLoading(false);
    }
  };

  const submitMfaDisable = async (event: FormEvent) => {
    event.preventDefault();
    const code = normalizeMfaCode(mfaCode);
    setError(null);
    setMessage(null);

    if (!isMfaCode(code)) {
      setError(text.mfaCodeInvalid);
      return;
    }

    setMfaLoading(true);
    try {
      await disableMfa({ code });
      setMessage(text.mfaDisabled);
      await logout();
      onLogout();
    } catch {
      setError(text.mfaDisableFailed);
    } finally {
      setMfaLoading(false);
    }
  };

  const submitLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      onLogout();
    }
  };

  return (
    <div className="account-menu">
      {open && (
        <section className="account-panel" aria-label={text.settings}>
          {!changingPassword && !mfaOpen && !contextOpen && (
            <>
              <button className="account-panel__action" type="button" onClick={openContextMenu}>
                {text.workContext}
                <span>{activeContextLabel || text.contextNotSet}</span>
              </button>
              <button className="account-panel__action" type="button" onClick={openPasswordForm}>
                {text.changePassword}
              </button>
              <div className="account-mfa-entry">
                <button className="account-panel__action account-panel__action--label" type="button" onClick={openMfaMenu}>
                  {text.mfaLongName}
                </button>
                <button className="account-panel__action account-panel__action--primary" type="button" onClick={openMfaMenu} disabled={mfaLoading}>
                  {text.verify}
                </button>
              </div>
            </>
          )}

          {changingPassword && (
            <form className="account-password-form" onSubmit={submit}>
              <label>
                {text.currentPassword}
                <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" required />
              </label>
              <label>
                {text.newPassword}
                <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" required />
              </label>
              <label>
                {text.repeatPassword}
                <input value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} type="password" autoComplete="new-password" required />
              </label>
              <p>{text.policy}</p>
              <div className="account-password-form__actions">
                <button type="button" onClick={() => setChangingPassword(false)} disabled={loading}>{text.cancel}</button>
                <button type="submit" disabled={loading}>{text.save}</button>
              </div>
            </form>
          )}

          {contextOpen && (
            <form className="account-password-form account-work-context-form" onSubmit={submitWorkContext}>
              <label>
                {text.contextWarehouse}
                <select
                  value={contextForm.warehouseId}
                  onChange={(event) => setContextForm((form) => ({ ...form, warehouseId: event.target.value }))}
                  required
                >
                  {contextWarehouses.map((warehouse) => (
                    <option key={warehouse.id || warehouse.code} value={warehouse.code || warehouse.id}>
                      {warehouse.code} · {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {text.contextZone}
                <input value={contextForm.zone} onChange={(event) => setContextForm((form) => ({ ...form, zone: event.target.value }))} autoComplete="off" />
              </label>
              <label>
                {text.contextShift}
                <input value={contextForm.shiftCode} onChange={(event) => setContextForm((form) => ({ ...form, shiftCode: event.target.value }))} autoComplete="off" />
              </label>
              <label>
                {text.contextRfMode}
                <select value={contextForm.rfMode} onChange={(event) => setContextForm((form) => ({ ...form, rfMode: event.target.value as typeof contextForm.rfMode }))}>
                  <option value="DESKTOP">{text.rfModes.DESKTOP}</option>
                  <option value="MOBILE">{text.rfModes.MOBILE}</option>
                  <option value="TERMINAL">{text.rfModes.TERMINAL}</option>
                </select>
              </label>
              <label>
                {text.contextScanner}
                <input value={contextForm.scannerDeviceReference} onChange={(event) => setContextForm((form) => ({ ...form, scannerDeviceReference: event.target.value.toUpperCase() }))} autoComplete="off" />
              </label>
              <p>{workContextStatus === 'error' ? text.contextStatusFailed : text.contextHint}</p>
              <div className="account-password-form__actions">
                <button type="button" onClick={() => setContextOpen(false)} disabled={contextSaving}>{text.cancel}</button>
                <button type="submit" disabled={contextSaving || workContextStatus === 'loading'}>{contextSaving ? text.loading : text.saveContext}</button>
              </div>
            </form>
          )}

          {mfaOpen && (
            <section className="account-mfa-panel" aria-label={text.mfaLongName}>
              <div className="account-panel__header">
                <strong>{text.mfaLongName}</strong>
                <span>{mfaLoading && !mfaStatus ? text.loading : mfaStatus?.enabled ? text.mfaEnabledStatus : text.mfaDisabledStatus}</span>
              </div>

              {mfaStatus && !mfaStatus.enabled && !mfaSetup && (
                <button className="account-panel__action account-panel__action--primary" type="button" onClick={beginMfaSetup} disabled={mfaLoading}>
                  {mfaLoading ? text.loading : text.createMfaQr}
                </button>
              )}

              {mfaStatus && !mfaStatus.enabled && mfaSetup && (
                <form className="account-mfa-form" onSubmit={submitMfaSetup}>
                  <MfaQrCode value={mfaSetup.otpAuthUri} label={text.mfaQrLabel} errorText={text.mfaQrFailed} />
                  <label>
                    {text.mfaManualKey}
                    <input value={mfaSetup.secret} readOnly />
                  </label>
                  <label>
                    {text.mfaCode}
                    <input
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                    />
                  </label>
                  <div className="account-password-form__actions">
                    <button type="button" onClick={() => setMfaSetup(null)} disabled={mfaLoading}>{text.cancel}</button>
                    <button type="submit" disabled={mfaLoading}>{text.verify}</button>
                  </div>
                </form>
              )}

              {mfaStatus?.enabled && (
                <form className="account-mfa-form" onSubmit={submitMfaDisable}>
                  <label>
                    {text.mfaCode}
                    <input
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                    />
                  </label>
                  <div className="account-password-form__actions">
                    <button type="button" onClick={() => setMfaOpen(false)} disabled={mfaLoading}>{text.cancel}</button>
                    <button type="submit" disabled={mfaLoading}>{text.disableMfa}</button>
                  </div>
                </form>
              )}

              <button className="account-panel__action" type="button" onClick={() => setMfaOpen(false)} disabled={mfaLoading}>
                {text.back}
              </button>
            </section>
          )}

          {message && <div className="account-panel__message account-panel__message--good">{message}</div>}
          {error && <div className="account-panel__message account-panel__message--warning">{error}</div>}
        </section>
      )}
      <div className="account-button" aria-label={text.account}>
        <span className="account-button__copy">
          <strong>{roleProfile.shortLabel}</strong>
          <small>{displayName}</small>
        </span>
        <span className="account-button__actions">
          <button
            className="account-button__icon account-button__gear"
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={text.settings}
            aria-expanded={open}
          >
            <SettingsIcon />
          </button>
          <button
            className="account-button__icon"
            type="button"
            onClick={submitLogout}
            aria-label={text.logout}
            disabled={loggingOut}
          >
            <LogoutIcon />
          </button>
        </span>
      </div>
    </div>
  );
}

const accountCopy = {
  cs: {
    account: 'Účet',
    settings: 'Nastavení',
    changePassword: 'Změnit heslo',
    workContext: 'Pracovní kontext',
    contextNotSet: 'Není nastavený',
    contextWarehouse: 'Sklad',
    contextZone: 'Zóna',
    contextShift: 'Směna',
    contextRfMode: 'RF režim',
    contextScanner: 'Skener / pracoviště',
    contextHint: 'Kontext filtruje práci po přihlášení. Role a oprávnění zůstávají podle backendu.',
    contextStatusFailed: 'Pracovní kontext se nepodařilo načíst.',
    saveContext: 'Uložit kontext',
    contextSaved: 'Pracovní kontext byl uložen.',
    contextFailed: 'Pracovní kontext se nepodařilo uložit.',
    rfModes: { DESKTOP: 'Desktop', MOBILE: 'Telefon', TERMINAL: 'Terminál' },
    logout: 'Odhlásit se',
    currentPassword: 'Současné heslo',
    newPassword: 'Nové heslo',
    repeatPassword: 'Zopakovat nové heslo',
    save: 'Uložit heslo',
    cancel: 'Zrušit',
    mismatch: 'Nová hesla se neshodují.',
    success: 'Heslo bylo změněno.',
    failed: 'Heslo se nepodařilo změnit. Zkontrolujte současné heslo a sílu nového hesla.',
    policy: 'Použijte alespoň 12 znaků, velké písmeno, malé písmeno, číslo a symbol.',
    mfaLongName: 'Vícefaktorové ověření (MFA)',
    verify: 'Ověřit',
    loading: 'Načítám...',
    back: 'Zpět',
    createMfaQr: 'Vytvořit QR kód',
    mfaQrLabel: 'QR kód pro MFA',
    mfaQrFailed: 'QR kód se nepodařilo vykreslit.',
    mfaManualKey: 'Ruční klíč',
    mfaCode: 'Ověřovací kód',
    mfaEnabledStatus: 'MFA je zapnuté.',
    mfaDisabledStatus: 'MFA není zapnuté.',
    mfaStatusFailed: 'Stav MFA se nepodařilo načíst.',
    mfaSetupFailed: 'MFA nastavení se nepodařilo vytvořit.',
    mfaVerifyFailed: 'MFA kód se nepodařilo ověřit.',
    mfaDisableFailed: 'MFA se nepodařilo vypnout.',
    mfaCodeInvalid: 'Zadejte 6 číslic.',
    mfaEnabled: 'MFA bylo zapnuto. Přihlaste se znovu.',
    mfaDisabled: 'MFA bylo vypnuto. Přihlaste se znovu.',
    disableMfa: 'Vypnout MFA',
  },
  en: {
    account: 'Account',
    settings: 'Settings',
    changePassword: 'Change password',
    workContext: 'Work context',
    contextNotSet: 'Not set',
    contextWarehouse: 'Warehouse',
    contextZone: 'Zone',
    contextShift: 'Shift',
    contextRfMode: 'RF mode',
    contextScanner: 'Scanner / workstation',
    contextHint: 'The context filters work after sign-in. Roles and permissions still come from the backend.',
    contextStatusFailed: 'Work context could not be loaded.',
    saveContext: 'Save context',
    contextSaved: 'Work context has been saved.',
    contextFailed: 'Work context could not be saved.',
    rfModes: { DESKTOP: 'Desktop', MOBILE: 'Phone', TERMINAL: 'Terminal' },
    logout: 'Sign out',
    currentPassword: 'Current password',
    newPassword: 'New password',
    repeatPassword: 'Repeat new password',
    save: 'Save password',
    cancel: 'Cancel',
    mismatch: 'New passwords do not match.',
    success: 'Password has been changed.',
    failed: 'Password could not be changed. Check the current password and password strength.',
    policy: 'Use at least 12 characters with uppercase, lowercase, number, and symbol.',
    mfaLongName: 'Multi-factor authentication (MFA)',
    verify: 'Verify',
    loading: 'Loading...',
    back: 'Back',
    createMfaQr: 'Create QR code',
    mfaQrLabel: 'MFA QR code',
    mfaQrFailed: 'The QR code could not be rendered.',
    mfaManualKey: 'Manual key',
    mfaCode: 'Verification code',
    mfaEnabledStatus: 'MFA is enabled.',
    mfaDisabledStatus: 'MFA is not enabled.',
    mfaStatusFailed: 'MFA status could not be loaded.',
    mfaSetupFailed: 'MFA setup could not be created.',
    mfaVerifyFailed: 'The MFA code could not be verified.',
    mfaDisableFailed: 'MFA could not be disabled.',
    mfaCodeInvalid: 'Enter 6 digits.',
    mfaEnabled: 'MFA has been enabled. Sign in again.',
    mfaDisabled: 'MFA has been disabled. Sign in again.',
    disableMfa: 'Disable MFA',
  },
  ua: {
    account: 'Обліковий запис',
    settings: 'Налаштування',
    changePassword: 'Змінити пароль',
    workContext: 'Робочий контекст',
    contextNotSet: 'Не налаштовано',
    contextWarehouse: 'Склад',
    contextZone: 'Зона',
    contextShift: 'Зміна',
    contextRfMode: 'RF режим',
    contextScanner: 'Сканер / станція',
    contextHint: 'Контекст фільтрує роботу після входу. Ролі та права залишаються з бекенду.',
    contextStatusFailed: 'Не вдалося завантажити робочий контекст.',
    saveContext: 'Зберегти контекст',
    contextSaved: 'Робочий контекст збережено.',
    contextFailed: 'Не вдалося зберегти робочий контекст.',
    rfModes: { DESKTOP: 'Desktop', MOBILE: 'Телефон', TERMINAL: 'Термінал' },
    logout: 'Вийти',
    currentPassword: 'Поточний пароль',
    newPassword: 'Новий пароль',
    repeatPassword: 'Повторіть новий пароль',
    save: 'Зберегти пароль',
    cancel: 'Скасувати',
    mismatch: 'Нові паролі не збігаються.',
    success: 'Пароль змінено.',
    failed: 'Не вдалося змінити пароль. Перевірте поточний пароль і силу нового пароля.',
    policy: 'Використайте щонайменше 12 символів, велику і малу літеру, цифру та символ.',
    mfaLongName: 'Багатофакторна автентифікація (MFA)',
    verify: 'Перевірити',
    loading: 'Завантажую...',
    back: 'Назад',
    createMfaQr: 'Створити QR-код',
    mfaQrLabel: 'QR-код MFA',
    mfaQrFailed: 'Не вдалося відобразити QR-код.',
    mfaManualKey: 'Ручний ключ',
    mfaCode: 'Код перевірки',
    mfaEnabledStatus: 'MFA увімкнено.',
    mfaDisabledStatus: 'MFA не увімкнено.',
    mfaStatusFailed: 'Не вдалося завантажити стан MFA.',
    mfaSetupFailed: 'Не вдалося створити налаштування MFA.',
    mfaVerifyFailed: 'Не вдалося перевірити код MFA.',
    mfaDisableFailed: 'Не вдалося вимкнути MFA.',
    mfaCodeInvalid: 'Введіть 6 цифр.',
    mfaEnabled: 'MFA увімкнено. Увійдіть знову.',
    mfaDisabled: 'MFA вимкнено. Увійдіть знову.',
    disableMfa: 'Вимкнути MFA',
  },
};

function normalizeMfaCode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

function normalizeNullable(value: string): string | null {
  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function isMfaCode(value: string) {
  return /^\d{6}$/.test(value);
}

function MfaQrCode({ value, label, errorText }: { value: string; label: string; errorText: string }) {
  const result = useMemo(() => {
    try {
      return {
        svg: toSVG({
          bcid: 'qrcode',
          text: value,
          scale: 3,
          paddingwidth: 6,
          paddingheight: 6,
        }),
        error: '',
      };
    } catch (error) {
      return {
        svg: '',
        error: error instanceof Error ? error.message : errorText,
      };
    }
  }, [errorText, value]);

  return (
    <div className="account-mfa-qr" aria-label={label}>
      {result.svg ? <img src={svgPreviewDataUri(result.svg)} alt={label} /> : <p>{result.error || errorText}</p>}
    </div>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 5H5v14h5" />
      <path d="M14 8l4 4-4 4" />
      <path d="M8 12h10" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19 12a7.2 7.2 0 0 0-.1-1.2l2-1.5-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14 3h-4l-.5 2.7a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.5A7.2 7.2 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2L10 21h4l.5-2.7a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2Z" />
    </svg>
  );
}
