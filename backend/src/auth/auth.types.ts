import { AuthenticatedSessionContext, AuthenticatedUser } from '../access-control/types';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  sessionVersion?: number;
  mfaEnrolled?: boolean;
  mfaSatisfied?: boolean;
  authTime?: number;
  iat?: number;
}

export interface AccessTokenVerificationResult {
  user: AuthenticatedUser;
  auth: AuthenticatedSessionContext;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  mfaRequired: boolean;
  mfaSatisfied: boolean;
  mfaEnrollmentRequired: boolean;
  user: AuthenticatedUser;
}

export interface AuthRequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface MfaStatusResponse {
  enabled: boolean;
  verifiedAt: Date | null;
}

export interface MfaSetupResponse {
  secret: string;
  otpAuthUri: string;
  issuer: string;
  accountName: string;
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
