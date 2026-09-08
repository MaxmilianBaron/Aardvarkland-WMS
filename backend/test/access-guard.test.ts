import assert from 'node:assert/strict';
import test from 'node:test';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { REQUIRED_PERMISSIONS_KEY, REQUIRED_WAREHOUSE_PERMISSIONS_KEY } from '../src/access-control/access-control.constants';
import { AccessGuard } from '../src/access-control/guards/access.guard';
import { AuthenticatedUser } from '../src/access-control/types';

test('access guard blocks manual warehouseId changes outside the actor warehouse', () => {
  const guard = createAccessGuard(['inventory.read']);
  const context = createHttpContext({
    user: actor(),
    params: {},
    query: {},
    body: { warehouseId: 'OTHER', ownerClientId: 'CLIENT-A' },
    headers: {},
  });

  assert.throws(() => guard.canActivate(context), ForbiddenException);
});

test('access guard blocks privileged protected routes without satisfied MFA in block mode', () => {
  const guard = createAccessGuard(undefined, ['user.manage'], 'block');
  const context = createHttpContext({
    user: admin(),
    auth: {
      mfaRequired: true,
      mfaEnrolled: false,
      mfaSatisfied: false,
      mfaEnrollmentRequired: true,
      authTime: null,
      tokenIssuedAt: new Date().toISOString(),
    },
    method: 'POST',
    originalUrl: '/api/users',
    headers: {},
  });

  assert.throws(() => guard.canActivate(context), ForbiddenException);
});

test('access guard leaves privileged MFA enforcement in warn mode non-blocking', () => {
  const guard = createAccessGuard(undefined, ['user.manage'], 'warn');
  const context = createHttpContext({
    user: admin(),
    auth: {
      mfaRequired: true,
      mfaEnrolled: false,
      mfaSatisfied: false,
      mfaEnrollmentRequired: true,
      authTime: null,
      tokenIssuedAt: new Date().toISOString(),
    },
    method: 'POST',
    originalUrl: '/api/users',
    headers: {},
  });

  assert.equal(guard.canActivate(context), true);
});

test('access guard blocks BOLA client scope changes inside restricted warehouse access', () => {
  const guard = createAccessGuard(['inventory.read']);
  const context = createHttpContext({
    user: actor(),
    params: { warehouseId: 'MAIN' },
    query: {},
    body: { ownerClientId: 'CLIENT-B' },
    headers: {},
  });

  assert.throws(() => guard.canActivate(context), ForbiddenException);
});

test('access guard accepts the actor warehouse and assigned client scope', () => {
  const guard = createAccessGuard(['inventory.read']);
  const context = createHttpContext({
    user: actor(),
    params: { warehouseId: 'MAIN' },
    query: { ownerClientReference: 'CLIENT-A' },
    body: {},
    headers: {},
  });

  assert.equal(guard.canActivate(context), true);
});

test('access guard separates operational moves from stock adjustments', () => {
  const moveGuard = createAccessGuard(['inventory.move']);
  const adjustGuard = createAccessGuard(['inventory.adjust']);
  const request = {
    user: actor(['inventory.read', 'inventory.move']),
    params: { warehouseId: 'MAIN' },
    query: {},
    body: { ownerClientId: 'CLIENT-A' },
    headers: {},
  };

  assert.equal(moveGuard.canActivate(createHttpContext(request)), true);
  assert.throws(() => adjustGuard.canActivate(createHttpContext(request)), ForbiddenException);
});

function createAccessGuard(
  warehousePermissions?: string[],
  requiredPermissions?: string[],
  mfaEnforcement: 'warn' | 'block' = 'warn',
): AccessGuard {
  return new AccessGuard({
    getAllAndOverride: (key: string) => {
      if (key === REQUIRED_PERMISSIONS_KEY) return requiredPermissions;
      if (key === REQUIRED_WAREHOUSE_PERMISSIONS_KEY) return warehousePermissions;
      return undefined;
    },
  } as never, {
    get: (key: string) => {
      if (key === 'PRIVILEGED_MFA_ENFORCEMENT') return mfaEnforcement;
      return undefined;
    },
  } as never);
}

function createHttpContext(request: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => createHttpContext,
    getClass: () => AccessGuard,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function actor(permissionCodes: string[] = ['inventory.read']): AuthenticatedUser {
  return {
    id: 'actor-1',
    email: 'actor@example.com',
    displayName: 'Actor',
    status: 'ACTIVE',
    permissions: [],
    warehouses: [
      {
        warehouseId: 'WH-1',
        warehouseCode: 'MAIN',
        warehouseName: 'Main',
        roleCodes: ['WAREHOUSE_WORKER'],
        permissionCodes,
      },
    ],
    clientAccess: [
      {
        clientId: 'CLIENT-A-ID',
        clientCode: 'CLIENT-A',
        clientName: 'Client A',
        warehouseId: 'WH-1',
        warehouseCode: 'MAIN',
        isActive: true,
      },
    ],
  };
}

function admin(): AuthenticatedUser {
  return {
    id: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'ACTIVE',
    permissions: ['*'],
    warehouses: [],
    clientAccess: [],
  };
}
