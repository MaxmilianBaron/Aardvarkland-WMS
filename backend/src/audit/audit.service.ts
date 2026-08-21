import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { PrismaService } from '../database';
import { Prisma } from '../generated/prisma/client';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import {
  AuditExportResponse,
  AuditHashManifestEntry,
  AuditHashManifestResponse,
  AuditLogResponse,
  AuditWriteInput,
} from './audit.types';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async listLogs(query: ListAuditLogsQueryDto): Promise<AuditLogResponse[]> {
    const where = buildWhere(query);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: normalizeLimit(query.limit),
      include: {
        actor: { select: { id: true, displayName: true, email: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      actorUserId: row.actorUserId,
      actorDisplayName: row.actor?.displayName ?? null,
      actorEmail: row.actor?.email ?? null,
      warehouseId: row.warehouseId,
      warehouseCode: row.warehouse?.code ?? null,
      warehouseName: row.warehouse?.name ?? null,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));
  }

  async exportLogs(query: ListAuditLogsQueryDto): Promise<AuditExportResponse> {
    const entries = await this.listLogs(query);
    const manifest = this.buildHashManifest(entries);

    return {
      generatedAt: new Date().toISOString(),
      count: entries.length,
      sha256: manifest.sha256,
      entries,
      manifest,
    };
  }

  async getHashManifest(query: ListAuditLogsQueryDto): Promise<AuditHashManifestResponse> {
    return this.buildHashManifest(await this.listLogs(query));
  }

  async writeAction(input: AuditWriteInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId ?? null,
        warehouseId: input.warehouseId ?? null,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  private buildHashManifest(entries: AuditLogResponse[]): AuditHashManifestResponse {
    let chainHash = '0'.repeat(64);
    const manifestEntries: AuditHashManifestEntry[] = [];
    const orderedEntries = [...entries].sort((left, right) =>
      left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id),
    );

    for (const entry of orderedEntries) {
      const rowHash = sha256(canonicalizeAuditLog(entry));
      chainHash = sha256(`${chainHash}:${rowHash}`);
      manifestEntries.push({
        id: entry.id,
        createdAt: entry.createdAt.toISOString(),
        rowHash,
        chainHash,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      count: orderedEntries.length,
      sha256: chainHash,
      firstCreatedAt: orderedEntries[0]?.createdAt.toISOString() ?? null,
      lastCreatedAt: orderedEntries.at(-1)?.createdAt.toISOString() ?? null,
      entries: manifestEntries,
    };
  }
}

function normalizeLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 100;
  }
  return Math.max(1, Math.min(500, Math.trunc(value)));
}

function buildWhere(query: ListAuditLogsQueryDto): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (query.warehouseId) where.warehouseId = query.warehouseId;
  if (query.actorUserId) where.actorUserId = query.actorUserId;
  if (query.action) where.action = query.action.trim();
  if (query.resourceType) where.resourceType = query.resourceType.trim();
  if (query.createdFrom || query.createdTo) {
    where.createdAt = {
      ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
      ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
    };
  }

  return where;
}

function canonicalizeAuditLog(entry: AuditLogResponse): string {
  return JSON.stringify({
    id: entry.id,
    actorUserId: entry.actorUserId,
    warehouseId: entry.warehouseId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    metadata: normalizeJson(entry.metadata),
    createdAt: entry.createdAt.toISOString(),
  });
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeJson);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nestedValue]) => [key, normalizeJson(nestedValue)]),
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
