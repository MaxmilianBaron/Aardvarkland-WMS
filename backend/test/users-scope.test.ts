import assert from 'node:assert/strict';
import test from 'node:test';

import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AuthenticatedUser } from '../src/access-control/types';
import { PrismaService } from '../src/database';
import { UserStatus } from '../src/generated/prisma/client';
import { UsersService, UserWithAccess } from '../src/users/users.service';

const now = new Date('2026-01-01T00:00:00.000Z');

interface TestWarehouse {
  id: string;
  code: string;
  name: string;
}

const warehouseMain: TestWarehouse = { id: 'warehouse-main', code: 'MAIN', name: 'Main warehouse' };
const warehouseOther: TestWarehouse = { id: 'warehouse-other', code: 'OTHER', name: 'Other warehouse' };

const users = [
  userRecord('worker-main', 'worker@example.com', 'Worker Main', [
    assignment('WAREHOUSE_WORKER', 'Warehouse worker', warehouseMain, ['task.read']),
  ]),
  userRecord('manager-main', 'manager@example.com', 'Manager Main', [
    assignment('WAREHOUSE_MANAGER', 'Warehouse manager', warehouseMain, ['user.read', 'user.manage']),
  ]),
  userRecord('manager-other', 'other@example.com', 'Manager Other', [
    assignment('WAREHOUSE_MANAGER', 'Warehouse manager', warehouseOther, ['user.read', 'user.manage']),
  ]),
  userRecord('cross-warehouse', 'cross@example.com', 'Cross Warehouse', [
    assignment('WAREHOUSE_WORKER', 'Warehouse worker', warehouseMain, ['task.read']),
    assignment('WMS_ADMIN', 'System admin', warehouseOther, ['*']),
  ]),
] as unknown as UserWithAccess[];

test('warehouse manager users API is scoped to readable warehouses', async () => {
  const service = createUsersService(users);

  const result = await service.findMany(managerActor());

  assert.deepEqual(
    result.map((user) => user.email).sort(),
    ['cross@example.com', 'manager@example.com', 'worker@example.com'],
  );

  const crossWarehouseUser = result.find((user) => user.email === 'cross@example.com');
  assert.deepEqual(crossWarehouseUser?.roles.map((role) => role.warehouseCode), ['MAIN']);
  assert.equal(crossWarehouseUser?.roles.some((role) => role.roleCode === 'WMS_ADMIN'), false);
});

test('system admin users API can read every warehouse assignment', async () => {
  const service = createUsersService(users);

  const result = await service.findMany(adminActor());

  assert.equal(result.length, 4);

  const crossWarehouseUser = result.find((user) => user.email === 'cross@example.com');
  assert.deepEqual(
    crossWarehouseUser?.roles.map((role) => `${role.warehouseCode}:${role.roleCode}`).sort(),
    ['MAIN:WAREHOUSE_WORKER', 'OTHER:WMS_ADMIN'],
  );
});

test('warehouse worker cannot read users through the users service', async () => {
  const service = createUsersService(users);

  await assert.rejects(
    () => service.findMany(workerActor()),
    (error) => error instanceof ForbiddenException,
  );
});

test('warehouse manager cannot read a user that only belongs to another warehouse', async () => {
  const service = createUsersService(users);

  await assert.rejects(
    () => service.findById('manager-other', managerActor()),
    (error) => error instanceof NotFoundException,
  );
});

test('warehouse manager cannot create or assign any user role', () => {
  const service = createUsersService(users);
  const assertCanManageTargetRole = getRoleManagementGuard(service);

  for (const roleCode of ['WAREHOUSE_WORKER', 'WAREHOUSE_MANAGER', 'WMS_ADMIN'] as const) {
    assert.throws(
      () => assertCanManageTargetRole(managerActor(), roleCode, 'MAIN'),
      (error) => error instanceof ForbiddenException,
    );
  }
});

test('system admin can create all supported user roles', () => {
  const service = createUsersService(users);
  const assertCanManageTargetRole = getRoleManagementGuard(service);

  for (const roleCode of ['WAREHOUSE_WORKER', 'WAREHOUSE_MANAGER', 'WMS_ADMIN'] as const) {
    assert.doesNotThrow(() => assertCanManageTargetRole(adminActor(), roleCode, 'MAIN'));
  }
});

function createUsersService(records: UserWithAccess[]): UsersService {
  const prisma = {
    user: {
      findMany: async () => records,
      findUnique: async ({ where }: { where: { id: string } }) =>
        records.find((record) => record.id === where.id) ?? null,
    },
  };

  return new UsersService(prisma as unknown as PrismaService);
}

function getRoleManagementGuard(service: UsersService) {
  return (service as unknown as {
    assertCanManageTargetRole: (
      actor: AuthenticatedUser,
      roleCode: 'WAREHOUSE_WORKER' | 'WAREHOUSE_MANAGER' | 'WMS_ADMIN',
      warehouseCode: string,
    ) => void;
  }).assertCanManageTargetRole.bind(service);
}

function userRecord(id: string, email: string, displayName: string, roles: unknown[]): UserWithAccess {
  return {
    id,
    email,
    displayName,
    passwordHash: 'not-used-in-this-test',
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    roles,
    clientAccess: [],
  } as unknown as UserWithAccess;
}

function assignment(
  roleCode: string,
  roleName: string,
  warehouse: TestWarehouse,
  permissions: string[],
) {
  return {
    role: {
      code: roleCode,
      name: roleName,
      permissions: permissions.map((code) => ({ permission: { code } })),
    },
    warehouse,
  };
}

function actor(
  roleCodes: string[],
  permissionCodes: string[],
  warehouse = warehouseMain,
): AuthenticatedUser {
  return {
    id: `actor-${roleCodes.join('-').toLowerCase()}`,
    email: 'actor@example.com',
    displayName: 'Actor',
    status: 'ACTIVE',
    permissions: [...new Set(permissionCodes)].sort(),
    warehouses: [
      {
        warehouseId: warehouse.id,
        warehouseCode: warehouse.code,
        warehouseName: warehouse.name,
        roleCodes,
        permissionCodes,
      },
    ],
    clientAccess: [],
  };
}

function workerActor(): AuthenticatedUser {
  return actor(['WAREHOUSE_WORKER'], ['task.read']);
}

function managerActor(): AuthenticatedUser {
  return actor(['WAREHOUSE_MANAGER'], ['user.read', 'user.manage']);
}

function adminActor(): AuthenticatedUser {
  return actor(['WMS_ADMIN'], ['*']);
}
