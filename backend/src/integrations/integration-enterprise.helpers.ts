import { createHash } from 'node:crypto';

export function normalizeExternalSystemCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '-');
}

export function normalizeResourceType(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

export function buildExternalMappingKey(input: {
  externalSystemId: string;
  resourceType: string;
  externalId: string;
}): string {
  return [input.externalSystemId, normalizeResourceType(input.resourceType), input.externalId.trim()].join(':');
}

export function deadLetterFingerprint(input: {
  endpointId?: string | null;
  outboxEventId?: string | null;
  inboxEventId?: string | null;
  eventType: string;
  errorMessage: string;
}): string {
  return createHash('sha256')
    .update([
      input.endpointId ?? 'no-endpoint',
      input.outboxEventId ?? 'no-outbox',
      input.inboxEventId ?? 'no-inbox',
      normalizeResourceType(input.eventType),
      input.errorMessage.slice(0, 500),
    ].join('|'))
    .digest('hex');
}
