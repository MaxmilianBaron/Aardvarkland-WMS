import { pickLanguage } from '../../core/i18n/i18n';
import { getNavigationForMode, getNavigationSections, RouteKey } from '../../app/navigation';
import { AccountMenu } from './AccountMenu';
import { cx } from '../../core/utils/format';
import { useWorkspace } from '../../core/workspace/workspace';

interface SidebarProps {
  route: RouteKey;
  onNavigate: (route: RouteKey) => void;
  onLogout: () => void;
}

export function Sidebar({ route, onNavigate, onLogout }: SidebarProps) {
  const { can, language, workspaceMode } = useWorkspace();
  const visibleItems = getNavigationForMode(workspaceMode, language).filter((item) => can(item.permission));
  const visibleByKey = new Map(visibleItems.map((item) => [item.key, item]));
  const sections = getNavigationSections(workspaceMode, language);

  return (
    <aside className="sidebar">
      <div className="sidebar__account">
        <AccountMenu onLogout={onLogout} />
      </div>

      <nav className="nav" aria-label={pickLanguage(language, { cs: 'Hlavní navigace', en: 'Main navigation', ua: 'Головна навігація' })}>
        {sections.map((section) => {
          const items = section.routes.map((key) => visibleByKey.get(key)).filter(Boolean) as typeof visibleItems;
          if (!items.length) return null;

          return (
            <div className="nav__section" key={section.label}>
              <p className="nav__section-label">{section.label}</p>
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={cx('nav__item', route === item.key && 'is-active')}
                  onClick={() => onNavigate(item.key)}
                  aria-current={route === item.key ? 'page' : undefined}
                >
                  <span className="nav__icon" aria-hidden="true"><SidebarNavIcon route={item.key} fallback={item.icon} /></span>
                  <span className="nav__copy">
                    <strong>{item.label}</strong>
                    <small>{item.eyebrow}</small>
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function SidebarNavIcon({ route, fallback }: { route: RouteKey; fallback?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const dot = { fill: 'currentColor', stroke: 'none' };

  switch (route) {
    case '/overview': return <svg viewBox="0 0 24 24" {...common}><path d="M4.5 11 12 5.5 19.5 11" /><path d="M6.5 10.5v8h11v-8" /><path d="M10 18.5v-4.2h4v4.2" /><circle cx="17.4" cy="6.8" r="1.2" {...dot} /></svg>;
    case '/products': return <svg viewBox="0 0 24 24" {...common}><path d="M5.5 6.5h8.8l4.2 4.2v6.8a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" /><path d="M14.3 6.7v4.2h4.1" /><path d="M8 14h6" /><circle cx="8" cy="17" r="1" {...dot} /><circle cx="12" cy="17" r="1" {...dot} /></svg>;
    case '/inventory': return <svg viewBox="0 0 24 24" {...common}><path d="M12 4.5 18.5 8 12 11.5 5.5 8 12 4.5Z" /><path d="m5.5 12.4 6.5 3.5 6.5-3.5" /><path d="m5.5 16.8 6.5 3.5 6.5-3.5" /><circle cx="18.2" cy="6" r="1" {...dot} /></svg>;
    case '/locations': return <svg viewBox="0 0 24 24" {...common}><path d="M12 21s6-5.2 6-10.2a6 6 0 1 0-12 0C6 15.8 12 21 12 21Z" /><circle cx="12" cy="10.8" r="2.1" /><path d="M7.5 20h9" /></svg>;
    case '/quality': return <svg viewBox="0 0 24 24" {...common}><path d="M12 4.5 18 7v4.7c0 4-2.5 6.8-6 8.3-3.5-1.5-6-4.3-6-8.3V7l6-2.5Z" /><path d="m9.2 12 1.8 1.8 3.8-4" /><circle cx="17.4" cy="17.3" r="1" {...dot} /></svg>;
    case '/cycle-counts': return <svg viewBox="0 0 24 24" {...common}><path d="M8 4.5h8" /><path d="M9 3.5h6l.8 2.8H8.2L9 3.5Z" /><rect x="5.5" y="6.5" width="13" height="14" rx="2.2" /><path d="m8.8 12 1.6 1.6 3.3-3.5" /><path d="M8.8 17h6.4" /></svg>;
    case '/outbound': return <svg viewBox="0 0 24 24" {...common}><rect x="5" y="7" width="10" height="10" rx="2" /><path d="M10 7v10" /><path d="M14 12h6" /><path d="m17.5 9.5 2.5 2.5-2.5 2.5" /><circle cx="6.5" cy="18.6" r="1" {...dot} /></svg>;
    case '/tasks': return <svg viewBox="0 0 24 24" {...common}><rect x="5.5" y="4.5" width="13" height="15" rx="2.2" /><path d="m8.5 10 1.4 1.4 2.7-3" /><path d="M14.5 10h1.5" /><path d="m8.5 15 1.4 1.4 2.7-3" /><path d="M14.5 15h1.5" /></svg>;
    case '/waves': return <svg viewBox="0 0 24 24" {...common}><path d="M4.5 9.5c2.2-2 4.4-2 6.6 0s4.4 2 6.6 0" /><path d="M4.5 14.5c2.2-2 4.4-2 6.6 0s4.4 2 6.6 0" /><circle cx="19.2" cy="6" r="1.1" {...dot} /><circle cx="6" cy="18.2" r="1" {...dot} /></svg>;
    case '/inbound': return <svg viewBox="0 0 24 24" {...common}><path d="M12 4v9" /><path d="m8.5 9.5 3.5 3.5 3.5-3.5" /><path d="M5.5 14.5v3.2a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-3.2" /><circle cx="18.4" cy="5.6" r="1" {...dot} /></svg>;
    case '/packing': return <svg viewBox="0 0 24 24" {...common}><path d="M5.5 8.5 12 5l6.5 3.5v8L12 20l-6.5-3.5v-8Z" /><path d="m5.8 8.7 6.2 3.4 6.2-3.4" /><path d="M12 12.1V20" /><path d="M9.2 6.5 15.5 10" /></svg>;
    case '/print-stations': return <svg viewBox="0 0 24 24" {...common}><path d="M7.5 8V4.5h9V8" /><rect x="4" y="8" width="16" height="8.5" rx="2.2" /><path d="M7.5 14h9v5.5h-9z" /><circle cx="17.3" cy="11.4" r="1" {...dot} /></svg>;
    case '/carriers': return <svg viewBox="0 0 24 24" {...common}><path d="M4.5 8h9.5v7.2H4.5z" /><path d="M14 10.5h3.1l2.4 2.7v2H14z" /><circle cx="7.4" cy="17.5" r="1.8" /><circle cx="17.1" cy="17.5" r="1.8" /><path d="M6 6.2h4" /></svg>;
    case '/rf': return <svg viewBox="0 0 24 24" {...common}><rect x="7" y="3.5" width="10" height="17" rx="2.3" /><path d="M9.5 7.5h5" /><path d="M9.5 15.5h5" /><circle cx="12" cy="18.2" r="1" {...dot} /><path d="M18.8 8.2h.01" /><path d="M20.5 11h.01" /></svg>;
    case '/control-tower': return <svg viewBox="0 0 24 24" {...common}><path d="M5 19.5V12" /><path d="M10 19.5V6" /><path d="M15 19.5v-9" /><path d="M20 19.5V8.5" /><path d="M4 19.5h17" /><circle cx="10" cy="4.5" r="1" {...dot} /></svg>;
    case '/integrations': return <svg viewBox="0 0 24 24" {...common}><path d="M8.5 8.5 6.8 6.8a3 3 0 0 1 4.2-4.2l2.1 2.1" /><path d="m10.8 10.8 2.4 2.4" /><path d="m15.5 15.5 1.7 1.7a3 3 0 0 1-4.2 4.2l-2.1-2.1" /><path d="M16.5 5.5h2.8v2.8" /><path d="m19.3 5.5-4.5 4.5" /></svg>;
    case '/reliability': return <svg viewBox="0 0 24 24" {...common}><path d="M12 3 4 7v6c0 4 3.4 7 8 8 4.6-1 8-4 8-8V7l-8-4Z" /><path d="M9 12h6" /><path d="M12 9v6" /></svg>;
    case '/settings': return <svg viewBox="0 0 24 24" {...common}><path d="M5 7h14" /><path d="M5 17h14" /><path d="M8.5 4.8v4.4" /><path d="M15.5 14.8v4.4" /><circle cx="8.5" cy="7" r="2" /><circle cx="15.5" cy="17" r="2" /></svg>;
    default: return <span>{fallback}</span>;
  }
}
