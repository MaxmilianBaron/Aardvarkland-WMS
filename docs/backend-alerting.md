# Aardvarkland WMS Backend Alerting

Use `/api/health/ready`, `/api/health/startup`, `/api/health/backup`,
`/api/operations/reliability/alerts`,
`/api/operations/reliability/alerts/deliveries`,
`/api/operations/reliability/incidents`,
`/api/operations/reliability/recovery`, and `/api/observability/metrics` as the
primary pilot monitoring signals. The reliability and metrics endpoints require
backend permissions.

## Required Alerts

| Signal | Alert When | Operator Action |
| --- | --- | --- |
| Backend readiness | `/api/health/ready` returns non-2xx or `status=degraded` for 2 minutes | Check database, queue worker, print queue, outbox, backup, and restore drill checks in the payload. |
| Startup preflight | `/api/health/startup` reports degraded, or `/api/operations/reliability/startup-preflight` contains failed checks | Confirm migrations, required tables, seed permissions, database access, and backup status path setup before accepting warehouse traffic. |
| Operational alert snapshot | `/api/operations/reliability/alerts` returns `status=degraded` or `status=fail` | Open the admin `Stabilita` page, check alert severity/source, then use the linked readiness, preflight, queue, or retention payload. |
| Alert channel failure | `/api/operations/reliability/alerts/deliveries` shows `lastStatus=failed` | Check Windows Event Log permissions, webhook URL/secret, and local queue worker logs. |
| Incident not owned | `/api/operations/reliability/incidents` contains active incidents without an acknowledged owner | A system admin or warehouse lead should acknowledge the incident in `Stabilita` and add a short operator note. |
| Warehouse consistency | Readiness `consistency` warns, or `/api/operations/reliability/incidents` contains a consistency incident | Open `/api/operations/reliability/consistency`, inspect affected warehouses, and run targeted inventory/reservation repair only after backup. |
| Graceful shutdown | `/api/operations/reliability/shutdown` shows `draining=true` longer than the configured timeout | Check whether the service is restarting cleanly and whether any clients keep requests open. |
| Database | `database` check fails or `databaseSessionTimeouts` warns | Check Postgres service, locks, long queries, and configured `DATABASE_STATEMENT_TIMEOUT_MS` / `DATABASE_LOCK_TIMEOUT_MS`. |
| HTTP 5xx | `wms_http_requests_total{status_code=~"5.."}` increases for 5 minutes | Open structured logs by `requestId` and inspect the slowest route snapshot. |
| Auth abuse | `rate_limit_blocked_auth_login_total` or `auth.login_backoff_locked` rises above normal | Check source IPs, affected account hashes, and whether a real user is locked out. |
| Queue worker | `queueWorker` readiness warns or `wms_queue_worker_last_seen_age_seconds` exceeds the configured threshold | Restart the queue-worker service before warehouse work continues. |
| Outbox/dead letters | `outbox.failed`, `outbox.deadLetters`, or integration dead letters are above zero | Resolve or replay dead letters after confirming the target integration is healthy. |
| Integration circuit breaker | Dispatch logs contain `Integration circuit is open` | Fix the downstream endpoint, then wait for cooldown or retry manually. |
| Print queue | `printQueue.failed` or expired leases are above zero | Check Print Agent status, printer routing, and failed ZPL payloads. |
| Retention backlog | `/api/operations/reliability/retention` reports old terminal records far above the configured batch size | Run a dry-run first, then let the queue worker or a system admin run bounded cleanup with `job.manage`. |
| Backup | `/api/health/backup` reports stale or failed backup | Run `scripts\Invoke-AardvarklandBackupDrill.ps1 -RestoreDrill`. |
| Restore drill | Restore drill is missing or stale when required | Run a non-production restore drill and verify `/api/health/backup`. |
| Slow routes | `/api/observability/runtime` reports slow or critical slow routes, or alert snapshot contains performance alerts | Review the slowest route, database indexes, recent deploys, and queue pressure. |

## Log Handling

Set `STRUCTURED_LOGS_ENABLED=true` in staging and production. Logs are JSON
records with `requestId`, route, status, duration, actor id, and warehouse
scope. Request bodies are not logged, and sensitive fields such as passwords,
tokens, cookies, API keys, MFA codes, and secrets are redacted when metadata is
logged.

Keep logs on the pilot machine or in the chosen local collector for the agreed
retention period. Do not ship WMS logs to a third-party service until the
customer accepts the data-processing path.

## Backup Drill Schedule

Register a daily Windows scheduled task on the pilot machine:

```powershell
.\scripts\Register-AardvarklandBackupDrillTask.ps1 -At 03:00
```

The task runs `Invoke-AardvarklandBackupDrill.ps1 -RestoreDrill`, writes the
backup manifest, and feeds `/api/health/backup`.

## Local Alert Check

For a pilot workstation without a separate monitoring system, register the
backend alert check task:

```powershell
.\scripts\Register-AardvarklandBackendAlertTask.ps1 -EveryMinutes 5
```

The task runs `Test-AardvarklandBackendAlerts.ps1`, writes
`logs\backend-alert-status.json`, and exits non-zero when startup/readiness or
the protected alert snapshot is degraded or failed.

For backend-managed alert delivery, set:

```env
OPERATIONAL_ALERT_DELIVERY_ENABLED=true
OPERATIONAL_ALERT_CHANNELS=windows-event-log,log
OPERATIONAL_ALERT_DEDUPE_MINUTES=15
```

Optionally add `webhook` to `OPERATIONAL_ALERT_CHANNELS` and configure
`OPERATIONAL_ALERT_WEBHOOK_URL` plus `OPERATIONAL_ALERT_WEBHOOK_SECRET`. The
queue worker attempts delivery roughly once per minute and stores dedupe state
in `operational_alert_deliveries`. Optionally add `smtp` and configure
`OPERATIONAL_ALERT_SMTP_HOST`, `OPERATIONAL_ALERT_SMTP_FROM`,
`OPERATIONAL_ALERT_SMTP_TO`, and the related SMTP port/security credentials.
