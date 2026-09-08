import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { hash } from 'argon2';

import { assertStrongPassword } from '../auth/password-policy';
import { PrismaService } from '../database';
import { Prisma, UserStatus } from '../generated/prisma/client';
import { AuthenticatedUser } from '../access-control/types';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { CreateUserDto, UserRoleCode } from './dto/create-user.dto';
import { UserResponse } from './users.types';

const userWithAccessInclude = {
  roles: {
    include: {
      warehouse: true,
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
  clientAccess: {
    include: {
      client: true,
      warehouse: true,
    },
  },
} satisfies Prisma.UserInclude;

export type UserWithAccess = Prisma.UserGetPayload<{
  include: typeof userWithAccessInclude;
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(actor?: AuthenticatedUser): Promise<UserResponse[]> {
    const scope = this.resolveUserReadScope(actor);
    const users = await this.prisma.user.findMany({
      where: this.buildUserReadWhere(scope),
      include: userWithAccessInclude,
      orderBy: { createdAt: 'desc' },
    });

    return users
      .filter((user: UserWithAccess) => this.canReadUser(user, scope))
      .map((user: UserWithAccess) => this.toUserResponse(user, scope));
  }

  async findById(id: string, actor?: AuthenticatedUser): Promise<UserResponse> {
    const scope = this.resolveUserReadScope(actor);
    const user = await this.findUserWithAccessById(id);

    if (!user || !this.canReadUser(user, scope)) {
      throw new NotFoundException('User was not found');
    }

    return this.toUserResponse(user, scope);
  }

  async findUserWithAccessById(id: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: userWithAccessInclude,
    });
  }

  async findUserWithAccessByEmail(email: string): Promise<UserWithAccess | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: userWithAccessInclude,
    });
  }

  async createUser(dto: CreateUserDto, actor?: AuthenticatedUser): Promise<UserResponse> {
    assertStrongPassword(dto.password);
    const roleCode = dto.roleCode?.trim().toUpperCase();
    const warehouseCode = dto.warehouseCode?.trim().toUpperCase();

    if (!roleCode || !warehouseCode) {
      throw new BadRequestException('Role and warehouse are required when creating a user');
    }

    if (!actor) {
      throw new BadRequestException('Authenticated actor is required to create a user');
    }

    this.assertCanManageTargetRole(actor, roleCode as UserRoleCode, warehouseCode);

    const [role, warehouse] = await Promise.all([
      this.prisma.role.findUnique({ where: { code: roleCode } }),
      this.prisma.warehouse.findUnique({ where: { code: warehouseCode } }),
    ]);

    if (!role) {
      throw new NotFoundException('Role was not found');
    }

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalizeEmail(dto.email),
          displayName: dto.displayName.trim(),
          passwordHash: await hash(dto.password),
          status: UserStatus.ACTIVE,
        },
        include: userWithAccessInclude,
      });

      return this.assignRoleToUser(user.id, { roleCode: roleCode as UserRoleCode, warehouseCode }, actor);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('User email already exists');
      }

      throw error;
    }
  }

  async assignRoleToUser(
    userId: string,
    dto: AssignUserRoleDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User was not found');
    }

    const role = await this.prisma.role.findUnique({
      where: { code: dto.roleCode.trim().toUpperCase() },
    });

    if (!role) {
      throw new NotFoundException('Role was not found');
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { code: dto.warehouseCode.trim().toUpperCase() },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse was not found');
    }

    this.assertCanManageTargetRole(actor, role.code as UserRoleCode, warehouse.code);

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId_warehouseId: {
          userId,
          roleId: role.id,
          warehouseId: warehouse.id,
        },
      },
      update: {},
      create: {
        userId,
        roleId: role.id,
        warehouseId: warehouse.id,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId: warehouse.id,
        action: 'user.role_assigned',
        resourceType: 'user',
        resourceId: userId,
        metadata: {
          roleCode: role.code,
          warehouseCode: warehouse.code,
        },
      },
    });
    await this.invalidateUserSecuritySessions(userId, actor, 'user.role_assigned', {
      roleCode: role.code,
      warehouseCode: warehouse.code,
    });

    return this.findById(userId, actor);
  }

  async touchLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  toAuthenticatedUser(user: UserWithAccess): AuthenticatedUser {
    const warehouseAccess = new Map<
      string,
      {
        warehouseId: string;
        warehouseCode: string;
        warehouseName: string;
        roleCodes: Set<string>;
        permissionCodes: Set<string>;
      }
    >();

    for (const assignment of user.roles) {
      const existing = warehouseAccess.get(assignment.warehouse.id) ?? {
        warehouseId: assignment.warehouse.id,
        warehouseCode: assignment.warehouse.code,
        warehouseName: assignment.warehouse.name,
        roleCodes: new Set<string>(),
        permissionCodes: new Set<string>(),
      };

      existing.roleCodes.add(assignment.role.code);

      for (const rolePermission of assignment.role.permissions) {
        existing.permissionCodes.add(rolePermission.permission.code);
      }

      warehouseAccess.set(assignment.warehouse.id, existing);
    }

    const warehouses = [...warehouseAccess.values()].map((warehouse) => ({
      warehouseId: warehouse.warehouseId,
      warehouseCode: warehouse.warehouseCode,
      warehouseName: warehouse.warehouseName,
      roleCodes: [...warehouse.roleCodes].sort(),
      permissionCodes: [...warehouse.permissionCodes].sort(),
    }));

    const clientAccess = (user.clientAccess ?? []).map((access: UserClientAccessRecord) => ({
      clientId: access.client.id,
      clientCode: access.client.code,
      clientName: access.client.name,
      warehouseId: access.warehouse?.id ?? null,
      warehouseCode: access.warehouse?.code ?? null,
      isActive: access.isActive,
    }));

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      permissions: [
        ...new Set(warehouses.flatMap((warehouse) => warehouse.permissionCodes)),
      ].sort(),
      warehouses,
      clientAccess,
    };
  }

  private toUserResponse(user: UserWithAccess, scope?: UserReadScope): UserResponse {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      roles: (user.roles as UserRoleAssignmentRecord[])
        .filter((assignment) => this.scopeIncludesWarehouse(scope, assignment.warehouse))
        .map((assignment) => ({
          roleCode: assignment.role.code,
          roleName: assignment.role.name,
          warehouseId: assignment.warehouse.id,
          warehouseCode: assignment.warehouse.code,
          warehouseName: assignment.warehouse.name,
          permissionCodes: assignment.role.permissions
            .map((rolePermission: UserRolePermissionRecord) => rolePermission.permission.code)
            .sort(),
        })),
    };
  }

  private resolveUserReadScope(actor?: AuthenticatedUser): UserReadScope {
    if (!actor) {
      throw new BadRequestException('Authenticated actor is required to read users');
    }

    const isSystemAdmin = this.isSystemAdmin(actor);

    if (isSystemAdmin) {
      return {
        isSystemAdmin: true,
        warehouseIds: new Set<string>(),
        warehouseCodes: new Set<string>(),
      };
    }

    const readableWarehouses = actor.warehouses.filter(
      (warehouse) =>
        warehouse.permissionCodes.includes('user.read') ||
        warehouse.permissionCodes.includes('user.manage'),
    );

    if (readableWarehouses.length === 0) {
      throw new ForbiddenException('You are not allowed to read users');
    }

    return {
      isSystemAdmin: false,
      warehouseIds: new Set(readableWarehouses.map((warehouse) => warehouse.warehouseId)),
      warehouseCodes: new Set(readableWarehouses.map((warehouse) => warehouse.warehouseCode)),
    };
  }

  private buildUserReadWhere(scope: UserReadScope): Prisma.UserWhereInput | undefined {
    if (scope.isSystemAdmin) return undefined;

    return {
      roles: {
        some: {
          OR: [
            { warehouseId: { in: [...scope.warehouseIds] } },
            { warehouse: { code: { in: [...scope.warehouseCodes] } } },
          ],
        },
      },
    };
  }

  private canReadUser(user: UserWithAccess, scope: UserReadScope): boolean {
    if (scope.isSystemAdmin) return true;
    return (user.roles as UserRoleAssignmentRecord[]).some((assignment) =>
      this.scopeIncludesWarehouse(scope, assignment.warehouse),
    );
  }

  private scopeIncludesWarehouse(
    scope: UserReadScope | undefined,
    warehouse: { id: string; code: string },
  ): boolean {
    if (!scope || scope.isSystemAdmin) return true;
    return scope.warehouseIds.has(warehouse.id) || scope.warehouseCodes.has(warehouse.code);
  }

  private assertCanManageTargetRole(
    actor: AuthenticatedUser,
    targetRoleCode: UserRoleCode,
    targetWarehouseCode: string,
  ): void {
    void targetRoleCode;
    void targetWarehouseCode;

    if (this.isSystemAdmin(actor)) {
      return;
    }

    throw new ForbiddenException('You are not allowed to create or assign this role');
  }

  private isSystemAdmin(actor: AuthenticatedUser): boolean {
    return actor.permissions.includes('*') || actor.warehouses.some((warehouse) => warehouse.roleCodes.includes('WMS_ADMIN'));
  }

  private async invalidateUserSecuritySessions(
    userId: string,
    actor: AuthenticatedUser,
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx: unknown) => {
      const client = tx as PrismaRawClient;
      await client.$executeRawUnsafe(
        `UPDATE users SET session_version = session_version + 1, updated_at = NOW() WHERE id = $1::uuid`,
        userId,
      );
      await client.$executeRawUnsafe(
        `UPDATE refresh_token_sessions SET status = 'REVOKED', revoked_at = NOW(), updated_at = NOW() WHERE user_id = $1::uuid AND status = 'ACTIVE'`,
        userId,
      );
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId: null,
        action: 'user.security_sessions_invalidated',
        resourceType: 'user',
        resourceId: userId,
        metadata: {
          reason,
          sessionsInvalidated: true,
          ...metadata,
        },
      },
    });
  }
}

interface UserReadScope {
  isSystemAdmin: boolean;
  warehouseIds: Set<string>;
  warehouseCodes: Set<string>;
}

interface UserRolePermissionRecord {
  permission: {
    code: string;
  };
}

interface UserRoleAssignmentRecord {
  role: {
    code: string;
    name: string;
    permissions: UserRolePermissionRecord[];
  };
  warehouse: {
    id: string;
    code: string;
    name: string;
  };
}


interface UserClientAccessRecord {
  isActive: boolean;
  client: {
    id: string;
    code: string;
    name: string;
  };
  warehouse?: {
    id: string;
    code: string;
  } | null;
}

interface PrismaRawClient {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
