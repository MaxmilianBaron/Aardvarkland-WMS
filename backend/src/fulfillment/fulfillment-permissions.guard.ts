import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AuthenticatedRequest } from '../access-control/authenticated-request';
import {
  getClientReferenceFromRequest,
  hasClientAccess,
  isClientScopedWarehousePermission,
  shouldEnforceClientAccess,
} from '../access-control/client-access.helpers';

export const FULFILLMENT_PERMISSIONS_KEY = 'fulfillment:warehouse-permissions';

export const RequireAnyFulfillmentPermission = (...permissions: string[]) =>
  SetMetadata(FULFILLMENT_PERMISSIONS_KEY, permissions);

@Injectable()
export class FulfillmentPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<string[]>(FULFILLMENT_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permissions?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authenticated user context is missing');
    }

    const warehouseReference = request.params?.['warehouseId'];

    if (!warehouseReference) {
      throw new ForbiddenException('Warehouse context is required');
    }

    const warehouseAccess = user.warehouses.find(
      (warehouse) =>
        warehouse.warehouseId === warehouseReference ||
        warehouse.warehouseCode === warehouseReference,
    );

    if (!warehouseAccess || !hasAnyPermission(warehouseAccess.permissionCodes, permissions)) {
      throw new ForbiddenException('Missing required warehouse permission');
    }

    this.assertProvidedClientScopeIsAllowed(user, request, warehouseReference, permissions);

    return true;
  }

  private assertProvidedClientScopeIsAllowed(
    user: NonNullable<AuthenticatedRequest['user']>,
    request: AuthenticatedRequest,
    warehouseReference: string,
    permissions: string[],
  ): void {
    if (!shouldEnforceClientAccess(user) || !isClientScopedWarehousePermission(permissions)) {
      return;
    }

    const clientReference = getClientReferenceFromRequest(request);
    if (!clientReference) {
      throw new ForbiddenException('Client scope is required for restricted fulfillment users.');
    }

    if (!hasClientAccess({ user, clientReference, warehouseReference })) {
      throw new ForbiddenException('User does not have access to the requested client scope.');
    }
  }
}

function hasAnyPermission(availablePermissions: string[], requiredPermissions: string[]): boolean {
  const available = new Set(availablePermissions);

  return requiredPermissions.some((permission) => available.has(permission));
}
