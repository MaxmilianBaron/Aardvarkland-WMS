import { ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';

import { PrismaService } from '../database';
import { IntegrationDispatchService } from '../integrations';
import {
  canMarkOutboxSent,
  getNextRetryDecision,
  getOutboxDeliveryStatus,
  normalizeOutboxEventInput,
  sortPendingOutboxEvents,
} from './outbox.helpers';
import {
  AppendOutboxEventInput,
  DispatchOutboxEventsInput,
  InboxEventResponse,
  InboxEventStatus,
  ListInboxEventsInput,
  MarkInboxEventFailedInput,
  MarkInboxEventProcessedInput,
  ListPendingOutboxEventsInput,
  ListDeadLetterOutboxEventsInput,
  OutboxDeliveryStatus,
  OutboxDispatchResponse,
  OutboxEventResponse,
  ReceiveInboxEventInput,
  RequeueDeadLetterOutboxEventInput,
} from './outbox.types';

const DEFAULT_DISPATCH_TAKE = 50;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_RETRY_DELAY_SECONDS = 60;
const DEFAULT_PROCESSING_TIMEOUT_SECONDS = 300;

@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly integrationDispatch?: IntegrationDispatchService,
  ) {}

  async append(input: AppendOutboxEventInput): Promise<OutboxEventResponse> {
    const event = normalizeOutboxEventInput(input);
    const record = await this.client.outboxEvent.create({
      data: {
        type: event.eventType,
        aggregateType: event.aggregateType ?? 'unknown',
        aggregateId: event.aggregateId ?? 'unknown',
        payload: withHeaders(event.payload, event.headers),
        status: 'PENDING',
        availableAt: new Date(),
      },
    });

    return toOutboxEventResponse(record);
  }

  async markSent(eventId: string, sentAt = new Date()): Promise<OutboxEventResponse> {
    const existing = await this.client.outboxEvent.findFirst({
      where: { id: eventId },
    });

    if (!existing) {
      throw new NotFoundException('Outbox event was not found');
    }

    if (!canMarkOutboxSent(existing)) {
      return toOutboxEventResponse(existing);
    }

    const record = await this.client.outboxEvent.update({
      where: { id: existing.id },
      data: { sentAt, status: 'SENT' },
    });

    return toOutboxEventResponse(record);
  }

  async dispatchPending(input: DispatchOutboxEventsInput = {}): Promise<OutboxDispatchResponse> {
    const take = input.take ?? DEFAULT_DISPATCH_TAKE;
    const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const retryDelaySeconds = input.retryDelaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS;
    const dryRun = input.dryRun ?? false;
    const pendingEvents = await this.client.$transaction((tx) =>
      this.claimPendingEvents(tx, { ...input, take }, { claim: !dryRun }),
    );

    const events: OutboxDispatchResponse['events'] = [];
    let dispatched = 0;
    let failed = 0;
    let skipped = 0;
    let retried = 0;

    for (const event of pendingEvents) {
      if (dryRun) {
        skipped += 1;
        events.push({
          id: event.id,
          eventType: event.type,
          status: OutboxDeliveryStatus.PENDING,
          attempts: event.attempts ?? 0,
          nextAvailableAt: event.availableAt ?? null,
        });
        continue;
      }

      try {
        await this.deliverEvent(event);
        const sentAt = new Date();
        const marked = await this.client.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: 'SENT',
            sentAt,
            lastError: null,
            attempts: { increment: 1 },
          },
        });
        dispatched += 1;
        events.push({
          id: marked.id,
          eventType: marked.type,
          status: OutboxDeliveryStatus.SENT,
          attempts: marked.attempts ?? null,
          nextAvailableAt: null,
        });
      } catch (error: unknown) {
        const decision = getNextRetryDecision({
          attempts: event.attempts ?? 0,
          maxAttempts,
          retryDelaySeconds,
        });
        const persistedStatus: OutboxEventUpdateInput['status'] = decision.status;
        const updated = await this.client.outboxEvent.update({
          where: { id: event.id },
          data: {
            status: persistedStatus,
            attempts: { increment: 1 },
            availableAt: decision.availableAt ?? new Date(),
            lastError: normalizeError(error),
          },
        });

        if (decision.exhausted) {
          failed += 1;
        } else {
          retried += 1;
        }

        events.push({
          id: updated.id,
          eventType: updated.type,
          status: decision.status,
          attempts: updated.attempts ?? decision.attempts,
          nextAvailableAt: decision.availableAt,
        });
      }
    }

    return {
      claimed: pendingEvents.length,
      dispatched,
      failed,
      skipped,
      retried,
      dryRun,
      events,
    };
  }

  async listPending(input: ListPendingOutboxEventsInput = {}): Promise<OutboxEventResponse[]> {
    const eventType = input.eventType?.trim();
    const events = await this.client.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        availableAt: { lte: new Date() },
        ...(eventType ? { type: eventType } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: input.take ?? 50,
      skip: input.skip ?? 0,
    });

    return sortPendingOutboxEvents(events.map(toOutboxEventResponse));
  }

  async listDeadLetters(input: ListDeadLetterOutboxEventsInput = {}): Promise<OutboxEventResponse[]> {
    const eventType = input.eventType?.trim();
    const events = await this.client.outboxEvent.findMany({
      where: {
        status: 'DEAD_LETTER',
        ...(eventType ? { type: eventType } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: input.take ?? 50,
      skip: input.skip ?? 0,
    });

    return events.map(toOutboxEventResponse);
  }

  async requeueDeadLetter(
    eventId: string,
    input: RequeueDeadLetterOutboxEventInput,
  ): Promise<OutboxEventResponse> {
    const existing = await this.client.outboxEvent.findFirst({ where: { id: eventId } });

    if (!existing) {
      throw new NotFoundException('Outbox event was not found');
    }

    if (getOutboxDeliveryStatus(existing) !== OutboxDeliveryStatus.DEAD_LETTER) {
      throw new ConflictException('Only dead-letter outbox events can be requeued');
    }

    const availableInSeconds = Math.max(0, input.availableInSeconds ?? 0);
    const availableAt = new Date(Date.now() + availableInSeconds * 1000);
    const payloadEnvelope = toRecordOrNull(existing.payload);
    const existingHeaders = toRecordOrNull(payloadEnvelope?.['headers']);
    const payload = payloadEnvelope && 'payload' in payloadEnvelope ? payloadEnvelope['payload'] : existing.payload ?? {};
    const requeueHistory = Array.isArray(existingHeaders?.['requeueHistory'])
      ? existingHeaders['requeueHistory'] as unknown[]
      : [];

    const updated = await this.client.outboxEvent.update({
      where: { id: existing.id },
      data: {
        status: 'PENDING',
        availableAt,
        sentAt: null,
        lastError: null,
        attempts: input.resetAttempts === false ? existing.attempts ?? 0 : 0,
        payload: withHeaders(payload, {
          ...(existingHeaders ?? {}),
          requeueHistory: [
            ...requeueHistory.slice(-9),
            {
              reason: input.reason.trim(),
              requeuedAt: new Date().toISOString(),
              previousAttempts: existing.attempts ?? 0,
              availableAt: availableAt.toISOString(),
            },
          ],
        }),
      },
    });

    return toOutboxEventResponse(updated);
  }

  async receiveInboxEvent(input: ReceiveInboxEventInput): Promise<InboxEventResponse> {
    const normalized = normalizeInboxEventInput(input);
    const existing = await this.client.inboxEvent.findFirst({
      where: {
        sourceSystem: normalized.sourceSystem,
        externalEventId: normalized.externalEventId,
      },
    });

    if (existing) {
      if (!sameJsonValue(existing.payload ?? {}, normalized.payload ?? {})) {
        throw new ConflictException(
          'Inbox event externalEventId was already received with a different payload',
        );
      }

      if (!sameJsonValue(existing.headers ?? null, normalized.headers ?? null)) {
        throw new ConflictException(
          'Inbox event externalEventId was already received with different headers',
        );
      }

      return toInboxEventResponse(existing, true);
    }

    const record = await this.client.inboxEvent.create({
      data: {
        sourceSystem: normalized.sourceSystem,
        externalEventId: normalized.externalEventId,
        type: normalized.eventType,
        status: InboxEventStatus.RECEIVED,
        payload: normalized.payload ?? {},
        headers: normalized.headers ?? null,
        resourceType: normalized.resourceType,
        resourceId: normalized.resourceId,
      },
    });

    return toInboxEventResponse(record, false);
  }

  async listInboxEvents(input: ListInboxEventsInput = {}): Promise<InboxEventResponse[]> {
    const events = await this.client.inboxEvent.findMany({
      where: compactRecord({
        sourceSystem: normalizeOptional(input.sourceSystem),
        type: normalizeOptional(input.eventType),
        status: normalizeOptional(input.status),
      }),
      orderBy: { receivedAt: 'desc' },
      take: input.take ?? 100,
      skip: input.skip ?? 0,
    });

    return events.map((event) => toInboxEventResponse(event, false));
  }

  async markInboxProcessed(
    eventId: string,
    input: MarkInboxEventProcessedInput = {},
  ): Promise<InboxEventResponse> {
    const existing = await this.client.inboxEvent.findFirst({ where: { id: eventId } });

    if (!existing) {
      throw new NotFoundException('Inbox event was not found');
    }

    if (existing.status === InboxEventStatus.PROCESSED) {
      return toInboxEventResponse(existing, false);
    }

    if (existing.status === InboxEventStatus.FAILED) {
      throw new ConflictException(
        'Failed inbox events must be retried before they can be processed',
      );
    }

    const processedAt = new Date();
    const updated = await this.client.inboxEvent.update({
      where: { id: existing.id },
      data: {
        status: InboxEventStatus.PROCESSED,
        processedAt,
        resourceType: normalizeOptional(input.resourceType) ?? existing.resourceType ?? null,
        resourceId: normalizeOptional(input.resourceId) ?? existing.resourceId ?? null,
        lastError: null,
        attempts: { increment: 1 },
        headers: mergeJsonRecord(existing.headers, { processedMetadata: input.metadata ?? null }),
      },
    });

    return toInboxEventResponse(updated, false);
  }

  async markInboxFailed(
    eventId: string,
    input: MarkInboxEventFailedInput,
  ): Promise<InboxEventResponse> {
    const existing = await this.client.inboxEvent.findFirst({ where: { id: eventId } });

    if (!existing) {
      throw new NotFoundException('Inbox event was not found');
    }

    if (existing.status === InboxEventStatus.PROCESSED) {
      throw new ConflictException('Processed inbox events cannot be marked failed');
    }

    const updated = await this.client.inboxEvent.update({
      where: { id: existing.id },
      data: compactRecord({
        status: InboxEventStatus.FAILED,
        lastError: input.errorMessage.trim(),
        attempts: { increment: 1 },
        headers: mergeJsonRecord(existing.headers, { failedMetadata: input.metadata ?? null }),
      }),
    });

    return toInboxEventResponse(updated, false);
  }

  private async claimPendingEvents(
    client: OutboxTransactionClient,
    input: DispatchOutboxEventsInput,
    options: { claim: boolean },
  ): Promise<OutboxEventRecord[]> {
    const take = input.take ?? DEFAULT_DISPATCH_TAKE;
    const eventType = input.eventType?.trim();

    if (client.$queryRawUnsafe) {
      const params: unknown[] = [take];
      const typeFilter = eventType ? 'AND type = $2' : '';

      if (eventType) {
        params.push(eventType);
      }

      if (options.claim) {
        return client.$queryRawUnsafe<OutboxEventRecord[]>(
          `WITH claimed AS (
            SELECT id
            FROM outbox_events
            WHERE status IN ('PENDING', 'PROCESSING')
              AND available_at <= NOW()
              ${typeFilter}
            ORDER BY created_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $1
          )
          UPDATE outbox_events AS event
          SET status = 'PROCESSING',
              available_at = NOW() + INTERVAL '5 minutes',
              updated_at = NOW()
          FROM claimed
          WHERE event.id = claimed.id
          RETURNING
            event.id,
            event.type,
            event.aggregate_type AS "aggregateType",
            event.aggregate_id AS "aggregateId",
            event.payload,
            event.status,
            event.attempts,
            event.last_error AS "lastError",
            event.available_at AS "availableAt",
            event.sent_at AS "sentAt",
            event.created_at AS "createdAt",
            event.updated_at AS "updatedAt"`,
          ...params,
        );
      }

      return client.$queryRawUnsafe<OutboxEventRecord[]>(
        `SELECT
          id,
          type,
          aggregate_type AS "aggregateType",
          aggregate_id AS "aggregateId",
          payload,
          status,
          attempts,
          last_error AS "lastError",
          available_at AS "availableAt",
          sent_at AS "sentAt",
          created_at AS "createdAt",
          updated_at AS "updatedAt"
        FROM outbox_events
        WHERE status IN ('PENDING', 'PROCESSING')
          AND available_at <= NOW()
          ${typeFilter}
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $1`,
        ...params,
      );
    }

    const events = await client.outboxEvent.findMany({
      where: {
        status: 'PENDING',
        availableAt: { lte: new Date() },
        ...(eventType ? { type: eventType } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take,
      skip: input.skip ?? 0,
    });

    if (!options.claim) {
      return events;
    }

    const claimed: OutboxEventRecord[] = [];

    for (const event of events) {
      const updated = await client.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: 'PROCESSING',
          availableAt: new Date(Date.now() + DEFAULT_PROCESSING_TIMEOUT_SECONDS * 1000),
        },
      });
      claimed.push(updated);
    }

    return claimed;
  }

  private async deliverEvent(event: OutboxEventRecord): Promise<void> {
    if (!event.type || event.type.trim().length === 0) {
      throw new Error('Outbox event type is missing');
    }

    await this.integrationDispatch?.dispatchOutboxEvent({
      id: event.id,
      type: event.type,
      aggregateType: event.aggregateType ?? null,
      aggregateId: event.aggregateId ?? null,
      payload: event.payload ?? {},
      attempts: event.attempts ?? 0,
      createdAt: event.createdAt,
    });
  }

  private get client(): OutboxPrismaClient {
    return this.prisma as unknown as OutboxPrismaClient;
  }
}

function toOutboxEventResponse(record: OutboxEventRecord): OutboxEventResponse {
  const createdAt = record.createdAt;
  const payloadEnvelope = toRecordOrNull(record.payload);

  return {
    id: record.id,
    eventType: record.type,
    aggregateType: record.aggregateType ?? null,
    aggregateId: record.aggregateId ?? null,
    payload: payloadEnvelope?.['payload'] ?? record.payload ?? {},
    headers: toRecordOrNull(payloadEnvelope?.['headers']),
    deliveryStatus: getOutboxDeliveryStatus(record),
    attempts: record.attempts ?? null,
    lastError: record.lastError ?? null,
    nextAvailableAt: record.availableAt ?? null,
    sentAt: record.sentAt ?? null,
    createdAt,
    updatedAt: record.updatedAt ?? createdAt,
  };
}

function toInboxEventResponse(record: InboxEventRecord, duplicate: boolean): InboxEventResponse {
  return {
    id: record.id,
    sourceSystem: record.sourceSystem,
    externalEventId: record.externalEventId,
    eventType: record.type,
    status: normalizeInboxStatus(record.status),
    payload: record.payload ?? {},
    headers: toRecordOrNull(record.headers),
    resourceType: record.resourceType ?? null,
    resourceId: record.resourceId ?? null,
    attempts: record.attempts ?? 0,
    lastError: record.lastError ?? null,
    receivedAt: record.receivedAt,
    processedAt: record.processedAt ?? null,
    duplicate,
  };
}

function withHeaders(payload: unknown, headers: Record<string, unknown> | null): unknown {
  if (!headers) {
    return payload ?? {};
  }

  return {
    payload: payload ?? {},
    headers,
  };
}

function normalizeInboxEventInput(input: ReceiveInboxEventInput): ReceiveInboxEventInput {
  return {
    sourceSystem: normalizeRequired(input.sourceSystem, 'sourceSystem').toUpperCase(),
    externalEventId: normalizeRequired(input.externalEventId, 'externalEventId'),
    eventType: normalizeRequired(input.eventType, 'eventType'),
    payload: input.payload ?? {},
    headers: input.headers ?? null,
    resourceType: normalizeOptional(input.resourceType),
    resourceId: normalizeOptional(input.resourceId),
  };
}

function normalizeInboxStatus(status: string): InboxEventStatus {
  return Object.values(InboxEventStatus).includes(status as InboxEventStatus)
    ? (status as InboxEventStatus)
    : InboxEventStatus.RECEIVED;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function toRecordOrNull(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function normalizeRequired(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const compacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined) {
      compacted[key] = value;
    }
  }

  return compacted;
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);

  return `{${entries.join(',')}}`;
}

function mergeJsonRecord(
  existing: unknown,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(toRecordOrNull(existing) ?? {}),
    ...extra,
  };
}

interface OutboxPrismaClient extends OutboxTransactionClient {
  $transaction<T>(fn: (client: OutboxTransactionClient) => Promise<T>): Promise<T>;
}

interface OutboxTransactionClient {
  $queryRawUnsafe?<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  outboxEvent: OutboxEventDelegate;
  inboxEvent: InboxEventDelegate;
}

interface OutboxEventDelegate {
  create(args: { data: OutboxEventCreateInput }): Promise<OutboxEventRecord>;
  findFirst(args: { where: OutboxEventWhereInput }): Promise<OutboxEventRecord | null>;
  findMany(args: {
    where: OutboxEventWhereInput;
    orderBy: { createdAt: 'asc' } | { updatedAt: 'desc' };
    take: number;
    skip: number;
  }): Promise<OutboxEventRecord[]>;
  update(args: { where: { id: string }; data: OutboxEventUpdateInput }): Promise<OutboxEventRecord>;
}

interface InboxEventDelegate {
  create(args: { data: InboxEventCreateInput }): Promise<InboxEventRecord>;
  findFirst(args: { where: InboxEventWhereInput }): Promise<InboxEventRecord | null>;
  findMany(args: {
    where: InboxEventWhereInput;
    orderBy: { receivedAt: 'desc' };
    take: number;
    skip: number;
  }): Promise<InboxEventRecord[]>;
  update(args: { where: { id: string }; data: InboxEventUpdateInput }): Promise<InboxEventRecord>;
}

interface OutboxEventCreateInput {
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  status: 'PENDING';
  availableAt: Date;
}

interface OutboxEventUpdateInput {
  sentAt?: Date | null;
  status?: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';
  lastError?: string | null;
  attempts?: number | { increment: number };
  availableAt?: Date;
  payload?: unknown;
}

interface InboxEventCreateInput {
  sourceSystem: string;
  externalEventId: string;
  type: string;
  status: InboxEventStatus;
  payload: unknown;
  headers?: Record<string, unknown> | null;
  resourceType?: string | null;
  resourceId?: string | null;
}

interface InboxEventUpdateInput {
  status?: InboxEventStatus;
  processedAt?: Date;
  resourceType?: string | null;
  resourceId?: string | null;
  lastError?: string | null;
  attempts?: { increment: number };
  headers?: Record<string, unknown>;
}

interface OutboxEventWhereInput {
  id?: string;
  type?: string;
  status?: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'DEAD_LETTER';
  availableAt?: { lte: Date };
}

interface InboxEventWhereInput {
  id?: string;
  sourceSystem?: string | null;
  externalEventId?: string;
  type?: string | null;
  status?: string | null;
}

interface OutboxEventRecord {
  id: string;
  type: string;
  aggregateType?: string | null;
  aggregateId?: string | null;
  payload?: unknown;
  status?: string | null;
  attempts?: number | null;
  lastError?: string | null;
  availableAt?: Date | null;
  sentAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}

interface InboxEventRecord {
  id: string;
  sourceSystem: string;
  externalEventId: string;
  type: string;
  status: string;
  payload?: unknown;
  headers?: unknown;
  resourceType?: string | null;
  resourceId?: string | null;
  attempts?: number | null;
  lastError?: string | null;
  receivedAt: Date;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt?: Date;
}
