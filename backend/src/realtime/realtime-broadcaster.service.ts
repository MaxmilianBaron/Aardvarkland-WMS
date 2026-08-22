import { Injectable, MessageEvent, OnModuleDestroy } from '@nestjs/common';
import { finalize, interval, map, merge, Observable, of, Subject } from 'rxjs';
import { randomUUID } from 'node:crypto';

import { PublishRealtimeEventInput, RealtimeEnvelope } from './realtime.types';

const HEARTBEAT_INTERVAL_MS = 30_000;

@Injectable()
export class RealtimeBroadcasterService implements OnModuleDestroy {
  private readonly channels = new Map<string, { subject: Subject<MessageEvent>; subscribers: number }>();

  stream(warehouseReference: string): Observable<MessageEvent> {
    const connectedAt = new Date();
    const channelKey = toWarehouseChannelKey(warehouseReference);
    const channel = this.getChannel(warehouseReference);
    channel.subscribers += 1;

    return merge(
      of(
        toMessageEvent(warehouseReference, {
          type: 'realtime.connected',
          occurredAt: connectedAt,
          data: {
            connectedAt: connectedAt.toISOString(),
          },
        }),
      ),
      channel.subject.asObservable(),
      interval(HEARTBEAT_INTERVAL_MS).pipe(
        map(() =>
          toMessageEvent(warehouseReference, {
            type: 'realtime.heartbeat',
            data: {
              status: 'ok',
            },
          }),
        ),
      ),
    ).pipe(
      finalize(() => {
        const current = this.channels.get(channelKey);
        if (!current) return;
        current.subscribers = Math.max(0, current.subscribers - 1);
        if (current.subscribers === 0) {
          current.subject.complete();
          this.channels.delete(channelKey);
        }
      }),
    );
  }

  publish<TData extends Record<string, unknown>>(
    warehouseReference: string,
    event: PublishRealtimeEventInput<TData>,
  ): void {
    const channel = this.channels.get(toWarehouseChannelKey(warehouseReference));

    if (!channel) {
      return;
    }

    channel.subject.next(toMessageEvent(warehouseReference, event));
  }

  publishMany<TData extends Record<string, unknown>>(
    warehouseReferences: string[],
    event: PublishRealtimeEventInput<TData>,
  ): void {
    const seenChannelKeys = new Set<string>();

    for (const warehouseReference of warehouseReferences) {
      const channelKey = toWarehouseChannelKey(warehouseReference);

      if (seenChannelKeys.has(channelKey)) {
        continue;
      }

      seenChannelKeys.add(channelKey);
      this.publish(warehouseReference, event);
    }
  }

  onModuleDestroy(): void {
    for (const channel of this.channels.values()) {
      channel.subject.complete();
    }

    this.channels.clear();
  }

  private getChannel(warehouseReference: string): { subject: Subject<MessageEvent>; subscribers: number } {
    const channelKey = toWarehouseChannelKey(warehouseReference);
    const existingChannel = this.channels.get(channelKey);

    if (existingChannel) {
      return existingChannel;
    }

    const channel = { subject: new Subject<MessageEvent>(), subscribers: 0 };
    this.channels.set(channelKey, channel);

    return channel;
  }
}

function toMessageEvent<TData extends Record<string, unknown>>(
  warehouseReference: string,
  event: PublishRealtimeEventInput<TData>,
): MessageEvent {
  const eventId = event.id ?? randomUUID();
  const occurredAt = event.occurredAt ?? new Date();
  const envelope: RealtimeEnvelope<TData> = {
    id: eventId,
    warehouseId: event.warehouseId ?? warehouseReference,
    type: event.type,
    occurredAt: occurredAt.toISOString(),
    data: event.data,
  };

  return {
    id: eventId,
    type: event.type,
    data: envelope,
  };
}

function toWarehouseChannelKey(warehouseReference: string): string {
  const normalizedReference = warehouseReference.trim();

  return isUuid(normalizedReference)
    ? normalizedReference.toLowerCase()
    : normalizedReference.toUpperCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
