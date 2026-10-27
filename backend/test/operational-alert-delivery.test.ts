import assert from 'node:assert/strict';
import test from 'node:test';

import { OperationalAlertDeliveryService } from '../src/reliability/operational-alert-delivery.service';
import { OperationalAlertDelivery, OperationalAlertSnapshot } from '../src/reliability';

test('operational alert delivery deduplicates repeated sends', async () => {
  const rows = new Map<string, OperationalAlertDelivery>();
  const service = new OperationalAlertDeliveryService(config({
    OPERATIONAL_ALERT_DELIVERY_ENABLED: true,
    OPERATIONAL_ALERT_CHANNELS: ['log'],
    OPERATIONAL_ALERT_DEDUPE_MINUTES: 15,
    OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE: 'Aardvarkland-WMS',
    OPERATIONAL_ALERT_WEBHOOK_URL: null,
    OPERATIONAL_ALERT_WEBHOOK_SECRET: null,
  }), prisma(rows));

  const snapshot: OperationalAlertSnapshot = {
    status: 'fail',
    generatedAt: new Date().toISOString(),
    alertCount: 1,
    alerts: [{
      key: 'readiness-fail',
      source: 'test',
      severity: 'critical',
      title: 'Readiness failed',
      detail: 'Readiness check failed.',
      action: 'Investigate readiness.',
      detectedAt: new Date().toISOString(),
    }],
  };

  const first = await service.deliverSnapshot(snapshot);
  const second = await service.deliverSnapshot(snapshot);

  assert.equal(first.delivered, 1);
  assert.equal(second.skipped, 1);
  assert.equal(rows.get('readiness-fail|log')?.sentCount, 1);
});

function config(values: Record<string, unknown>) {
  return {
    get: (key: string) => values[key],
  } as never;
}

function prisma(rows: Map<string, OperationalAlertDelivery>) {
  return {
    $queryRawUnsafe: async (sql: string, ...params: unknown[]) => {
      if (sql.includes('WHERE alert_key = $1 AND channel = $2')) {
        const key = `${String(params[0])}|${String(params[1])}`;
        const row = rows.get(key);
        return row ? [toRow(row)] : [];
      }

      if (sql.includes('INSERT INTO operational_alert_deliveries')) {
        const [alertKey, channel, severity, title, detail, lastStatus, dedupeUntil, error] = params;
        const key = `${String(alertKey)}|${String(channel)}`;
        const existing = rows.get(key);
        const now = new Date().toISOString();
        const sent = lastStatus === 'sent';
        const row: OperationalAlertDelivery = {
          alertKey: String(alertKey),
          channel: String(channel),
          severity: severity as OperationalAlertDelivery['severity'],
          title: String(title),
          lastStatus: lastStatus as OperationalAlertDelivery['lastStatus'],
          lastSentAt: sent ? now : existing?.lastSentAt ?? null,
          lastSeenAt: now,
          dedupeUntil: dedupeUntil instanceof Date ? dedupeUntil.toISOString() : existing?.dedupeUntil ?? null,
          sentCount: (existing?.sentCount ?? 0) + (sent ? 1 : 0),
          error: typeof error === 'string' ? error : null,
          updatedAt: now,
        };
        rows.set(key, row);
        return [toRow(row, String(detail))];
      }

      return [];
    },
  } as never;
}

function toRow(row: OperationalAlertDelivery, detail = '') {
  return {
    alert_key: row.alertKey,
    channel: row.channel,
    severity: row.severity,
    title: row.title,
    detail,
    last_status: row.lastStatus,
    last_sent_at: row.lastSentAt,
    last_seen_at: row.lastSeenAt,
    sent_count: row.sentCount,
    dedupe_until: row.dedupeUntil,
    error: row.error,
    updated_at: row.updatedAt,
  };
}
