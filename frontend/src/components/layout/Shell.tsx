import { PropsWithChildren } from 'react';
import { RouteKey } from '../../app/navigation';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileTabbar } from './MobileTabbar';

interface ShellProps {
  route: RouteKey;
  onNavigate: (route: RouteKey) => void;
  onLogout: () => void;
}

export function Shell({ route, onNavigate, onLogout, children }: PropsWithChildren<ShellProps>) {
  return (
    <div className="shell">
      <Sidebar route={route} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="main">
        <Topbar route={route} />
        <div className="content">
          {children}
        </div>
      </main>
      <MobileTabbar route={route} onNavigate={onNavigate} />
    </div>
  );
}
