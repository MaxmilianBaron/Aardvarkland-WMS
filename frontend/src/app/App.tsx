import { pickLanguage } from '../core/i18n/i18n';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { CommandPalette } from '../components/layout/CommandPalette';
import { PwaStatusBanner } from '../components/layout/PwaStatusBanner';
import { Shell } from '../components/layout/Shell';
import { hasSession } from '../core/auth/session';
import { connectWarehouseRealtime, WMS_REALTIME_EVENT } from '../core/api/realtime';
import { reportFrontendEvent, setFrontendObservabilityContext } from '../core/observability/frontendObservability';
import { LoginPage } from '../features/auth/LoginPage';
import { getNavigationForMode, RouteKey, navigation } from './navigation';
import { useHashRoute } from './useHashRoute';
import { WorkspaceProvider, useWorkspace } from '../core/workspace/workspace';

const loadCarriersPage = () => import('../features/carriers/CarriersPage').then(({ CarriersPage }) => ({ default: CarriersPage }));
const loadControlTowerPage = () => import('../features/controlTower/ControlTowerPage').then(({ ControlTowerPage }) => ({ default: ControlTowerPage }));
const loadDashboardPage = () => import('../features/dashboard/DashboardPage').then(({ DashboardPage }) => ({ default: DashboardPage }));
const loadInboundPage = () => import('../features/inbound/InboundPage').then(({ InboundPage }) => ({ default: InboundPage }));
const loadInventoryPage = () => import('../features/inventory/InventoryPage').then(({ InventoryPage }) => ({ default: InventoryPage }));
const loadLocationsPage = () => import('../features/locations/LocationsPage').then(({ LocationsPage }) => ({ default: LocationsPage }));
const loadCycleCountsPage = () => import('../features/cycleCounts/CycleCountsPage').then(({ CycleCountsPage }) => ({ default: CycleCountsPage }));
const loadOutboundPage = () => import('../features/outbound/OutboundPage').then(({ OutboundPage }) => ({ default: OutboundPage }));
const loadPackingPage = () => import('../features/packing/PackingPage').then(({ PackingPage }) => ({ default: PackingPage }));
const loadProductMasterPage = () => import('../features/products/ProductMasterPage').then(({ ProductMasterPage }) => ({ default: ProductMasterPage }));
const loadQualityPage = () => import('../features/quality/QualityPage').then(({ QualityPage }) => ({ default: QualityPage }));
const loadRfPage = () => import('../features/rf/RfPage').then(({ RfPage }) => ({ default: RfPage }));
const loadSettingsPage = () => import('../features/settings/SettingsPage').then(({ SettingsPage }) => ({ default: SettingsPage }));
const loadIntegrationsStatusPage = () => import('../features/system/IntegrationsStatusPage').then(({ IntegrationsStatusPage }) => ({ default: IntegrationsStatusPage }));
const loadReliabilityPage = () => import('../features/system/ReliabilityPage').then(({ ReliabilityPage }) => ({ default: ReliabilityPage }));
const loadPrintStationsPage = () => import('../features/system/PrintStationsPage').then(({ PrintStationsPage }) => ({ default: PrintStationsPage }));
const loadTasksPage = () => import('../features/tasks/TasksPage').then(({ TasksPage }) => ({ default: TasksPage }));
const loadWavesPage = () => import('../features/waves/WavesPage').then(({ WavesPage }) => ({ default: WavesPage }));

const routePreloaders: Record<RouteKey, () => Promise<unknown>> = {
  '/overview': loadDashboardPage,
  '/products': loadProductMasterPage,
  '/locations': loadLocationsPage,
  '/cycle-counts': loadCycleCountsPage,
  '/quality': loadQualityPage,
  '/inbound': loadInboundPage,
  '/inventory': loadInventoryPage,
  '/outbound': loadOutboundPage,
  '/tasks': loadTasksPage,
  '/waves': loadWavesPage,
  '/rf': loadRfPage,
  '/packing': loadPackingPage,
  '/carriers': loadCarriersPage,
  '/control-tower': loadControlTowerPage,
  '/integrations': loadIntegrationsStatusPage,
  '/reliability': loadReliabilityPage,
  '/print-stations': loadPrintStationsPage,
  '/settings': loadSettingsPage,
};

const CarriersPage = lazy(loadCarriersPage);
const ControlTowerPage = lazy(loadControlTowerPage);
const DashboardPage = lazy(loadDashboardPage);
const InboundPage = lazy(loadInboundPage);
const InventoryPage = lazy(loadInventoryPage);
const LocationsPage = lazy(loadLocationsPage);
const CycleCountsPage = lazy(loadCycleCountsPage);
const OutboundPage = lazy(loadOutboundPage);
const PackingPage = lazy(loadPackingPage);
const ProductMasterPage = lazy(loadProductMasterPage);
const QualityPage = lazy(loadQualityPage);
const RfPage = lazy(loadRfPage);
const SettingsPage = lazy(loadSettingsPage);
const IntegrationsStatusPage = lazy(loadIntegrationsStatusPage);
const ReliabilityPage = lazy(loadReliabilityPage);
const PrintStationsPage = lazy(loadPrintStationsPage);
const TasksPage = lazy(loadTasksPage);
const WavesPage = lazy(loadWavesPage);

export function App() {
  const [authenticated, setAuthenticated] = useState(hasSession());

  if (!authenticated) return <LoginPage onLogin={() => setAuthenticated(true)} />;

  return (
    <WorkspaceProvider>
      <AuthenticatedApp onLogout={() => setAuthenticated(false)} />
    </WorkspaceProvider>
  );
}

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const { route, setRoute } = useHashRoute();
  const [commandOpen, setCommandOpen] = useState(false);
  const { can, language, roleProfile, warehouseId, workspaceMode } = useWorkspace();
  const navigate = useCallback((nextRoute: RouteKey) => {
    void routePreloaders[nextRoute]?.();
    setRoute(nextRoute);
  }, [setRoute]);

  useEffect(() => {
    const active = navigation.find((item) => item.key === route);
    const routeAllowedInMode = getNavigationForMode(workspaceMode).some((item) => item.key === route);
    if (active && (!can(active.permission) || !routeAllowedInMode)) navigate(roleProfile.homeRoute);
  }, [route, can, navigate, roleProfile.homeRoute, workspaceMode]);

  useEffect(() => {
    setFrontendObservabilityContext({ route, language, roleId: roleProfile.id });
    reportFrontendEvent({ type: 'app_loaded', severity: 'info', message: 'authenticated-app-view' });
  }, [language, route, roleProfile.id]);

  useEffect(() => {
    if (!can('realtime.read')) return undefined;
    return connectWarehouseRealtime(warehouseId, (event) => {
      if (event.type === 'realtime.heartbeat') return;
      window.dispatchEvent(new CustomEvent(WMS_REALTIME_EVENT, { detail: event }));
    });
  }, [can, warehouseId]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <Shell route={route} onNavigate={navigate} onLogout={onLogout}>
        <PwaStatusBanner route={route} />
        <RouteRenderer route={route} />
      </Shell>
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} onNavigate={navigate} />
    </>
  );
}

function RouteRenderer({ route }: { route: RouteKey }) {
  return (
    <Suspense fallback={<RouteLoading route={route} />}>
      <RoutePage route={route} />
    </Suspense>
  );
}

function RouteLoading({ route }: { route: RouteKey }) {
  const { language } = useWorkspace();
  const label = route === '/print-stations'
    ? pickLanguage(language, { cs: 'Tisk provozního štítku', en: 'Operational label print', ua: 'Друк робочої етикетки' })
    : pickLanguage(language, { cs: 'Načítání stránky...', en: 'Loading page...', ua: 'Завантаження сторінки...' });
  return <div className="route-loading" role="status">{label}</div>;
}

function RoutePage({ route }: { route: RouteKey }) {
  switch (route) {
    case '/products': return <ProductMasterPage />;
    case '/locations': return <LocationsPage />;
    case '/cycle-counts': return <CycleCountsPage />;
    case '/quality': return <QualityPage />;
    case '/inbound': return <InboundPage />;
    case '/inventory': return <InventoryPage />;
    case '/outbound': return <OutboundPage />;
    case '/tasks': return <TasksPage />;
    case '/waves': return <WavesPage />;
    case '/rf': return <RfPage />;
    case '/packing': return <PackingPage />;
    case '/carriers': return <CarriersPage />;
    case '/control-tower': return <ControlTowerPage />;
    case '/integrations': return <IntegrationsStatusPage />;
    case '/reliability': return <ReliabilityPage />;
    case '/print-stations': return <PrintStationsPage />;
    case '/settings': return <SettingsPage />;
    case '/overview':
    default: return <DashboardPage />;
  }
}
