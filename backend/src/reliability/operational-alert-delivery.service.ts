import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { Env } from '../config/env';
import { PrismaService } from '../database';
import {
  OperationalAlert,
  OperationalAlertDelivery,
  OperationalAlertDeliveryResult,
  OperationalAlertSnapshot,
} from './reliability.types';

const execFileAsync = promisify(execFile);
const SMTP_POWERSHELL = `
$ErrorActionPreference = 'Stop'
$recipients = $env:AARD_ALERT_SMTP_TO -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -gt 0 }
$params = @{
  SmtpServer = $env:AARD_ALERT_SMTP_HOST
  Port = [int]$env:AARD_ALERT_SMTP_PORT
  From = $env:AARD_ALERT_SMTP_FROM
  To = $recipients
  Subject = $env:AARD_ALERT_SMTP_SUBJECT
  Body = $env:AARD_ALERT_SMTP_BODY
}
if ($env:AARD_ALERT_SMTP_SECURE -eq 'true') { $params.UseSsl = $true }
if ($env:AARD_ALERT_SMTP_USERNAME) {
  $securePassword = ConvertTo-SecureString $env:AARD_ALERT_SMTP_PASSWORD -AsPlainText -Force
  $params.Credential = New-Object System.Management.Automation.PSCredential($env:AARD_ALERT_SMTP_USERNAME, $securePassword)
}
Send-MailMessage @params
`;

interface AlertDeliveryRow {
  alert_key: string;
  channel: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  last_status: 'sent' | 'skipped' | 'failed';
  last_sent_at: Date | string | null;
  last_seen_at: Date | string;
  sent_count: unknown;
  dedupe_until: Date | string | null;
  error: string | null;
  updated_at: Date | string;
}

interface DeliveryOutcome {
  status: 'sent' | 'skipped' | 'failed';
  error: string | null;
}

@Injectable()
export class OperationalAlertDeliveryService {
  private readonly logger = new Logger(OperationalAlertDeliveryService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {}

  async deliverSnapshot(snapshot: OperationalAlertSnapshot): Promise<OperationalAlertDeliveryResult> {
    const enabled = this.config.get('OPERATIONAL_ALERT_DELIVERY_ENABLED', { infer: true });
    const results: OperationalAlertDelivery[] = [];

    if (!enabled) {
      return {
        generatedAt: new Date().toISOString(),
        enabled,
        delivered: 0,
        skipped: snapshot.alertCount,
        failed: 0,
        results,
      };
    }

    for (const alert of snapshot.alerts) {
      for (const channel of this.config.get('OPERATIONAL_ALERT_CHANNELS', { infer: true })) {
        results.push(await this.deliverAlert(alert, channel));
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      enabled,
      delivered: results.filter((result) => result.lastStatus === 'sent').length,
      skipped: results.filter((result) => result.lastStatus === 'skipped').length,
      failed: results.filter((result) => result.lastStatus === 'failed').length,
      results,
    };
  }

  async listDeliveries(limit = 100): Promise<OperationalAlertDelivery[]> {
    const rows = await this.prisma.$queryRawUnsafe<AlertDeliveryRow[]>(
      `
        SELECT alert_key, channel, severity, title, detail, last_status, last_sent_at,
               last_seen_at, sent_count, dedupe_until, error, updated_at
        FROM operational_alert_deliveries
        ORDER BY updated_at DESC
        LIMIT $1
      `,
      Math.max(1, Math.min(500, Math.trunc(limit))),
    );
    return rows.map(toDelivery);
  }

  private async deliverAlert(alert: OperationalAlert, channel: string): Promise<OperationalAlertDelivery> {
    const existing = await this.findDelivery(alert.key, channel);
    const now = new Date();
    if (existing?.dedupe_until && new Date(existing.dedupe_until).getTime() > now.getTime()) {
      return this.persistDelivery(alert, channel, {
        status: 'skipped',
        error: `Deduplicated until ${new Date(existing.dedupe_until).toISOString()}.`,
      }, existing.dedupe_until);
    }

    const outcome = await this.sendAlert(alert, channel);
    const dedupeUntil = outcome.status === 'sent'
      ? new Date(now.getTime() + this.config.get('OPERATIONAL_ALERT_DEDUPE_MINUTES', { infer: true }) * 60_000)
      : null;
    return this.persistDelivery(alert, channel, outcome, dedupeUntil);
  }

  private async sendAlert(alert: OperationalAlert, channel: string): Promise<DeliveryOutcome> {
    try {
      if (channel === 'log') {
        const message = `${alert.severity.toUpperCase()} ${alert.key}: ${alert.title} - ${alert.detail}`;
        if (alert.severity === 'critical') {
          this.logger.error(message);
        } else {
          this.logger.warn(message);
        }
        return { status: 'sent', error: null };
      }

      if (channel === 'windows-event-log') {
        if (process.platform !== 'win32') {
          return { status: 'skipped', error: 'Windows Event Log channel is available only on Windows.' };
        }
        await execFileAsync('eventcreate', [
          '/L',
          'APPLICATION',
          '/T',
          alert.severity === 'critical' ? 'ERROR' : 'WARNING',
          '/ID',
          alert.severity === 'critical' ? '9101' : '9100',
          '/SO',
          this.config.get('OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE', { infer: true }),
          '/D',
          formatEventLogMessage(alert),
        ], { timeout: 5000, windowsHide: true });
        return { status: 'sent', error: null };
      }

      if (channel === 'webhook') {
        return this.sendWebhook(alert);
      }

      if (channel === 'smtp') {
        return this.sendSmtp(alert);
      }

      return { status: 'failed', error: `Unsupported alert channel: ${channel}` };
    } catch (error: unknown) {
      return {
        status: 'failed',
        error: error instanceof Error ? error.message : 'Alert delivery failed.',
      };
    }
  }

  private async sendWebhook(alert: OperationalAlert): Promise<DeliveryOutcome> {
    const url = this.config.get('OPERATIONAL_ALERT_WEBHOOK_URL', { infer: true });
    if (!url) {
      return { status: 'skipped', error: 'OPERATIONAL_ALERT_WEBHOOK_URL is not configured.' };
    }

    const body = JSON.stringify({
      product: 'Aardvarkland WMS',
      generatedAt: new Date().toISOString(),
      alert,
    });
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': 'aardvarkland-wms-alerts/1.0',
    };
    const secret = this.config.get('OPERATIONAL_ALERT_WEBHOOK_SECRET', { infer: true });
    if (secret) {
      headers['x-aardvarkland-alert-signature'] = createHmac('sha256', secret).update(body).digest('hex');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });
    if (!response.ok) {
      return { status: 'failed', error: `Webhook returned HTTP ${response.status}.` };
    }
    return { status: 'sent', error: null };
  }

  private async sendSmtp(alert: OperationalAlert): Promise<DeliveryOutcome> {
    const host = this.config.get('OPERATIONAL_ALERT_SMTP_HOST', { infer: true });
    const from = this.config.get('OPERATIONAL_ALERT_SMTP_FROM', { infer: true });
    const to = this.config.get('OPERATIONAL_ALERT_SMTP_TO', { infer: true });
    if (!host || !from || !to) {
      return {
        status: 'skipped',
        error: 'SMTP channel requires OPERATIONAL_ALERT_SMTP_HOST, OPERATIONAL_ALERT_SMTP_FROM, and OPERATIONAL_ALERT_SMTP_TO.',
      };
    }
    if (process.platform !== 'win32') {
      return { status: 'skipped', error: 'SMTP channel uses local PowerShell mail delivery on Windows.' };
    }

    await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      SMTP_POWERSHELL,
    ], {
      timeout: 10_000,
      windowsHide: true,
      env: {
        ...process.env,
        AARD_ALERT_SMTP_HOST: host,
        AARD_ALERT_SMTP_PORT: String(this.config.get('OPERATIONAL_ALERT_SMTP_PORT', { infer: true })),
        AARD_ALERT_SMTP_SECURE: String(this.config.get('OPERATIONAL_ALERT_SMTP_SECURE', { infer: true })),
        AARD_ALERT_SMTP_USERNAME: this.config.get('OPERATIONAL_ALERT_SMTP_USERNAME', { infer: true }) ?? '',
        AARD_ALERT_SMTP_PASSWORD: this.config.get('OPERATIONAL_ALERT_SMTP_PASSWORD', { infer: true }) ?? '',
        AARD_ALERT_SMTP_FROM: from,
        AARD_ALERT_SMTP_TO: to,
        AARD_ALERT_SMTP_SUBJECT: `[Aardvarkland WMS] ${alert.severity.toUpperCase()} ${alert.title}`.slice(0, 180),
        AARD_ALERT_SMTP_BODY: formatEventLogMessage(alert),
      },
    });
    return { status: 'sent', error: null };
  }

  private async findDelivery(alertKey: string, channel: string): Promise<AlertDeliveryRow | null> {
    const rows = await this.prisma.$queryRawUnsafe<AlertDeliveryRow[]>(
      `
        SELECT alert_key, channel, severity, title, detail, last_status, last_sent_at,
               last_seen_at, sent_count, dedupe_until, error, updated_at
        FROM operational_alert_deliveries
        WHERE alert_key = $1 AND channel = $2
        LIMIT 1
      `,
      alertKey,
      channel,
    );
    return rows[0] ?? null;
  }

  private async persistDelivery(
    alert: OperationalAlert,
    channel: string,
    outcome: DeliveryOutcome,
    dedupeUntil: Date | string | null,
  ): Promise<OperationalAlertDelivery> {
    const rows = await this.prisma.$queryRawUnsafe<AlertDeliveryRow[]>(
      `
        INSERT INTO operational_alert_deliveries
          (alert_key, channel, severity, title, detail, last_status, last_sent_at,
           last_seen_at, sent_count, dedupe_until, error, updated_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'sent' THEN NOW() ELSE NULL END,
           NOW(), CASE WHEN $6 = 'sent' THEN 1 ELSE 0 END, $7::timestamptz, $8, NOW())
        ON CONFLICT (alert_key, channel) DO UPDATE SET
          severity = EXCLUDED.severity,
          title = EXCLUDED.title,
          detail = EXCLUDED.detail,
          last_status = EXCLUDED.last_status,
          last_sent_at = CASE
            WHEN EXCLUDED.last_status = 'sent' THEN EXCLUDED.last_sent_at
            ELSE operational_alert_deliveries.last_sent_at
          END,
          last_seen_at = EXCLUDED.last_seen_at,
          sent_count = operational_alert_deliveries.sent_count + CASE WHEN EXCLUDED.last_status = 'sent' THEN 1 ELSE 0 END,
          dedupe_until = COALESCE(EXCLUDED.dedupe_until, operational_alert_deliveries.dedupe_until),
          error = EXCLUDED.error,
          updated_at = NOW()
        RETURNING alert_key, channel, severity, title, detail, last_status, last_sent_at,
                  last_seen_at, sent_count, dedupe_until, error, updated_at
      `,
      alert.key,
      channel,
      alert.severity,
      alert.title,
      alert.detail,
      outcome.status,
      dedupeUntil,
      outcome.error,
    );
    return toDelivery(rows[0]);
  }
}

function toDelivery(row: AlertDeliveryRow | undefined): OperationalAlertDelivery {
  if (!row) {
    throw new Error('Alert delivery row was not returned.');
  }
  return {
    alertKey: row.alert_key,
    channel: row.channel,
    severity: row.severity,
    title: row.title,
    lastStatus: row.last_status,
    lastSentAt: toIsoString(row.last_sent_at),
    lastSeenAt: toIsoString(row.last_seen_at) ?? new Date().toISOString(),
    dedupeUntil: toIsoString(row.dedupe_until),
    sentCount: toNumber(row.sent_count),
    error: row.error,
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function formatEventLogMessage(alert: OperationalAlert): string {
  return [
    `Aardvarkland WMS ${alert.severity.toUpperCase()} alert`,
    `Key: ${alert.key}`,
    `Title: ${alert.title}`,
    `Detail: ${alert.detail}`,
    `Action: ${alert.action}`,
  ].join(' | ').slice(0, 3000);
}

function toIsoString(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toNumber(value: unknown): number {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
