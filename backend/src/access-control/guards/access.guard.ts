import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { Env } from '../../config/env';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_WAREHOUSE_PERMISSIONS_KEY,
} from '../access-control.constants';
import { AuthenticatedRequest } from '../authenticated-request';
import {
  getClientReferenceFromRequest,
  hasClientAccess,
  isClientScopedWarehousePermission,
  shouldEnforceClientAccess,
} from '../client-access.helpers';
import { AuthenticatedUser } from '../types';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const requiredWarehousePermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_WAREHOUSE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length && !requiredWarehousePermissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authenticated user context is missing');
    }

    this.assertPrivilegedMfa(user, request);

    if (requiredPermissions?.length && !hasAllPermissions(user.permissions, requiredPermissions)) {
      throw new ForbiddenException('Missing required permission');
    }

    if (requiredWarehousePermissions?.length) {
      const warehouseReference = this.assertWarehousePermissions(user, request, requiredWarehousePermissions);
      this.assertClientScope(user, request, requiredWarehousePermissions, warehouseReference);
    }

    return true;
  }

  private assertPrivilegedMfa(user: AuthenticatedUser, request: AuthenticatedRequest): void {
    const auth = request.auth;
    const enforcement = this.config.get('PRIVILEGED_MFA_ENFORCEMENT', { infer: true });

    if (!auth?.mfaRequired || auth.mfaSatisfied || enforcement !== 'block' || isMfaRecoveryPath(request)) {
      return;
    }

    const code = auth.mfaEnrollmentRequired ? 'MFA_ENROLLMENT_REQUIRED' : 'MFA_REQUIRED';
    throw new ForbiddenException({
      code,
      message: auth.mfaEnrollmentRequired
        ? 'Privileged access requires MFA enrollment before this operation can continue.'
        : 'Privileged access requires a session that has passed MFA.',
      userId: user.id,
    });
  }

  private assertWarehousePermissions(
    user: AuthenticatedUser,
    request: AuthenticatedRequest,
    requiredPermissions: string[],
  ): string {
    const warehouseReference = getWarehouseReference(request);

    if (!warehouseReference) {
      throw new ForbiddenException('Warehouse context is required');
    }

    const warehouseAccess = user.warehouses.find(
      (warehouse) =>
        warehouse.warehouseId === warehouseReference ||
        warehouse.warehouseCode === warehouseReference,
    );

    if (
      !warehouseAccess ||
      !hasAllPermissions(warehouseAccess.permissionCodes, requiredPermissions)
    ) {
      throw new ForbiddenException('Missing required warehouse permission');
    }

    return warehouseReference;
  }

  private assertClientScope(
    user: AuthenticatedUser,
    request: AuthenticatedRequest,
    requiredWarehousePermissions: string[],
    warehouseReference: string,
  ): void {
    if (!shouldEnforceClientAccess(user) || !isClientScopedWarehousePermission(requiredWarehousePermissions)) {
      return;
    }

    const clientReference = getClientReferenceFromRequest(request);

    if (!clientReference) {
      throw new ForbiddenException('Client scope is required for this restricted user. Pass ownerClientReference or use a client-scoped route.');
    }

    if (!hasClientAccess({ user, clientReference, warehouseReference })) {
      throw new ForbiddenException('User does not have access to the requested client scope.');
    }
  }
}

function isMfaRecoveryPath(request: AuthenticatedRequest): boolean {
  const method = request.method?.toUpperCase() ?? 'GET';
  const url = request.originalUrl ?? request.url ?? request.path ?? '';
  if (method === 'GET' && (url.endsWith('/api/auth/me') || url.endsWith('/auth/me'))) {
    return true;
  }

  return (
    url.includes('/api/auth/me/mfa') ||
    url.includes('/auth/me/mfa') ||
    url.includes('/api/auth/logout') ||
    url.includes('/auth/logout')
  );
}

function hasAllPermissions(availablePermissions: string[], requiredPermissions: string[]): boolean {
  const available = new Set(availablePermissions);
  if (available.has('*')) {
    return true;
  }

  return requiredPermissions.every((permission) => available.has(permission));
}

function getWarehouseReference(request: AuthenticatedRequest): string | undefined {
  return (
    request.params?.['warehouseId'] ??
    request.params?.['warehouseCode'] ??
    readStringRecordValue(request.query, 'warehouseId') ??
    readStringRecordValue(request.query, 'warehouseCode') ??
    readBodyStringValue(request.body, 'warehouseId') ??
    readBodyStringValue(request.body, 'warehouseCode') ??
    readHeaderValue(request.headers, 'x-warehouse-id') ??
    readHeaderValue(request.headers, 'x-warehouse-code')
  );
}

function readStringRecordValue(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];

  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

function readBodyStringValue(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object' || !(key in body)) {
    return undefined;
  }

  const value = (body as Record<string, unknown>)[key];

  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }

  return value;
}

function readHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = headers[key];
  const normalized = Array.isArray(value) ? value[0] : value;

  if (!normalized || normalized.length === 0) {
    return undefined;
  }

  return normalized;
}
