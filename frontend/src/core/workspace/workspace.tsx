import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { config } from '../../app/config';
import type { RouteKey } from '../../app/navigation';
import { getWorkContext, updateWorkContext, type UpdateWorkContextInput, type WorkContextResponse } from '../api/auth';
import { getAccessToken, getSessionUser, saveSessionUser, type SessionUser } from '../auth/session';
import { languageLocale, pickLanguage, supportedLanguages, type BaseTranslations, type Language } from '../i18n/i18n';

export type { Language } from '../i18n/i18n';

export type RoleId = 'WAREHOUSE_WORKER' | 'WAREHOUSE_MANAGER' | 'WMS_ADMIN';
export type WorkspaceMode = 'PRACOVNIK' | 'ADMIN' | 'SPRAVCE' | 'KLIENT';

export interface RoleProfile {
  id: RoleId;
  label: string;
  shortLabel: string;
  description: string;
  homeRoute: RouteKey;
  workspaceMode: WorkspaceMode;
  workspaceLabel: string;
  permissions: string[];
  focus: string[];
}

export interface WarehouseOption {
  id: string;
  label: string;
  client: string;
  shift: string;
}

export const roleProfiles: RoleProfile[] = [
  {
    id: 'WAREHOUSE_WORKER',
    label: 'Skladník',
    shortLabel: 'Skladník',
    description: 'Denní práce ve skladu: skenování, příjem, úkoly, balení a základní kontrola zásob.',
    homeRoute: '/rf',
    workspaceMode: 'PRACOVNIK',
    workspaceLabel: 'Rozhraní skladníka',
    permissions: [
      'warehouse.read',
      'product.read',
      'inbound.read',
      'inbound.manage',
      'inventory.read',
      'inventory.move',
      'outbound.read',
      'task.read',
      'task.manage',
      'packing.read',
      'packing.manage',
      'shipment.read',
      'shipment.manage',
      'label.read',
      'label.print',
      'carrier.read',
      'rf.read',
      'rf.manage',
      'realtime.read',
    ],
    focus: ['Skenování', 'Příjem', 'Úkoly', 'Balení'],
  },
  {
    id: 'WAREHOUSE_MANAGER',
    label: 'Vedoucí skladu',
    shortLabel: 'Vedoucí',
    description: 'Řízení skladu, výjimky, termíny, úkoly a kapacita týmu.',
    homeRoute: '/control-tower',
    workspaceMode: 'ADMIN',
    workspaceLabel: 'Rozhraní vedoucího',
    permissions: [
      'warehouse.read',
      'product.read',
      'inbound.read',
      'inbound.manage',
      'inventory.read',
      'inventory.move',
      'inventory.adjust',
      'outbound.read',
      'outbound.manage',
      'task.read',
      'task.manage',
      'wave.read',
      'wave.manage',
      'packing.read',
      'packing.manage',
      'shipment.read',
      'shipment.manage',
      'carrier.read',
      'carrier.manage',
      'label.read',
      'label.print',
      'label.queue.manage',
      'integration.read',
      'scanner.read',
      'scanner.manage',
      'rf.read',
      'rf.manage',
      'control-tower.read',
      'analytics.read',
      'exception.read',
      'exception.manage',
      'cycle-count.read',
      'cycle-count.manage',
      'integrity.read',
      'realtime.read',
    ],
    focus: ['Termíny', 'Výjimky', 'Úkoly', 'Kapacita lidí'],
  },
  {
    id: 'WMS_ADMIN',
    label: 'Správce systému',
    shortLabel: 'Správce',
    description: 'Nastavení uživatelů, rolí, skladů, integrací, API a systémových pravidel.',
    homeRoute: '/settings',
    workspaceMode: 'SPRAVCE',
    workspaceLabel: 'Rozhraní správce',
    permissions: ['*'],
    focus: ['Uživatelé', 'Role', 'Integrace', 'API'],
  },
];

export const warehouseOptions: WarehouseOption[] = [
  { id: config.defaultWarehouseId, label: 'Hlavní sklad', client: 'Všichni klienti', shift: 'Aktuální' },
];

export const clientOptions = ['Všichni klienti'];
const languageOptions = supportedLanguages;
const rolePriority: RoleId[] = ['WMS_ADMIN', 'WAREHOUSE_MANAGER', 'WAREHOUSE_WORKER'];
const warehouseCopy: Record<string, BaseTranslations<string>> = {
  MAIN: { cs: 'Hlavní sklad', en: 'Main warehouse', ua: 'Головний склад' },
  'BRNO-DC': { cs: 'Brno vratky a kontrola', en: 'Brno returns and inspection', ua: 'Брно повернення та контроль' },
  'PLZEN-XD': { cs: 'Plzeň cross-dock', en: 'Pilsen cross-dock', ua: 'Пльзень крос-док' },
};
const clientCopy: Record<string, BaseTranslations<string>> = {
  'Všichni klienti': { cs: 'Všichni klienti', en: 'All clients', ua: 'Усі клієнти' },
};
const legacyRoleMap: Record<string, RoleId> = {
  WAREHOUSE_WORKER: 'WAREHOUSE_WORKER',
  PICKER: 'WAREHOUSE_WORKER',
  PACKER: 'WAREHOUSE_WORKER',
  INBOUND_OPERATOR: 'WAREHOUSE_WORKER',
  WAREHOUSE_MANAGER: 'WAREHOUSE_MANAGER',
  SUPERVISOR: 'WAREHOUSE_MANAGER',
  WMS_ADMIN: 'WMS_ADMIN',
  ADMIN: 'WMS_ADMIN',
};

const roleProfileCopy: Record<RoleId, BaseTranslations<Omit<RoleProfile, 'id' | 'homeRoute' | 'workspaceMode' | 'permissions'>>> = {
  WAREHOUSE_WORKER: {
    cs: {
      label: 'Skladník',
      shortLabel: 'Skladník',
      description: 'Denní práce ve skladu: skenování, příjem, úkoly, balení a základní kontrola zásob.',
      workspaceLabel: 'Rozhraní skladníka',
      focus: ['Skenování', 'Příjem', 'Úkoly', 'Balení'],
    },
    en: {
      label: 'Warehouse worker',
      shortLabel: 'Worker',
      description: 'Daily warehouse work: scanning, receiving, tasks, packing, and basic stock checks.',
      workspaceLabel: 'Worker workspace',
      focus: ['Scanning', 'Receiving', 'Tasks', 'Packing'],
    },
    ua: {
      label: 'Працівник складу',
      shortLabel: 'Працівник',
      description: 'Щоденна робота на складі: сканування, приймання, завдання, пакування та базова перевірка запасів.',
      workspaceLabel: 'Робоче місце працівника',
      focus: ['Сканування', 'Приймання', 'Завдання', 'Пакування'],
    },
  },
  WAREHOUSE_MANAGER: {
    cs: {
      label: 'Vedoucí skladu',
      shortLabel: 'Vedoucí',
      description: 'Řízení skladu, výjimky, termíny, úkoly a kapacita týmu.',
      workspaceLabel: 'Rozhraní vedoucího',
      focus: ['Termíny', 'Výjimky', 'Úkoly', 'Kapacita lidí'],
    },
    en: {
      label: 'Warehouse manager',
      shortLabel: 'Manager',
      description: 'Warehouse control, exceptions, deadlines, tasks, and team capacity.',
      workspaceLabel: 'Manager workspace',
      focus: ['Deadlines', 'Exceptions', 'Tasks', 'Team capacity'],
    },
    ua: {
      label: 'Керівник складу',
      shortLabel: 'Керівник',
      description: 'Керування складом, винятки, терміни, завдання та місткість команди.',
      workspaceLabel: 'Робоче місце керівника',
      focus: ['Терміни', 'Винятки', 'Завдання', 'Команда'],
    },
  },
  WMS_ADMIN: {
    cs: {
      label: 'Správce systému',
      shortLabel: 'Správce',
      description: 'Nastavení uživatelů, rolí, skladů, integrací, API a systémových pravidel.',
      workspaceLabel: 'Rozhraní správce',
      focus: ['Uživatelé', 'Role', 'Integrace', 'API'],
    },
    en: {
      label: 'System administrator',
      shortLabel: 'Admin',
      description: 'Users, roles, warehouses, integrations, API, and system rules.',
      workspaceLabel: 'Admin workspace',
      focus: ['Users', 'Roles', 'Integrations', 'API'],
    },
    ua: {
      label: 'Адміністратор системи',
      shortLabel: 'Адмін',
      description: 'Користувачі, ролі, склади, інтеграції, API та системні правила.',
      workspaceLabel: 'Робоче місце адміністратора',
      focus: ['Користувачі', 'Ролі', 'Інтеграції', 'API'],
    },
  },
};

function readStorage<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === 'undefined') return fallback;

  try {
    const value = window.localStorage.getItem(key) as T | null;
    return value && allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

function normalizeRoleCode(code: unknown): RoleId | null {
  if (typeof code !== 'string') return null;
  return legacyRoleMap[code.trim().toUpperCase()] ?? null;
}

function roleFromSession(user: SessionUser | null): RoleId {
  const roleCodes = (user?.warehouses ?? [])
    .flatMap((warehouse) => warehouse.roleCodes ?? [])
    .map(normalizeRoleCode)
    .filter(Boolean) as RoleId[];

  return rolePriority.find((role) => roleCodes.includes(role)) ?? 'WAREHOUSE_WORKER';
}

function buildWarehouseOptions(user: SessionUser | null): WarehouseOption[] {
  const sessionWarehouses = (user?.warehouses ?? []).map((warehouse) => ({
    id: warehouse.warehouseCode || warehouse.warehouseId,
    label: warehouse.warehouseName || warehouse.warehouseCode || warehouse.warehouseId,
    client: 'Všichni klienti',
    shift: 'Aktuální',
  }));

  const seen = new Set<string>();
  return [...sessionWarehouses, ...warehouseOptions].filter((warehouse) => {
    if (!warehouse.id || seen.has(warehouse.id)) return false;
    seen.add(warehouse.id);
    return true;
  });
}

function unwrapUserPayload(payload: unknown): SessionUser | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = 'data' in payload ? (payload as { data?: unknown }).data : payload;
  return value && typeof value === 'object' ? value as SessionUser : null;
}

function translateRoleProfile(profile: RoleProfile, language: Language): RoleProfile {
  return { ...profile, ...pickLanguage(language, roleProfileCopy[profile.id]) };
}

function translateWarehouseOption(warehouse: WarehouseOption, language: Language): WarehouseOption {
  return {
    ...warehouse,
    label: warehouseCopy[warehouse.id] ? pickLanguage(language, warehouseCopy[warehouse.id]) : warehouse.label,
    client: clientCopy[warehouse.client] ? pickLanguage(language, clientCopy[warehouse.client]) : warehouse.client,
  };
}

function translateClientScope(client: string, language: Language): string {
  return clientCopy[client] ? pickLanguage(language, clientCopy[client]) : client;
}

export function getRoleProfiles(language: Language = 'cs'): RoleProfile[] {
  return roleProfiles.map((profile) => translateRoleProfile(profile, language));
}

interface WorkspaceContextValue {
  role: RoleId;
  roleProfile: RoleProfile;
  currentUser: SessionUser | null;
  workspaceMode: WorkspaceMode;
  warehouseId: string;
  setWarehouseId: (warehouseId: string) => void;
  warehouse: WarehouseOption;
  clientScope: string;
  setClientScope: (client: string) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  workContext: WorkContextResponse | null;
  workContextStatus: 'idle' | 'loading' | 'ready' | 'error';
  saveWorkContext: (input: UpdateWorkContextInput) => Promise<WorkContextResponse | null>;
  refreshWorkContext: () => Promise<void>;
  can: (permission?: string) => boolean;
  canAny: (permissions: string[]) => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() => getSessionUser());
  const availableWarehouses = useMemo(() => buildWarehouseOptions(sessionUser), [sessionUser]);
  const warehouseIds = useMemo(() => availableWarehouses.map((warehouse) => warehouse.id), [availableWarehouses]);
  const [warehouseId, setWarehouseIdState] = useState(() => readStorage('wms-ui-warehouse', availableWarehouses[0]?.id ?? warehouseOptions[0].id, warehouseIds));
  const [clientScope, setClientScopeState] = useState(() => readStorage('wms-ui-client-scope', clientOptions[0], clientOptions));
  const [language, setLanguageState] = useState<Language>(() => readStorage('aardvarkland-ui-language', 'cs', languageOptions));
  const [workContext, setWorkContext] = useState<WorkContextResponse | null>(null);
  const [workContextStatus, setWorkContextStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const role = useMemo(() => roleFromSession(sessionUser), [sessionUser]);
  const roleProfile = useMemo(() => translateRoleProfile(roleProfiles.find((profile) => profile.id === role) ?? roleProfiles[0], language), [language, role]);
  const warehouse = useMemo(() => translateWarehouseOption(availableWarehouses.find((item) => item.id === warehouseId) ?? availableWarehouses[0] ?? warehouseOptions[0], language), [availableWarehouses, language, warehouseId]);
  const effectivePermissions = useMemo(() => {
    const permissions = new Set<string>(sessionUser?.permissions ?? []);
    const selectedWarehouse = (sessionUser?.warehouses ?? []).find((item) => item.warehouseCode === warehouseId || item.warehouseId === warehouseId);

    for (const permission of selectedWarehouse?.permissionCodes ?? []) {
      permissions.add(permission);
    }

    return permissions;
  }, [sessionUser, warehouseId]);

  const setWarehouseId = useCallback((next: string) => {
    setWarehouseIdState(next);
    writeStorage('wms-ui-warehouse', next);
  }, []);

  const setClientScope = useCallback((next: string) => {
    setClientScopeState(next);
    writeStorage('wms-ui-client-scope', next);
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    writeStorage('aardvarkland-ui-language', next);
  }, []);

  const applyWorkContext = useCallback((context: WorkContextResponse) => {
    setWorkContext(context);
    const nextWarehouseId = context.warehouse.code || context.warehouse.id;
    if (nextWarehouseId) {
      setWarehouseIdState(nextWarehouseId);
      writeStorage('wms-ui-warehouse', nextWarehouseId);
    }
  }, []);

  const refreshWorkContext = useCallback(async () => {
    const token = getAccessToken();
    if (!token || typeof window === 'undefined') return;
    setWorkContextStatus('loading');
    try {
      const context = await getWorkContext();
      applyWorkContext(context);
      setWorkContextStatus('ready');
    } catch {
      setWorkContextStatus('error');
    }
  }, [applyWorkContext]);

  const saveWorkContext = useCallback(async (input: UpdateWorkContextInput) => {
    setWorkContextStatus('loading');
    try {
      const context = await updateWorkContext(input);
      applyWorkContext(context);
      setWorkContextStatus('ready');
      return context;
    } catch {
      setWorkContextStatus('error');
      return null;
    }
  }, [applyWorkContext]);

  useEffect(() => {
    document.documentElement.lang = languageLocale(language);
  }, [language]);

  useEffect(() => {
    if (warehouseIds.length > 0 && !warehouseIds.includes(warehouseId)) {
      setWarehouseIdState(warehouseIds[0]);
      writeStorage('wms-ui-warehouse', warehouseIds[0]);
    }
  }, [warehouseId, warehouseIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      const token = getAccessToken();
      if (!token || typeof window === 'undefined') return;

      try {
        const response = await fetch(`${config.apiBaseUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;

        const user = unwrapUserPayload(await response.json());
        if (!user || cancelled) return;

        saveSessionUser(user);
        setSessionUser(user);
      } catch {}
    }

    void loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshWorkContext();
  }, [refreshWorkContext]);

  const can = useCallback(
    (permission?: string) => !permission || effectivePermissions.has('*') || effectivePermissions.has(permission),
    [effectivePermissions],
  );
  const canAny = useCallback((permissions: string[]) => permissions.some((permission) => can(permission)), [can]);
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      role,
      roleProfile,
      currentUser: sessionUser,
      workspaceMode: roleProfile.workspaceMode,
      warehouseId,
      setWarehouseId,
      warehouse,
      clientScope: translateClientScope(clientScope, language),
      setClientScope,
      language,
      setLanguage,
      workContext,
      workContextStatus,
      saveWorkContext,
      refreshWorkContext,
      can,
      canAny,
    }),
    [role, roleProfile, sessionUser, warehouseId, setWarehouseId, warehouse, clientScope, setClientScope, language, setLanguage, workContext, workContextStatus, saveWorkContext, refreshWorkContext, can, canAny],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
