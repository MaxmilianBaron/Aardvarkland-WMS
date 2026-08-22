import { apiRequest } from './http';
import { config } from '../../app/config';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from '../auth/session';

export interface LoginInput {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  user?: unknown;
  requiresMfa?: boolean;
  mfaRequired?: boolean;
  mfaSatisfied?: boolean;
  mfaEnrollmentRequired?: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface MfaStatusResponse {
  enabled: boolean;
  verifiedAt: string | null;
}

export interface MfaSetupResponse {
  secret: string;
  otpAuthUri: string;
  issuer: string;
  accountName: string;
}

export interface VerifyMfaInput {
  code: string;
}

export interface WorkContextWarehouse {
  id: string;
  code: string;
  name: string;
}

export interface WorkContextResponse {
  userId: string;
  warehouse: WorkContextWarehouse;
  zone: string | null;
  shiftCode: string | null;
  rfMode: 'DESKTOP' | 'MOBILE' | 'TERMINAL';
  scannerDeviceReference: string | null;
  metadata: unknown;
  updatedAt: string | null;
  availableWarehouses: WorkContextWarehouse[];
}

export interface UpdateWorkContextInput {
  warehouseId: string;
  zone?: string | null;
  shiftCode?: string | null;
  rfMode?: 'DESKTOP' | 'MOBILE' | 'TERMINAL';
  scannerDeviceReference?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function login(input: LoginInput) {
  const result = await apiRequest<LoginResponse, LoginInput>('/auth/login', {
    method: 'POST',
    body: input,
  });
  if (result.accessToken) saveTokens(result);
  return result;
}

export async function changePassword(input: ChangePasswordInput) {
  return apiRequest<{ changed: true }, ChangePasswordInput>('/auth/me/password', {
    method: 'POST',
    body: input,
  });
}

export async function getMfaStatus() {
  return apiRequest<MfaStatusResponse>('/auth/me/mfa');
}

export async function startMfaSetup() {
  return apiRequest<MfaSetupResponse>('/auth/me/mfa/setup', {
    method: 'POST',
  });
}

export async function verifyMfaSetup(input: VerifyMfaInput) {
  return apiRequest<MfaStatusResponse, VerifyMfaInput>('/auth/me/mfa/verify', {
    method: 'POST',
    body: input,
  });
}

export async function disableMfa(input: VerifyMfaInput) {
  return apiRequest<MfaStatusResponse, VerifyMfaInput>('/auth/me/mfa/disable', {
    method: 'POST',
    body: input,
  });
}

export async function getWorkContext() {
  return apiRequest<WorkContextResponse>('/auth/me/work-context');
}

export async function updateWorkContext(input: UpdateWorkContextInput) {
  return apiRequest<WorkContextResponse, UpdateWorkContextInput>('/auth/me/work-context', {
    method: 'PUT',
    body: input,
  });
}

export async function logout() {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();

  try {
    if (refreshToken) {
      const revoked = accessToken ? await revokeRefreshToken(accessToken, refreshToken) : false;

      if (!revoked) {
        const rotated = await refreshForLogout(refreshToken);
        if (rotated?.accessToken && rotated.refreshToken) {
          await revokeRefreshToken(rotated.accessToken, rotated.refreshToken);
        }
      }
    }
  } catch {
    // Local logout must still finish even if the network is already gone.
  } finally {
    clearTokens();
  }
}

function joinApiPath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${config.apiBaseUrl}${normalized}`;
}

function createRequestId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `ui-${Date.now().toString(36)}-${random}`;
}

function unwrapPayload<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload && 'meta' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

async function readPayload<T>(response: Response): Promise<T | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return unwrapPayload<T>(JSON.parse(text));
  } catch {
    return null;
  }
}

async function revokeRefreshToken(accessToken: string, refreshToken: string): Promise<boolean> {
  const response = await fetch(joinApiPath('/auth/revoke'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Request-ID': createRequestId(),
    },
    body: JSON.stringify({ refreshToken }),
  });

  return response.ok;
}

async function refreshForLogout(refreshToken: string): Promise<LoginResponse | null> {
  const response = await fetch(joinApiPath('/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': createRequestId(),
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) return null;
  return readPayload<LoginResponse>(response);
}
