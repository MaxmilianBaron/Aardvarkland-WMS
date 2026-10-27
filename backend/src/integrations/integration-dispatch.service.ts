import { Injectable } from '@nestjs/common';

import { PrismaService } from '../database';
import { IntegrationEnterpriseService } from './integration-enterprise.service';
import {
  deliverHttpIntegrationEvent,
  HttpIntegrationDeliveryResult,
  HttpIntegrationEvent,
  HttpIntegrationEndpoint,
  pingHttpIntegrationEndpoint,
} from './http-integration-adapter';
import {
  endpointAcceptsEvent,
  maskIntegrationConfig,
  toIntegrationEndpointConfig,
} from './integration-config.helpers';

export interface IntegrationDispatchSummary {
  delivered: number;
  skipped: number;
  failures: number;
  results: HttpIntegrationDeliveryResult[];
}

export interface IntegrationEndpointPingResponse {
  endpointId: string;
  endpointCode: string;
  success: boolean;
  statusCode: number;
  url: string;
  method: string;
  responseBody: string;
}

@Injectable()
export class IntegrationDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrationEnterpriseService: IntegrationEnterpriseService,
  ) {}

  async dispatchOutboxEvent(event: HttpIntegrationEvent): Promise<IntegrationDispatchSummary> {
    const endpoints = await this.findActiveEndpointsForEvent(event.type);

    if (endpoints.length === 0) {
      return { delivered: 0, skipped: 1, failures: 0, results: [] };
    }

    const results: HttpIntegrationDeliveryResult[] = [];
    const errors: string[] = [];

    for (const endpoint of endpoints) {
      try {
        const result = await deliverHttpIntegrationEvent(endpoint, event);
        results.push(result);
        await this.writeDispatchLog(endpoint, event, result);
        if (!result.success) {
          const message = `${endpoint.code} returned HTTP ${result.statusCode}`;
          errors.push(message);
          await this.recordDeadLetter(endpoint, event, message, {
            statusCode: result.statusCode,
            responseBody: result.responseBody,
            destinationUrl: result.url,
          });
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${endpoint.code}: ${message}`);
        await this.writeFailureLog(endpoint, event, message);
        await this.recordDeadLetter(endpoint, event, message, { thrown: true });
      }
    }

    if (errors.length > 0) {
      throw new Error(`Integration dispatch failed: ${errors.join('; ')}`);
    }

    return { delivered: results.length, skipped: 0, failures: 0, results };
  }

  async pingEndpoint(
    endpointReference: string,
    input: { eventType?: string; path?: string; payload?: unknown } = {},
  ): Promise<IntegrationEndpointPingResponse> {
    const endpoint = await this.resolveEndpoint(endpointReference);
    const result = await pingHttpIntegrationEndpoint(endpoint, input);
    await this.client.integrationDispatchLog.create({
      data: {
        endpointId: endpoint.id,
        outboxEventId: null,
        eventType: input.eventType ?? 'WMS_INTEGRATION_PING',
        destinationUrl: result.url,
        requestMethod: result.method,
        statusCode: result.statusCode,
        success: result.success,
        attempts: 1,
        errorMessage: result.success ? null : `HTTP ${result.statusCode}`,
        requestBodyHash: null,
        responseBody: result.responseBody,
        metadata: { kind: 'ping', config: maskIntegrationConfig(endpoint.config) },
      },
    });

    return {
      endpointId: endpoint.id,
      endpointCode: endpoint.code,
      success: result.success,
      statusCode: result.statusCode,
      url: result.url,
      method: result.method,
      responseBody: result.responseBody,
    };
  }


  private async recordDeadLetter(
    endpoint: HttpIntegrationEndpoint,
    event: HttpIntegrationEvent,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.integrationEnterpriseService.recordDeadLetter({
      endpointId: endpoint.id,
      outboxEventId: event.id ?? null,
      eventType: event.type,
      errorMessage: message,
      attempts: Math.max(1, Math.trunc(event.attempts ?? 0) + 1),
      payload: event.payload,
      metadata: { endpointCode: endpoint.code, endpointType: endpoint.type, ...metadata },
    });
  }

  private async findActiveEndpointsForEvent(eventType: string): Promise<HttpIntegrationEndpoint[]> {
    const endpoints = await this.client.integrationEndpoint.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
    });

    return endpoints.filter((endpoint) => {
      const config = toIntegrationEndpointConfig(endpoint.config);
      if (endpointAcceptsEvent(config, eventType)) {
        return true;
      }

      const endpointType = endpoint.type.trim().toUpperCase();
      return endpointType === 'ERP' || endpointType === 'CARRIER';
    });
  }

  private async resolveEndpoint(endpointReference: string): Promise<HttpIntegrationEndpoint> {
    const endpoint = await this.client.integrationEndpoint.findFirst({
      where: endpointReferenceWhere(endpointReference),
    });

    if (!endpoint) {
      throw new Error('Integration endpoint was not found');
    }

    return endpoint;
  }

  private async writeDispatchLog(
    endpoint: HttpIntegrationEndpoint,
    event: HttpIntegrationEvent,
    result: HttpIntegrationDeliveryResult,
  ): Promise<void> {
    await this.client.integrationDispatchLog.create({
      data: {
        endpointId: endpoint.id,
        outboxEventId: event.id ?? null,
        eventType: event.type,
        destinationUrl: result.url,
        requestMethod: result.method,
        statusCode: result.statusCode,
        success: result.success,
        attempts: Math.max(1, Math.trunc(event.attempts ?? 0) + 1),
        errorMessage: result.success ? null : `HTTP ${result.statusCode}`,
        requestBodyHash: result.requestBodyHash,
        responseBody: result.responseBody,
        metadata: { endpointCode: endpoint.code, endpointType: endpoint.type },
      },
    });
  }

  private async writeFailureLog(
    endpoint: HttpIntegrationEndpoint,
    event: HttpIntegrationEvent,
    message: string,
  ): Promise<void> {
    await this.client.integrationDispatchLog.create({
      data: {
        endpointId: endpoint.id,
        outboxEventId: event.id ?? null,
        eventType: event.type,
        destinationUrl: endpoint.baseUrl,
        requestMethod: 'POST',
        statusCode: null,
        success: false,
        attempts: Math.max(1, Math.trunc(event.attempts ?? 0) + 1),
        errorMessage: message.slice(0, 4000),
        requestBodyHash: null,
        responseBody: null,
        metadata: { endpointCode: endpoint.code, endpointType: endpoint.type },
      },
    });
  }

  private get client(): IntegrationDispatchPrismaClient {
    return this.prisma as unknown as IntegrationDispatchPrismaClient;
  }
}

function endpointReferenceWhere(endpointReference: string): Record<string, unknown> {
  const normalized = endpointReference.trim().toUpperCase();
  return isUuid(endpointReference)
    ? { OR: [{ id: endpointReference }, { code: normalized }] }
    : { code: normalized };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

interface IntegrationDispatchPrismaClient {
  integrationEndpoint: {
    findMany(args: Record<string, unknown>): Promise<HttpIntegrationEndpoint[]>;
    findFirst(args: Record<string, unknown>): Promise<HttpIntegrationEndpoint | null>;
  };
  integrationDispatchLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}
