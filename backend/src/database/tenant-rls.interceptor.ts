import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

import { AuthenticatedUser } from '../access-control';
import { PrismaService } from './prisma.service';
import { TenantRlsContext } from './tenant-rls.helpers';

export interface TenantRlsRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  ip?: string;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
  user?: AuthenticatedUser;
}

@Injectable()
export class TenantRlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<TenantRlsRequest>();
    const tenantContext = buildTenantContext(request);

    if (tenantContext.disabled) {
      void this.auditTenantRlsBypass(request, tenantContext);
    }

    return new Observable((subscriber) =>
      this.prisma.runWithTenantContext(tenantContext, () =>
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        }),
      ),
    );
  }

  private async auditTenantRlsBypass(
    request: TenantRlsRequest,
    tenantContext: TenantRlsContext,
  ): Promise<void> {
    try {
      await (this.prisma as unknown as TenantRlsAuditPrismaClient).auditLog.create({
        data: {
          actorUserId: request.user?.id ?? null,
          warehouseId: tenantContext.warehouseId && tenantContext.warehouseId !== '*' ? tenantContext.warehouseId : null,
          action: 'tenant.rls_bypass_used',
          resourceType: 'tenant_rls_context',
          resourceId: tenantContext.warehouseId ?? tenantContext.clientId ?? null,
          metadata: {
            clientId: tenantContext.clientId,
            warehouseId: tenantContext.warehouseId,
            requestId: readHeaderValue(request.headers, 'x-request-id') ?? null,
            method: request.method ?? null,
            path: request.originalUrl ?? request.url ?? null,
            ip: request.ip ?? null,
          },
        },
      });
    } catch {
      return;
    }
  }

}

export function buildTenantContext(request: TenantRlsRequest): TenantRlsContext {
  const explicitClient = getExplicitClientReference(request);
  const explicitWarehouse = getExplicitWarehouseReference(request);
  const activeClientAccess = (request.user?.clientAccess ?? []).filter((access) => access.isActive !== false);
  const activeWarehouseAccess = request.user?.warehouses ?? [];
  const explicitClientMatch = explicitClient
    ? activeClientAccess.find((access) => matchesReference(explicitClient, access.clientId, access.clientCode))
    : undefined;
  const explicitWarehouseMatch = explicitWarehouse
    ? activeWarehouseAccess.find((access) => matchesReference(explicitWarehouse, access.warehouseId, access.warehouseCode))
    : undefined;

  if (explicitClient && activeClientAccess.length > 0 && !explicitClientMatch) {
    throw new ForbiddenException('User does not have access to the requested tenant client scope.');
  }

  if (explicitWarehouse && activeWarehouseAccess.length > 0 && !explicitWarehouseMatch) {
    throw new ForbiddenException('User does not have access to the requested tenant warehouse scope.');
  }

  const warehouseId = explicitWarehouseMatch?.warehouseId ?? (!explicitWarehouse && activeWarehouseAccess.length === 1 ? activeWarehouseAccess[0]?.warehouseId ?? null : null);
  const clientId = resolveTenantClientContext({
    activeClientAccess,
    explicitClient: Boolean(explicitClient),
    explicitClientId: explicitClientMatch?.clientId,
    warehouseId,
  });

  return {
    clientId,
    warehouseId,
    disabled: shouldDisableTenantRls(request),
  };
}

function resolveTenantClientContext(input: {
  activeClientAccess: Array<{ clientId: string }>;
  explicitClient: boolean;
  explicitClientId?: string;
  warehouseId?: string | null;
}): string | null {
  if (input.explicitClientId) {
    return input.explicitClientId;
  }

  if (!input.explicitClient && input.activeClientAccess.length === 1) {
    return input.activeClientAccess[0]?.clientId ?? null;
  }

  if (input.activeClientAccess.length === 0 && input.warehouseId) {
    return '*';
  }

  return null;
}

function shouldDisableTenantRls(request: TenantRlsRequest): boolean {
  const disabledHeader = readHeaderValue(request.headers, 'x-disable-tenant-rls');
  if (disabledHeader !== '1' && disabledHeader?.toLowerCase() !== 'true') {
    return false;
  }

  const hasPrivilegedPermission = request.user?.permissions.includes('tenant.rls.disable') === true;
  const hasRestrictedClientAccess = (request.user?.clientAccess ?? []).some((access) => access.isActive !== false);

  return hasPrivilegedPermission && !hasRestrictedClientAccess;
}

function getExplicitClientReference(request: TenantRlsRequest): string | undefined {
  return (
    readHeaderValue(request.headers, 'x-client-id') ??
    readHeaderValue(request.headers, 'x-owner-client-id') ??
    readHeaderValue(request.headers, 'x-client-reference') ??
    readHeaderValue(request.headers, 'x-client-code') ??
    readStringRecordValue(request.params, 'clientReference') ??
    readStringRecordValue(request.params, 'clientId') ??
    readStringRecordValue(request.params, 'ownerClientId') ??
    readStringRecordValue(request.query, 'ownerClientReference') ??
    readStringRecordValue(request.query, 'ownerClientId') ??
    readStringRecordValue(request.query, 'clientReference') ??
    readStringRecordValue(request.query, 'clientId') ??
    readStringRecordValue(request.query, 'clientCode') ??
    readBodyStringValue(request.body, 'ownerClientReference') ??
    readBodyStringValue(request.body, 'ownerClientId') ??
    readBodyStringValue(request.body, 'clientReference') ??
    readBodyStringValue(request.body, 'clientId') ??
    readBodyStringValue(request.body, 'clientCode')
  );
}

function getExplicitWarehouseReference(request: TenantRlsRequest): string | undefined {
  return (
    readHeaderValue(request.headers, 'x-warehouse-id') ??
    readHeaderValue(request.headers, 'x-warehouse-code') ??
    readStringRecordValue(request.params, 'warehouseId') ??
    readStringRecordValue(request.params, 'warehouseCode') ??
    readStringRecordValue(request.query, 'warehouseId') ??
    readStringRecordValue(request.query, 'warehouseCode') ??
    readBodyStringValue(request.body, 'warehouseId') ??
    readBodyStringValue(request.body, 'warehouseCode')
  );
}

function matchesReference(reference: string, id: string | null | undefined, code: string | null | undefined): boolean {
  const normalized = reference.trim().toUpperCase();
  return normalized === id?.trim().toUpperCase() || normalized === code?.trim().toUpperCase();
}

function readStringRecordValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readBodyStringValue(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object' || !(key in body)) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readHeaderValue(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const value = headers[key];
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized && normalized.trim().length > 0 ? normalized.trim() : undefined;
}


interface TenantRlsAuditPrismaClient {
  auditLog: {
    create(args: {
      data: {
        actorUserId: string | null;
        warehouseId: string | null;
        action: string;
        resourceType: string;
        resourceId: string | null;
        metadata: Record<string, unknown>;
      };
    }): Promise<unknown>;
  };
}
