import { UserStatus } from '../generated/prisma/client';

export interface UserRoleAssignmentResponse {
  roleCode: string;
  roleName: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  permissionCodes: string[];
}

export interface UserResponse {
  id: string;
  email: string;
  displayName: string;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: UserRoleAssignmentResponse[];
}
