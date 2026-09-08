import { useState } from 'react';
import { useWorkspace } from '../../core/workspace/workspace';
import { RouteKey } from '../../app/navigation';
import { APP_NAME, APP_TAGLINES } from '../../app/constants';
import { languageMenuItems, pickLanguage, type Language } from '../../core/i18n/i18n';
import { FlagIcon } from '../ui/FlagIcon';
import { ThemeToggle } from '../ui/ThemeToggle';

interface TopbarProps {
  route: RouteKey;
}

export function Topbar({ route }: TopbarProps) {
  const { language, setLanguage } = useWorkspace();
  const text = pickLanguage(language, {
    cs: { languageAria: 'Přepnout jazyk' },
    en: { languageAria: 'Switch language' },
    ua: { languageAria: 'Перемкнути мову' },
  });
  const tagline = APP_TAGLINES[language];

  return (
    <header className="topbar topbar--minimal" data-route={route}>
      <div className="topbar-brand">
        <span className="topbar-brand__mark" aria-hidden="true">
          <img src="/assets/aardvarkland-icon.png" alt="" />
        </span>
        <div className="topbar-brand__copy">
          <strong>{APP_NAME}</strong>
          <span>{tagline}</span>
        </div>
      </div>
      <div className="topbar__actions topbar__actions--workspace">
        <LanguageMenu language={language} setLanguage={setLanguage} ariaLabel={text.languageAria} />
        <ThemeToggle language={language} />
      </div>
    </header>
  );
}

function LanguageMenu({
  language,
  setLanguage,
  ariaLabel,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const items = languageMenuItems;

  return (
    <div className="language-menu">
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
