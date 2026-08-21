export interface SessionTokens {
  accessToken: string;
  refreshToken?: string;
  user?: unknown;
}

export interface SessionWarehouseAccess {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  roleCodes: string[];
  permissionCodes: string[];
}

export interface SessionClientAccess {
  clientId: string;
  clientCode: string;
  clientName: string;
  warehouseId?: string | null;
  warehouseCode?: string | null;
  isActive: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  permissions?: string[];
  warehouses?: SessionWarehouseAccess[];
  clientAccess?: SessionClientAccess[];
}

const ACCESS_TOKEN_KEY = 'wms.console.accessToken';
const REFRESH_TOKEN_KEY = 'wms.console.refreshToken';
const USER_KEY = 'wms.console.user';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const memoryStore = new Map<string, string>();

const memoryStorage: StorageLike = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value);
  },
  removeItem: (key) => {
    memoryStore.delete(key);
  },
};

function getBrowserStorage(kind: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const probeKey = `wms.console.${kind}.probe`;
    const storage = window[kind];
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return undefined;
  }
}

function getPrimaryStorage(): StorageLike {
  return getBrowserStorage('sessionStorage') ?? memoryStorage;
}

function getLegacyStorage(): StorageLike | undefined {
  return getBrowserStorage('localStorage');
}

function readToken(key: string): string | null {
  const primary = getPrimaryStorage();
  const value = primary.getItem(key);
  if (value) return value;

  const legacy = getLegacyStorage();
  const legacyValue = legacy?.getItem(key) ?? null;
  if (legacyValue) {
    primary.setItem(key, legacyValue);
    legacy?.removeItem(key);
  }

  return legacyValue;
}

function writeToken(key: string, value: string): void {
  getPrimaryStorage().setItem(key, value);
}

function removeToken(key: string): void {
  getPrimaryStorage().removeItem(key);
  getLegacyStorage()?.removeItem(key);
}

function readJson<T>(key: string): T | null {
  const text = readToken(key);
  if (!text) return null;

  try {
    return JSON.parse(text) as T;
  } catch {
    removeToken(key);
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  writeToken(key, JSON.stringify(value));
}

export function getAccessToken() {
  return readToken(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return readToken(REFRESH_TOKEN_KEY);
}

export function getSessionUser() {
  return readJson<SessionUser>(USER_KEY);
}

export function saveSessionUser(user: unknown) {
  if (user && typeof user === 'object') {
    writeJson(USER_KEY, user);
  }
}

export function saveTokens(tokens: SessionTokens) {
  writeToken(ACCESS_TOKEN_KEY, tokens.accessToken);
  if (tokens.refreshToken) {
    writeToken(REFRESH_TOKEN_KEY, tokens.refreshToken);
  }
  if (tokens.user !== undefined) {
    saveSessionUser(tokens.user);
  }
}

export function clearTokens() {
  removeToken(ACCESS_TOKEN_KEY);
  removeToken(REFRESH_TOKEN_KEY);
  removeToken(USER_KEY);
}

export function hasSession() {
  return Boolean(getAccessToken());
}
