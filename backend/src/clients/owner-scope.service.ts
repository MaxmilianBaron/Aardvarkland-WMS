import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../database';
import { mirrorOwnerClientIdToResource, OwnerClientMirrorClient } from './direct-owner-client.helpers';
import { normalizeClientCode, normalizeOptionalResourceCode } from './clients.helpers';
import {
  ClientResourceLinkRecord,
  ensureOwnedResourceLink,
  ensureOwnedResourceLinks,
  findResourceOwner,
  OwnerClientRecord,
  OwnerLinkingClient,
  readOwnerClientReference,
  resolveOperationalOwner,
  resolveOwnerClient,
} from './owner-linking.helpers';

export type { ClientResourceLinkRecord, OwnerClientRecord } from './owner-linking.helpers';

export interface OwnerScopePrismaClient extends OwnerLinkingClient {
  wmsClient: { findFirst(args: Record<string, unknown>): Promise<OwnerClientRecord | null> };
  clientWarehouse: { findFirst(args: Record<string, unknown>): Promise<{ id: string; isActive?: boolean } | null> };
  clientResourceLink: {
    findMany(args: Record<string, unknown>): Promise<Array<{ resourceId: string }>>;
    findFirst(args: Record<string, unknown>): Promise<ClientResourceLinkRecord | null>;
    create(args: Record<string, unknown>): Promise<ClientResourceLinkRecord>;
    update(args: Record<string, unknown>): Promise<ClientResourceLinkRecord>;
  };
}

@Injectable()
export class OwnerScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async findOwnedResourceIds(input: {
    warehouseId: string;
    clientReference?: string | null;
    resourceType: string;
    client?: OwnerScopePrismaClient;
  }): Promise<string[] | null> {
    if (!input.clientReference) return null;
    const client = input.client ?? this.client;
    const owner = await this.resolveClient(input.clientReference, client);
    const resourceType = normalizeOptionalResourceCode(input.resourceType);
    if (!resourceType) return [];

    const links = await client.clientResourceLink.findMany({
      where: { warehouseId: input.warehouseId, clientId: owner.id, resourceType },
      select: { resourceId: true },
    });

    return Array.from(new Set(links.map((link) => link.resourceId).filter(Boolean)));
  }

  async assertClientOwnsResource(input: {
    warehouseId: string;
    clientReference: string;
    resourceType: string;
    resourceId: string;
    client?: OwnerScopePrismaClient;
  }): Promise<void> {
    const client = input.client ?? this.client;
    const owner = await this.resolveClient(input.clientReference, client);
    const resourceType = normalizeOptionalResourceCode(input.resourceType);
    const link = await client.clientResourceLink.findFirst({
      where: {
        warehouseId: input.warehouseId,
        clientId: owner.id,
        resourceType,
        resourceId: input.resourceId,
      },
      select: { id: true },
    });

    if (!link) throw new NotFoundException('Resource is not owned by the requested client in this warehouse.');
  }

  resolveOwnerClient(input: {
    warehouseId: string;
    clientReference?: string | null;
    requireWarehouseAttachment?: boolean;
    client?: OwnerScopePrismaClient;
  }): Promise<OwnerClientRecord | null> {
    return resolveOwnerClient(input.client ?? this.client, input);
  }

  findResourceOwner(input: {
    warehouseId: string;
    resourceType: string;
    resourceId: string | null | undefined;
    client?: OwnerScopePrismaClient;
  }): Promise<OwnerClientRecord | null> {
    if (!input.resourceId) return Promise.resolve(null);
    return findResourceOwner(input.client ?? this.client, {
      warehouseId: input.warehouseId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
    });
  }

  resolveOperationalOwner(input: {
    warehouseId: string;
    ownerClientReference?: string | null;
    inheritedResourceType?: string | null;
    inheritedResourceId?: string | null;
    requireWarehouseAttachment?: boolean;
    client?: OwnerScopePrismaClient;
  }): Promise<OwnerClientRecord | null> {
    return resolveOperationalOwner(input.client ?? this.client, input);
  }

  async ensureOwnedResourceLink(input: {
    warehouseId: string;
    clientId: string;
    resourceType: string;
    resourceId: string | null | undefined;
    externalReference?: string | null;
    metadata?: Record<string, unknown> | null;
    allowOwnerTransfer?: boolean;
    client?: OwnerScopePrismaClient;
  }): Promise<ClientResourceLinkRecord | null> {
    if (!input.resourceId) return Promise.resolve(null);
    const client = input.client ?? this.client;
    const link = await ensureOwnedResourceLink(client, {
      warehouseId: input.warehouseId,
      clientId: input.clientId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      externalReference: input.externalReference,
      metadata: input.metadata,
      allowOwnerTransfer: input.allowOwnerTransfer,
    });
    await this.mirrorOwnerClientId(client, input.resourceType, input.resourceId, input.clientId);
    return link;
  }

  async ensureOwnedResourceLinks(input: {
    warehouseId: string;
    clientId: string;
    resources: Array<{ resourceType: string; resourceId: string | null | undefined; metadata?: Record<string, unknown> | null }>;
    externalReference?: string | null;
    metadata?: Record<string, unknown> | null;
    allowOwnerTransfer?: boolean;
    client?: OwnerScopePrismaClient;
  }): Promise<ClientResourceLinkRecord[]> {
    const resources = input.resources
      .filter((resource): resource is { resourceType: string; resourceId: string; metadata?: Record<string, unknown> | null } => Boolean(resource.resourceId));
    const client = input.client ?? this.client;
    const links = await ensureOwnedResourceLinks(client, {
      warehouseId: input.warehouseId,
      clientId: input.clientId,
      resources,
      externalReference: input.externalReference,
      metadata: input.metadata,
      allowOwnerTransfer: input.allowOwnerTransfer,
    });
    for (const resource of resources) {
      await this.mirrorOwnerClientId(client, resource.resourceType, resource.resourceId, input.clientId);
    }
    return links;
  }

  async linkResourceToClient(input: {
    warehouseId: string;
    clientReference?: string | null;
    resourceType: string;
    resourceId: string | null | undefined;
    externalReference?: string | null;
    metadata?: Record<string, unknown> | null;
    allowOwnerTransfer?: boolean;
    client?: OwnerScopePrismaClient;
  }): Promise<ClientResourceLinkRecord | null> {
    if (!input.clientReference || !input.resourceId) return null;
    const client = input.client ?? this.client;
    const owner = await resolveOwnerClient(client, {
      warehouseId: input.warehouseId,
      clientReference: input.clientReference,
    });
    if (!owner) return null;
    const link = await ensureOwnedResourceLink(client, {
      warehouseId: input.warehouseId,
      clientId: owner.id,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      externalReference: input.externalReference,
      metadata: input.metadata,
      allowOwnerTransfer: input.allowOwnerTransfer,
    });
    await this.mirrorOwnerClientId(client, input.resourceType, input.resourceId, owner.id);
    return link;
  }

  async linkResourceToResolvedClient(input: {
    warehouseId: string;
    clientId: string;
    resourceType: string;
    resourceId: string | null | undefined;
    externalReference?: string | null;
    metadata?: Record<string, unknown> | null;
    allowOwnerTransfer?: boolean;
    client?: OwnerScopePrismaClient;
  }): Promise<ClientResourceLinkRecord | null> {
    if (!input.resourceId) return null;
    const client = input.client ?? this.client;
    const link = await ensureOwnedResourceLink(client, {
      warehouseId: input.warehouseId,
      clientId: input.clientId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      externalReference: input.externalReference,
      metadata: input.metadata,
      allowOwnerTransfer: input.allowOwnerTransfer,
    });
    await this.mirrorOwnerClientId(client, input.resourceType, input.resourceId, input.clientId);
    return link;
  }

  async inheritOwnerFromResource(input: {
    warehouseId: string;
    sourceResourceType: string;
    sourceResourceId: string | null | undefined;
    targetResourceType: string;
    targetResourceId: string | null | undefined;
    metadata?: Record<string, unknown> | null;
    client?: OwnerScopePrismaClient;
  }): Promise<ClientResourceLinkRecord | null> {
    if (!input.sourceResourceId || !input.targetResourceId) return null;
    const client = input.client ?? this.client;
    const owner = await findResourceOwner(client, {
      warehouseId: input.warehouseId,
      resourceType: input.sourceResourceType,
      resourceId: input.sourceResourceId,
    });
    if (!owner) return null;
    const link = await ensureOwnedResourceLink(client, {
      warehouseId: input.warehouseId,
      clientId: owner.id,
      resourceType: input.targetResourceType,
      resourceId: input.targetResourceId,
      metadata: {
        inheritedFromResourceType: normalizeOptionalResourceCode(input.sourceResourceType),
        inheritedFromResourceId: input.sourceResourceId,
        ...(input.metadata ?? {}),
      },
    });
    await this.mirrorOwnerClientId(client, input.targetResourceType, input.targetResourceId, owner.id);
    return link;
  }

  async resolveSingleOwnerFromResources(input: {
    warehouseId: string;
    resources: Array<{ resourceType: string; resourceId: string | null | undefined }>;
    client?: OwnerScopePrismaClient;
  }): Promise<OwnerClientRecord | null> {
    const client = input.client ?? this.client;
    const owners: OwnerClientRecord[] = [];
    for (const resource of input.resources) {
      if (!resource.resourceId) continue;
      const owner = await findResourceOwner(client, {
        warehouseId: input.warehouseId,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
      });
      if (owner) owners.push(owner);
    }
    const uniqueOwnerIds = Array.from(new Set(owners.map((owner) => owner.id)));
    if (uniqueOwnerIds.length > 1) {
      throw new ConflictException('Operation spans resources owned by multiple clients.');
    }
    return owners[0] ?? null;
  }

  readOwnerClientReference(value: {
    ownerClientReference?: string | null;
    metadata?: Record<string, unknown> | null;
  }): string | null {
    return readOwnerClientReference(value);
  }

  private mirrorOwnerClientId(
    client: OwnerScopePrismaClient,
    resourceType: string,
    resourceId: string | null | undefined,
    clientId: string | null,
  ): Promise<boolean> {
    return mirrorOwnerClientIdToResource(client as unknown as OwnerClientMirrorClient, {
      resourceType,
      resourceId,
      clientId,
    });
  }

  private async resolveClient(reference: string, client: OwnerScopePrismaClient = this.client): Promise<{ id: string; code: string }> {
    const normalized = normalizeClientCode(reference);
    const resolved = await client.wmsClient.findFirst({
      where: isUuid(reference) ? { OR: [{ id: reference }, { code: normalized }] } : { code: normalized },
      select: { id: true, code: true },
    });
    if (!resolved) throw new NotFoundException('Client was not found.');
    return resolved;
  }

  private get client(): OwnerScopePrismaClient {
    return this.prisma as unknown as OwnerScopePrismaClient;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
