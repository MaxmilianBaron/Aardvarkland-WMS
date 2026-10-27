import { pickLanguage } from '../../core/i18n/i18n';
import { useMemo, useState } from 'react';
import { getNavigationForMode, RouteKey } from '../../app/navigation';
import { cx } from '../../core/utils/format';
import { useWorkspace } from '../../core/workspace/workspace';

export function MobileTabbar({ route, onNavigate }: { route: RouteKey; onNavigate: (route: RouteKey) => void }) {
  const { can, language, workspaceMode } = useWorkspace();
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileItems = useMemo(
    () => getNavigationForMode(workspaceMode, language).filter((item) => can(item.permission)),
    [can, language, workspaceMode],
  );
  const primaryItems = mobileItems.slice(0, 4);
  const moreItems = mobileItems.slice(4);
  const moreActive = moreItems.some((item) => item.key === route);
  const labels = pickLanguage(language, { cs: { nav: 'Mobilní navigace', more: 'Další', close: 'Zavřít nabídku' }, en: { nav: 'Mobile navigation', more: 'More', close: 'Close menu' }, ua: { nav: 'Мобільна навігація', more: 'Ще', close: 'Закрити меню' } });

  const navigate = (nextRoute: RouteKey) => {
    setMoreOpen(false);
    onNavigate(nextRoute);
  };

  return (
    <nav className="mobile-tabbar" aria-label={labels.nav}>
      {moreOpen && moreItems.length > 0 && (
        <div className="mobile-tabbar__more" role="menu">
          {moreItems.map((item) => (
            <button
              type="button"
              key={item.key}
              className={cx(route === item.key && 'is-active')}
              onClick={() => navigate(item.key)}
              aria-current={route === item.key ? 'page' : undefined}
              role="menuitem"
            >
              <span aria-hidden="true">{item.icon}</span>
              <small>{item.label}</small>
            </button>
          ))}
        </div>
      )}
      {primaryItems.map((item) => (
        <button
          type="button"
          key={item.key}
          className={cx(route === item.key && 'is-active')}
          onClick={() => navigate(item.key)}
          aria-current={route === item.key ? 'page' : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          <small>{item.label}</small>
        </button>
      ))}
      {moreItems.length > 0 && (
        <button
          type="button"
          className={cx((moreActive || moreOpen) && 'is-active')}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-label={moreOpen ? labels.close : labels.more}
        >
          <span aria-hidden="true">...</span>
          <small>{labels.more}</small>
        </button>
      )}
    </nav>
  );
}
