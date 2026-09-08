import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AuthenticatedUser } from '../access-control/types';
import { PrismaService } from '../database';
import { Prisma } from '../generated/prisma/client';
import { CreateIntegrationEndpointDto } from './dto/create-integration-endpoint.dto';
import { UpdateIntegrationEndpointDto } from './dto/update-integration-endpoint.dto';
import { maskIntegrationConfig } from './integration-config.helpers';
import { IntegrationEndpointResponse, IntegrationStatus } from './integrations.types';

interface IntegrationEndpointRecord {
  id: string;
  code: string;
  name: string;
  type: string;
  baseUrl: string;
  authType: string;
  status: IntegrationStatus;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}

type IntegrationEndpointWhereInput = {
  id?: string;
  code?: string;
  OR?: Array<{ id?: string; code?: string }>;
};

type IntegrationEndpointJsonInput = Prisma.InputJsonValue | typeof Prisma.DbNull;

interface IntegrationEndpointCreateInput {
  code: string;
  name: string;
  type: string;
  baseUrl: string;
  authType: string;
  status: IntegrationStatus;
  config?: IntegrationEndpointJsonInput;
}

interface IntegrationEndpointUpdateInput {
  code?: string;
  name?: string;
  type?: string;
  baseUrl?: string;
  authType?: string;
  status?: IntegrationStatus;
  config?: IntegrationEndpointJsonInput;
}

interface IntegrationEndpointDelegate {
  findMany(args: { orderBy: { code: 'asc' } }): Promise<IntegrationEndpointRecord[]>;
  findFirst(args: {
    where: IntegrationEndpointWhereInput;
  }): Promise<IntegrationEndpointRecord | null>;
  create(args: { data: IntegrationEndpointCreateInput }): Promise<IntegrationEndpointRecord>;
  update(args: {
    where: { id: string };
    data: IntegrationEndpointUpdateInput;
  }): Promise<IntegrationEndpointRecord>;
}

type PrismaWithIntegrations = PrismaService & {
  integrationEndpoint: IntegrationEndpointDelegate;
};

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(): Promise<IntegrationEndpointResponse[]> {
    const endpoints = await this.endpoints.findMany({
      orderBy: { code: 'asc' },
    });

    return endpoints.map(toIntegrationEndpointResponse);
  }

  async create(
    dto: CreateIntegrationEndpointDto,
    actor: AuthenticatedUser,
  ): Promise<IntegrationEndpointResponse> {
    try {
      const endpoint = await this.endpoints.create({
        data: {
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          type: normalizeCode(dto.type),
          baseUrl: dto.baseUrl.trim(),
          authType: normalizeCode(dto.authType ?? 'NONE'),
          status: dto.status ?? 'INACTIVE',
          ...(dto.config === undefined ? {} : { config: toJsonInput(dto.config) }),
        },
      });

      await this.writeIntegrationAudit(actor, 'integration_endpoint.created', endpoint);

      return toIntegrationEndpointResponse(endpoint);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Integration endpoint code already exists');
      }

      throw error;
    }
  }

  async update(
    endpointReference: string,
    dto: UpdateIntegrationEndpointDto,
    actor: AuthenticatedUser,
  ): Promise<IntegrationEndpointResponse> {
    const existingEndpoint = await this.resolveEndpoint(endpointReference);
    const data = toUpdateInput(dto);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No integration endpoint changes were provided');
    }

    try {
      const endpoint = await this.endpoints.update({
        where: { id: existingEndpoint.id },
        data,
      });

      await this.writeIntegrationAudit(actor, 'integration_endpoint.updated', endpoint);

      return toIntegrationEndpointResponse(endpoint);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Integration endpoint code already exists');
      }

      throw error;
    }
  }

  private get endpoints(): IntegrationEndpointDelegate {
    return (this.prisma as PrismaWithIntegrations).integrationEndpoint;
  }

  private async resolveEndpoint(endpointReference: string): Promise<IntegrationEndpointRecord> {
    const endpoint = await this.endpoints.findFirst({
      where: endpointReferenceWhere(endpointReference),
    });

    if (!endpoint) {
      throw new NotFoundException('Integration endpoint was not found');
    }

    return endpoint;
  }

  private async writeIntegrationAudit(
    actor: AuthenticatedUser,
    action: string,
    endpoint: IntegrationEndpointRecord,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        warehouseId: null,
        action,
        resourceType: 'integration_endpoint',
        resourceId: endpoint.id,
        metadata: {
          code: endpoint.code,
          type: endpoint.type,
          status: endpoint.status,
        },
      },
    });
  }
}

function toUpdateInput(dto: UpdateIntegrationEndpointDto): IntegrationEndpointUpdateInput {
  return {
    ...(dto.code === undefined ? {} : { code: normalizeCode(dto.code) }),
    ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
    ...(dto.type === undefined ? {} : { type: normalizeCode(dto.type) }),
    ...(dto.baseUrl === undefined ? {} : { baseUrl: dto.baseUrl.trim() }),
    ...(dto.authType === undefined ? {} : { authType: normalizeCode(dto.authType) }),
    ...(dto.status === undefined ? {} : { status: dto.status }),
    ...(dto.config === undefined ? {} : { config: toJsonInput(dto.config) }),
  };
}

function toIntegrationEndpointResponse(
  endpoint: IntegrationEndpointRecord,
): IntegrationEndpointResponse {
  return {
    id: endpoint.id,
    code: endpoint.code,
    name: endpoint.name,
    type: endpoint.type,
    baseUrl: endpoint.baseUrl,
    authType: endpoint.authType,
    status: endpoint.status,
    config: maskIntegrationConfig(endpoint.config),
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

function endpointReferenceWhere(endpointReference: string): IntegrationEndpointWhereInput {
  if (isUuid(endpointReference)) {
    return {
      OR: [{ id: endpointReference }, { code: normalizeCode(endpointReference) }],
    };
  }

  return { code: normalizeCode(endpointReference) };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function toJsonInput(
  value: Record<string, unknown> | null | undefined,
): IntegrationEndpointJsonInput | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return Prisma.DbNull;
  }

  return value as Prisma.InputJsonValue;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
