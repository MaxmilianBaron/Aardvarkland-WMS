import { config } from '../../app/config';
import { getAccessToken } from '../auth/session';
import { refreshAccessTokenForSession } from './http';

export const WMS_REALTIME_EVENT = 'wms:realtime';

export interface WarehouseRealtimeEvent {
  id?: string;
  type: string;
  data: unknown;
}

export function connectWarehouseRealtime(
  warehouseId: string,
  onEvent: (event: WarehouseRealtimeEvent) => void,
): () => void {
  const controller = new AbortController();
  void runRealtimeLoop(warehouseId, onEvent, controller.signal);
  return () => controller.abort();
}

async function runRealtimeLoop(
  warehouseId: string,
  onEvent: (event: WarehouseRealtimeEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const outcome = await readRealtimeStream(warehouseId, onEvent, signal);
    if (signal.aborted || outcome === 'forbidden') return;
    await abortableDelay(outcome === 'unauthorized' ? 250 : 3000, signal);
  }
}

async function readRealtimeStream(
  warehouseId: string,
  onEvent: (event: WarehouseRealtimeEvent) => void,
  signal: AbortSignal,
): Promise<'closed' | 'unauthorized' | 'forbidden'> {
  const token = getAccessToken();
  if (!token) return 'forbidden';

  try {
    const response = await fetch(
      `${config.apiBaseUrl}/warehouses/${encodeURIComponent(warehouseId)}/realtime/events`,
      {
        headers: {
          Accept: 'text/event-stream',
          Authorization: `Bearer ${token}`,
          'Cache-Control': 'no-cache',
        },
        signal,
      },
    );

    if (response.status === 401) {
      return await refreshAccessTokenForSession() ? 'unauthorized' : 'forbidden';
    }
    if (response.status === 403 || response.status === 404) return 'forbidden';
    if (!response.ok || !response.body) return 'closed';

    await consumeEventStream(response.body, onEvent, signal);
    return 'closed';
  } catch {
    return signal.aborted ? 'forbidden' : 'closed';
  }
}

async function consumeEventStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: WarehouseRealtimeEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!signal.aborted) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');

      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseEventBlock(block);
        if (event) onEvent(event);
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseEventBlock(block: string): WarehouseRealtimeEvent | null {
  let id: string | undefined;
  let type = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('id:')) id = line.slice(3).trim();
    if (line.startsWith('event:')) type = line.slice(6).trim() || type;
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }

  if (dataLines.length === 0) return null;
  const text = dataLines.join('\n');
  try {
    return { id, type, data: JSON.parse(text) };
  } catch {
    return { id, type, data: text };
  }
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = window.setTimeout(resolve, delayMs);
    signal.addEventListener('abort', () => {
      window.clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
