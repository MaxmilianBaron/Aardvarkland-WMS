import { ConflictException, NotFoundException } from '@nestjs/common';

import { normalizeClientCode, normalizeOptionalResourceCode } from './clients.helpers';

export interface OwnerClientRecord {
  id: string;
  code: string;
  status?: string | null;
}

export interface ClientResourceLinkRecord {
  id: string;
  clientId: string;
  warehouseId: string;
  resourceType: string;
  resourceId: string;
  externalReference?: string | null;
  metadata?: unknown;
}

export interface OwnerLinkingClient {
  wmsClient?: {
    findFirst(args: Record<string, unknown>): Promise<OwnerClientRecord | null>;
  };
  clientWarehouse?: {
    findFirst(args: Record<string, unknown>): Promise<{ id: string; isActive?: boolean } | null>;
  };
  clientResourceLink?: {
    findFirst(args: Record<string, unknown>): Promise<ClientResourceLinkRecord | null>;
    create(args: Record<string, unknown>): Promise<ClientResourceLinkRecord>;
    update(args: Record<string, unknown>): Promise<ClientResourceLinkRecord>;
    upsert?(args: Record<string, unknown>): Promise<ClientResourceLinkRecord>;
  };
}

export interface ResolveOwnerInput {
  warehouseId: string;
  clientReference?: string | null;
  requireWarehouseAttachment?: boolean;
}

export interface OwnedResourceInput {
  warehouseId: string;
  clientId: string;
  resourceType: string;
  resourceId: string;
  externalReference?: string | null;
  metadata?: Record<string, unknown> | null;
  allowOwnerTransfer?: boolean;
}

export interface ResolveOperationalOwnerInput {
  warehouseId: string;
  ownerClientReference?: string | null;
  inheritedResourceType?: string | null;
  inheritedResourceId?: string | null;
  requireWarehouseAttachment?: boolean;
}

export function readOwnerClientReference(value: {
  ownerClientReference?: string | null;
  metadata?: Record<string, unknown> | null;
}): string | null {
  const explicit = normalizeNullableString(value.ownerClientReference);
  if (explicit) return explicit;

  const metadata = value.metadata;
  if (!metadata || typeof metadata !== 'object') return null;

  for (const key of ['ownerClientReference', 'clientReference', 'clientCode', 'ownerClientCode']) {
    const raw = metadata[key];
    if (typeof raw === 'string') {
      const normalized = normalizeNullableString(raw);
      if (normalized) return normalized;
    }
  }

  return null;
}

export async function resolveOwnerClient(
  client: OwnerLinkingClient,
  input: ResolveOwnerInput,
): Promise<OwnerClientRecord | null> {
  const clientReference = normalizeNullableString(input.clientReference);
  if (!clientReference) return null;
  assertOwnerDelegates(client, { requireWarehouseAttachment: input.requireWarehouseAttachment !== false });

  const code = normalizeClientCode(clientReference);
  const owner = await client.wmsClient!.findFirst({
    where: isUuid(clientReference) ? { OR: [{ id: clientReference }, { code }] } : { code },
    select: { id: true, code: true, status: true },
  });

  if (!owner) {
    throw new NotFoundException('Owner client was not found.');
  }

  if (owner.status && owner.status !== 'ACTIVE') {
    throw new ConflictException(`Owner client ${owner.code} is not ACTIVE.`);
  }

  if (input.requireWarehouseAttachment !== false) {
    const warehouseLink = await client.clientWarehouse!.findFirst({
      where: { clientId: owner.id, warehouseId: input.warehouseId, isActive: true },
      select: { id: true, isActive: true },
    });
    if (!warehouseLink) {
      throw new ConflictException(`Owner client ${owner.code} is not attached to this warehouse.`);
    }
  }

  return owner;
}

export async function findResourceOwner(
  client: OwnerLinkingClient,
  input: { warehouseId: string; resourceType: string; resourceId: string },
): Promise<OwnerClientRecord | null> {
  assertOwnerDelegates(client, { requireWarehouseAttachment: false });
  const resourceType = normalizeResourceTypeOrThrow(input.resourceType);
  const resourceId = normalizeResourceIdOrThrow(input.resourceId);
  const link = await client.clientResourceLink!.findFirst({
    where: { warehouseId: input.warehouseId, resourceType, resourceId },
    select: { id: true, clientId: true, warehouseId: true, resourceType: true, resourceId: true },
  });

  if (!link) return null;

  const owner = await client.wmsClient!.findFirst({
    where: { id: link.clientId },
    select: { id: true, code: true, status: true },
  });

  if (!owner) {
    throw new ConflictException('Resource ownership link points to a missing client.');
  }

  return owner;
}

export async function resolveOperationalOwner(
  client: OwnerLinkingClient,
  input: ResolveOperationalOwnerInput,
): Promise<OwnerClientRecord | null> {
  const explicitOwner = await resolveOwnerClient(client, {
    warehouseId: input.warehouseId,
    clientReference: input.ownerClientReference,
    requireWarehouseAttachment: input.requireWarehouseAttachment,
  });
  const inheritedOwner =
    input.inheritedResourceType && input.inheritedResourceId
      ? await findResourceOwner(client, {
          warehouseId: input.warehouseId,
          resourceType: input.inheritedResourceType,
          resourceId: input.inheritedResourceId,
        })
      : null;

  if (explicitOwner && inheritedOwner && explicitOwner.id !== inheritedOwner.id) {
    throw new ConflictException(
      `Explicit owner ${explicitOwner.code} does not match inherited owner ${inheritedOwner.code}.`,
    );
  }

  return explicitOwner ?? inheritedOwner;
}

export async function ensureOwnedResourceLink(
  client: OwnerLinkingClient,
  input: OwnedResourceInput,
): Promise<ClientResourceLinkRecord> {
  assertOwnerDelegates(client, { requireWarehouseAttachment: false });
  const resourceType = normalizeResourceTypeOrThrow(input.resourceType);
  const resourceId = normalizeResourceIdOrThrow(input.resourceId);
  const existing = await client.clientResourceLink!.findFirst({
    where: { warehouseId: input.warehouseId, resourceType, resourceId },
  });

  const metadata = buildAutoOwnershipMetadata(existing?.metadata, input.metadata);
  const externalReference = normalizeNullableString(input.externalReference);

  if (existing) {
    if (existing.clientId !== input.clientId && input.allowOwnerTransfer !== true) {
      throw new ConflictException(
        `Resource ${resourceType}:${resourceId} is already owned by another client. Pass allowOwnerTransfer=true to transfer ownership.`,
      );
    }

    return client.clientResourceLink!.update({
      where: { id: existing.id },
      data: {
        clientId: input.clientId,
        ...(externalReference === undefined ? {} : { externalReference }),
        metadata,
      },
    });
  }

  return client.clientResourceLink!.create({
    data: {
      clientId: input.clientId,
      warehouseId: input.warehouseId,
      resourceType,
      resourceId,
      externalReference: externalReference ?? null,
      metadata,
    },
  });
}

export async function ensureOwnedResourceLinks(
  client: OwnerLinkingClient,
  input: Omit<OwnedResourceInput, 'resourceType' | 'resourceId'> & {
    resources: Array<{ resourceType: string; resourceId: string; metadata?: Record<string, unknown> | null }>;
  },
): Promise<ClientResourceLinkRecord[]> {
  const links: ClientResourceLinkRecord[] = [];
  for (const resource of input.resources) {
    links.push(
      await ensureOwnedResourceLink(client, {
        ...input,
        resourceType: resource.resourceType,
        resourceId: resource.resourceId,
        metadata: { ...(input.metadata ?? {}), ...(resource.metadata ?? {}) },
      }),
    );
  }
  return links;
}

function assertOwnerDelegates(client: OwnerLinkingClient, options: { requireWarehouseAttachment: boolean }): void {
  if (!client.wmsClient?.findFirst || !client.clientResourceLink?.findFirst) {
    throw new ConflictException('Client ownership models are not available. Apply 3PL migrations and regenerate Prisma client.');
  }
  if (options.requireWarehouseAttachment && !client.clientWarehouse?.findFirst) {
    throw new ConflictException('Client warehouse ownership model is not available. Apply 3PL migrations and regenerate Prisma client.');
  }
}

function buildAutoOwnershipMetadata(
  current: unknown,
  next: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  return {
    ...toRecord(current),
    ...(next ?? {}),
    autoOwnershipLinkedAt: new Date().toISOString(),
  };
}

function normalizeResourceTypeOrThrow(value: string): string {
  const resourceType = normalizeOptionalResourceCode(value);
  if (!resourceType) throw new ConflictException('Resource type is required.');
  return resourceType;
}

function normalizeResourceIdOrThrow(value: string): string {
  const resourceId = normalizeNullableString(value);
  if (!resourceId) throw new ConflictException('Resource id is required.');
  return resourceId;
}

function normalizeNullableString(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
