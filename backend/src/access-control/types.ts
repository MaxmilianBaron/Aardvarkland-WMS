export interface AuthenticatedClientAccess {
  clientId: string;
  clientCode: string;
  clientName: string;
  warehouseId: string | null;
  warehouseCode: string | null;
  isActive: boolean;
}

export interface AuthenticatedWarehouseAccess {
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  roleCodes: string[];
  permissionCodes: string[];
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  permissions: string[];
  warehouses: AuthenticatedWarehouseAccess[];
  clientAccess: AuthenticatedClientAccess[];
}

export interface AuthenticatedSessionContext {
  mfaRequired: boolean;
  mfaEnrolled: boolean;
  mfaSatisfied: boolean;
  mfaEnrollmentRequired: boolean;
  authTime: string | null;
  tokenIssuedAt: string | null;
}
