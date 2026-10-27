import type { WorkspaceMode } from '../core/workspace/workspace';
import { pickLanguage, type BaseTranslations, type Language } from '../core/i18n/i18n';

export type NavigationLanguage = Language;

export type RouteKey =
  | '/overview'
  | '/products'
  | '/locations'
  | '/quality'
  | '/cycle-counts'
  | '/inbound'
  | '/inventory'
  | '/outbound'
  | '/tasks'
  | '/waves'
  | '/rf'
  | '/packing'
  | '/carriers'
  | '/control-tower'
  | '/integrations'
  | '/reliability'
  | '/print-stations'
  | '/settings';

export interface NavigationItem {
  key: RouteKey;
  label: string;
  eyebrow: string;
  icon: string;
  permission?: string;
}

export const navigation: NavigationItem[] = [
  { key: '/overview', label: 'Přehled', eyebrow: 'provoz skladu', icon: '⌘' },
  { key: '/inventory', label: 'Zásoby', eyebrow: 'sklad · lokace', icon: '□', permission: 'inventory.read' },
  { key: '/locations', label: 'Lokace', eyebrow: 'zaskladnění · kapacita', icon: '▥', permission: 'inventory.read' },
  { key: '/quality', label: 'Kvalita', eyebrow: 'vratky · karanténa', icon: '◌', permission: 'inventory.read' },
  { key: '/cycle-counts', label: 'Inventury', eyebrow: 'počty · rozdíly', icon: '☑', permission: 'cycle-count.read' },
  { key: '/outbound', label: 'Objednávky', eyebrow: 'výdej · expedice', icon: '↗', permission: 'outbound.read' },
  { key: '/inbound', label: 'Příjem', eyebrow: 'ASN · rampa', icon: '↓', permission: 'inbound.read' },
  { key: '/tasks', label: 'Úkoly', eyebrow: 'picking · doplnění', icon: '✓', permission: 'task.read' },
  { key: '/packing', label: 'Balení', eyebrow: 'balík · štítek', icon: '▢', permission: 'packing.read' },
  { key: '/carriers', label: 'Doprava', eyebrow: 'dopravce · tracking', icon: '⇄', permission: 'carrier.read' },
  { key: '/waves', label: 'Vlny', eyebrow: 'uvolnění · cut-off', icon: '≋', permission: 'wave.read' },
  { key: '/rf', label: 'Skenování', eyebrow: 'RF pracovní tok', icon: '▣', permission: 'task.manage' },
  { key: '/control-tower', label: 'Provoz', eyebrow: 'termíny · výjimky', icon: '◎', permission: 'control-tower.read' },
  { key: '/integrations', label: 'Integrace', eyebrow: 'stav napojení', icon: '◇', permission: 'integration.read' },
  { key: '/reliability', label: 'Stabilita', eyebrow: 'alerty · readiness', icon: '◈', permission: 'metrics.read' },
  { key: '/print-stations', label: 'Tiskárny', eyebrow: 'štítky · dotisk', icon: '▤', permission: 'label.read' },
  { key: '/products', label: 'Produkty', eyebrow: 'SKU · čárové kódy', icon: '▦', permission: 'product.read' },
  { key: '/settings', label: 'Nastavení', eyebrow: 'účet · uživatelé', icon: '⚙︎' },
];

const navigationCopy: Record<RouteKey, BaseTranslations<Pick<NavigationItem, 'label' | 'eyebrow'>>> = {
  '/overview': { cs: { label: 'Přehled', eyebrow: 'provoz skladu' }, en: { label: 'Overview', eyebrow: 'warehouse operations' }, ua: { label: 'Огляд', eyebrow: 'робота складу' } },
  '/products': { cs: { label: 'Produkty', eyebrow: 'SKU · čárové kódy' }, en: { label: 'Products', eyebrow: 'SKU · barcodes' }, ua: { label: 'Продукти', eyebrow: 'SKU · штрихкоди' } },
  '/locations': { cs: { label: 'Lokace', eyebrow: 'zaskladnění · kapacita' }, en: { label: 'Locations', eyebrow: 'putaway · capacity' }, ua: { label: 'Локації', eyebrow: 'розміщення · місткість' } },
  '/quality': { cs: { label: 'Kvalita', eyebrow: 'vratky · karanténa' }, en: { label: 'Quality', eyebrow: 'returns · quarantine' }, ua: { label: 'Якість', eyebrow: 'повернення · карантин' } },
  '/cycle-counts': { cs: { label: 'Inventury', eyebrow: 'počty · rozdíly' }, en: { label: 'Cycle counts', eyebrow: 'counts · variances' }, ua: { label: 'Інвентаризації', eyebrow: 'підрахунки · розбіжності' } },
  '/inventory': { cs: { label: 'Zásoby', eyebrow: 'sklad · lokace' }, en: { label: 'Inventory', eyebrow: 'stock · locations' }, ua: { label: 'Запаси', eyebrow: 'склад · локації' } },
  '/outbound': { cs: { label: 'Objednávky', eyebrow: 'výdej · expedice' }, en: { label: 'Orders', eyebrow: 'outbound · shipping' }, ua: { label: 'Замовлення', eyebrow: 'відвантаження · доставка' } },
  '/inbound': { cs: { label: 'Příjem', eyebrow: 'ASN · rampa' }, en: { label: 'Receiving', eyebrow: 'ASN · dock' }, ua: { label: 'Приймання', eyebrow: 'ASN · рампа' } },
  '/tasks': { cs: { label: 'Úkoly', eyebrow: 'picking · doplnění' }, en: { label: 'Tasks', eyebrow: 'picking · replenishment' }, ua: { label: 'Завдання', eyebrow: 'відбір · поповнення' } },
  '/packing': { cs: { label: 'Balení', eyebrow: 'balík · štítek' }, en: { label: 'Packing', eyebrow: 'parcel · label' }, ua: { label: 'Пакування', eyebrow: 'посилка · етикетка' } },
  '/carriers': { cs: { label: 'Doprava', eyebrow: 'dopravce · tracking' }, en: { label: 'Carriers', eyebrow: 'carrier · tracking' }, ua: { label: 'Доставка', eyebrow: 'перевізник · трекінг' } },
  '/waves': { cs: { label: 'Vlny', eyebrow: 'uvolnění · cut-off' }, en: { label: 'Waves', eyebrow: 'release · cut-off' }, ua: { label: 'Хвилі', eyebrow: 'випуск · дедлайн' } },
  '/rf': { cs: { label: 'Skenování', eyebrow: 'RF pracovní tok' }, en: { label: 'Scanning', eyebrow: 'RF workflow' }, ua: { label: 'Сканування', eyebrow: 'RF процес' } },
  '/control-tower': { cs: { label: 'Provoz', eyebrow: 'termíny · výjimky' }, en: { label: 'Operations', eyebrow: 'deadlines · exceptions' }, ua: { label: 'Операції', eyebrow: 'терміни · винятки' } },
  '/integrations': { cs: { label: 'Integrace', eyebrow: 'stav napojení' }, en: { label: 'Integrations', eyebrow: 'connection status' }, ua: { label: 'Інтеграції', eyebrow: 'стан підключення' } },
  '/reliability': { cs: { label: 'Stabilita', eyebrow: 'alerty · readiness' }, en: { label: 'Reliability', eyebrow: 'alerts · readiness' }, ua: { label: 'Стабільність', eyebrow: 'алерти · готовність' } },
  '/print-stations': { cs: { label: 'Tiskárny', eyebrow: 'štítky · dotisk' }, en: { label: 'Printers', eyebrow: 'labels · reprint' }, ua: { label: 'Принтери', eyebrow: 'етикетки · повторний друк' } },
  '/settings': { cs: { label: 'Nastavení', eyebrow: 'účet · uživatelé' }, en: { label: 'Settings', eyebrow: 'account · users' }, ua: { label: 'Налаштування', eyebrow: 'акаунт · користувачі' } },
};

export interface NavigationSection {
  label: string;
  routes: RouteKey[];
}

export const navigationSectionsByMode: Record<WorkspaceMode, NavigationSection[]> = {
  PRACOVNIK: [
    { label: 'PRÁCE', routes: ['/rf', '/tasks', '/inbound', '/packing'] },
    { label: 'PODPORA', routes: ['/inventory', '/locations', '/print-stations'] },
  ],
  ADMIN: [
    { label: 'PROVOZ', routes: ['/overview', '/control-tower', '/outbound', '/tasks'] },
    { label: 'SKLAD', routes: ['/products', '/locations', '/inbound', '/inventory', '/cycle-counts', '/quality', '/packing', '/carriers'] },
    { label: 'PODPORA', routes: ['/print-stations', '/integrations'] },
  ],
  SPRAVCE: [
    { label: 'SYSTÉM', routes: ['/settings', '/reliability', '/overview', '/products', '/locations', '/cycle-counts', '/quality'] },
    { label: 'NAPOJENÍ', routes: ['/integrations', '/print-stations'] },
  ],
  KLIENT: [
    { label: 'PŘEHLED', routes: ['/overview', '/inventory', '/outbound', '/carriers'] },
  ],
};

const sectionCopy: Record<string, BaseTranslations<string>> = {
  PRÁCE: { cs: 'PRÁCE', en: 'WORK', ua: 'РОБОТА' },
  PODPORA: { cs: 'PODPORA', en: 'SUPPORT', ua: 'ПІДТРИМКА' },
  PROVOZ: { cs: 'PROVOZ', en: 'OPERATIONS', ua: 'ОПЕРАЦІЇ' },
  SKLAD: { cs: 'SKLAD', en: 'WAREHOUSE', ua: 'СКЛАД' },
  TÝM: { cs: 'TÝM', en: 'TEAM', ua: 'КОМАНДА' },
  NASTAVENÍ: { cs: 'NASTAVENÍ', en: 'SETTINGS', ua: 'НАЛАШТУВАННЯ' },
  SYSTÉM: { cs: 'SYSTÉM', en: 'SYSTEM', ua: 'СИСТЕМА' },
  NAPOJENÍ: { cs: 'NAPOJENÍ', en: 'CONNECTIONS', ua: 'ПІДКЛЮЧЕННЯ' },
  SPRÁVA: { cs: 'SPRÁVA', en: 'ADMIN', ua: 'АДМІН' },
  PŘEHLED: { cs: 'PŘEHLED', en: 'OVERVIEW', ua: 'ОГЛЯД' },
  PORTÁL: { cs: 'PORTÁL', en: 'PORTAL', ua: 'ПОРТАЛ' },
};

export function translateNavigationItem(item: NavigationItem, language: NavigationLanguage = 'cs'): NavigationItem {
  return { ...item, ...pickLanguage(language, navigationCopy[item.key]) };
}

export function getNavigationItem(route: RouteKey, language: NavigationLanguage = 'cs'): NavigationItem {
  const item = navigation.find((entry) => entry.key === route) ?? navigation[0];
  return translateNavigationItem(item, language);
}

export function getNavigationSections(mode: WorkspaceMode, language: NavigationLanguage = 'cs'): NavigationSection[] {
  const sections = navigationSectionsByMode[mode] ?? navigationSectionsByMode.ADMIN;
  return sections.map((section) => ({
    ...section,
    label: sectionCopy[section.label] ? pickLanguage(language, sectionCopy[section.label]) : section.label,
  }));
}

export function getNavigationForMode(mode: WorkspaceMode, language: NavigationLanguage = 'cs'): NavigationItem[] {
  const routeSet = new Set((navigationSectionsByMode[mode] ?? navigationSectionsByMode.ADMIN).flatMap((section) => section.routes));
  return navigation.filter((item) => routeSet.has(item.key)).map((item) => translateNavigationItem(item, language));
}

export function isRouteKey(value: string): value is RouteKey {
  return navigation.some((item) => item.key === value);
}
