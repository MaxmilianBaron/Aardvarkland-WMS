# Backend Reliability Guardrails

This document describes the backend reliability layer added on 2026-05-25.
Use it together with `docs/backend-alerting.md` and the on-prem pilot runbook.

## What It Adds

- Startup preflight checks run when the NestJS app boots. They verify database
  reachability, required WMS tables, Prisma migration history, core permission
  seed data, and the configured backup status path parent folder.
- Readiness now includes startup preflight state, warehouse consistency,
  graceful-shutdown drain state, queue worker heartbeat, outbox age, print
  queue state, backup readiness, rate-limit store, and DB session timeouts.
- Graceful shutdown starts draining on application shutdown, keeps health
  endpoints available, and returns `SERVER_DRAINING` for new non-health
  requests while in-flight requests finish.
- A protected reliability API exposes current incidents, repeatable consistency
  summaries, normalized alert snapshots, startup preflight state, retention
  cleanup status, and shutdown drain state for system administrators and
  monitoring.
- Privileged MFA enforcement can block admin and warehouse-lead maintenance
  routes unless the access token records satisfied MFA.
- Alert delivery can send deduplicated operational alerts to local log, Windows
  Event Log, SMTP, and webhook channels. Delivery state is stored so repeated
  checks do not spam operators.
- Incident lifecycle state records who acknowledged or resolved an incident,
  the operator note, timestamps, and audit log entries.
- Recovery status exposes the latest backup artifact, SHA256, size, restore
  target database, restore table count, and stale/missing restore drill state.
- Runtime metrics track slow routes, critical slow routes, and recent 5xx rate
  for performance guardrail alerts.
- Frontend runtime observability accepts redacted browser events for app load,
  JS errors, error-boundary recovery, API failures, blank-screen suspicion,
  PWA/service-worker state, and offline transitions. The in-memory summary is
  exposed through runtime metrics and the admin `Stabilita` page.
- Audit logs can be exported by time/action/user/resource filters and a SHA256
  hash manifest can be generated for tamper-evident review.
- Retention cleanup can run from the queue worker on a configurable interval
  and deletes only old terminal records in bounded batches. Dry-run counts are
  exposed before a manual cleanup is executed.
- Database guardrail constraints reject invalid negative stock/reservation
  quantities, inconsistent completed/printed timestamps, malformed outbox and
  dead-letter states, and duplicate active verified MFA secrets per user.
- Operational indexes were added for outbox, print queue, and integration
  dead-letter checks so readiness and incident panels stay cheap.

## Endpoints

Public health endpoints:

- `GET /api/health/live`
- `GET /api/health/startup`
- `GET /api/health/ready`
- `GET /api/health/backup`

Public browser observability endpoint:

- `POST /api/observability/frontend-events` accepts redacted browser runtime
  events. It is public so login and blank-screen failures can be reported before
  a user has a valid session; the global rate limit and DTO validation still
  apply.

Protected reliability endpoints:

- `GET /api/operations/reliability/alerts` requires `metrics.read`.
- `GET /api/operations/reliability/alerts/deliveries` requires `metrics.read`.
- `POST /api/operations/reliability/alerts/deliver` requires `job.manage`.
- `GET /api/operations/reliability/incidents` requires `metrics.read`.
- `POST /api/operations/reliability/incidents/:incidentKey/acknowledge`
  requires `job.manage`.
- `POST /api/operations/reliability/incidents/:incidentKey/resolve` requires
  `job.manage`.
- `GET /api/operations/reliability/recovery` requires `metrics.read`.
- `GET /api/operations/reliability/consistency` requires `metrics.read`.
- `GET /api/operations/reliability/startup-preflight` requires `metrics.read`.
- `POST /api/operations/reliability/startup-preflight/refresh` requires
  `job.manage`.
- `GET /api/operations/reliability/retention` requires `metrics.read`.
- `POST /api/operations/reliability/retention/run` requires `job.manage`.
- `GET /api/operations/reliability/shutdown` requires `metrics.read`.

## Runtime Flags

- `HEALTH_CONSISTENCY_CHECK_ENABLED` enables warehouse consistency checks in
  readiness. It is `false` in local `.env.example` and `true` in production
  example config.
- `HEALTH_CONSISTENCY_MAX_ERRORS` controls when consistency readiness becomes a
  warning. Production example keeps this at `0`.
- `STARTUP_PREFLIGHT_STRICT` makes failed preflight checks fail startup in
  staging/production. Local development keeps it disabled.
- `GRACEFUL_SHUTDOWN_TIMEOUT_MS` controls how long shutdown waits for in-flight
  requests.
- `RETENTION_CLEANUP_ENABLED` controls whether the queue worker runs retention
  cleanup automatically.
- `RETENTION_CLEANUP_INTERVAL_SECONDS` and `RETENTION_CLEANUP_BATCH_SIZE`
  control cleanup cadence and per-policy batch size.
- `RETENTION_AUDIT_LOG_DAYS`, `RETENTION_AUTH_LOGIN_ATTEMPT_DAYS`,
  `RETENTION_RATE_LIMIT_BUCKET_DAYS`, `RETENTION_REFRESH_SESSION_DAYS`,
  `RETENTION_IDEMPOTENCY_DAYS`, `RETENTION_OUTBOX_SENT_DAYS`,
  `RETENTION_INBOX_TERMINAL_DAYS`, `RETENTION_PRINT_JOB_DAYS`,
  `RETENTION_INTEGRATION_LOG_DAYS`, and
  `RETENTION_INTEGRATION_DEAD_LETTER_DAYS` define how long old terminal rows
  are kept.
- `PRIVILEGED_MFA_ENFORCEMENT` is `block` in production/staging by default and
  `warn` locally.
- `OPERATIONAL_ALERT_DELIVERY_ENABLED`, `OPERATIONAL_ALERT_CHANNELS`,
  `OPERATIONAL_ALERT_DEDUPE_MINUTES`,
  `OPERATIONAL_ALERT_WINDOWS_EVENT_SOURCE`, `OPERATIONAL_ALERT_WEBHOOK_URL`,
  `OPERATIONAL_ALERT_WEBHOOK_SECRET`, and `OPERATIONAL_ALERT_SMTP_*` configure
  local alert delivery.
- `HEALTH_REQUIRE_RESTORE_DRILL` defaults to strict in staging/production.
- `SLOW_ROUTE_WARN_MS`, `SLOW_ROUTE_CRITICAL_MS`, and
  `HTTP_5XX_RATE_WARN_PER_MINUTE` configure performance alert thresholds.

## Deployment Steps

Run migrations before production startup:

```powershell
cd backend
npm run prisma:deploy
npm run prisma:generate
```

Then verify the app:

```powershell
npm run verify
npm run openapi:export
```

Or run the complete gate from the workspace root:

```powershell
.\scripts\Invoke-AardvarklandOperationalGate.ps1 -ApplyMigrations
```

For a running local or pilot stack, check readiness:

```powershell
curl http://127.0.0.1:4001/api/health/startup
curl http://127.0.0.1:4001/api/health/ready
```

Use a system-admin bearer token for the protected reliability API. For local
pilot alert checks:

```powershell
.\scripts\Test-AardvarklandBackendAlerts.ps1
.\scripts\Register-AardvarklandBackendAlertTask.ps1 -EveryMinutes 5
```

If a privileged local administrator loses MFA access, run the audited local
break-glass script on the database host or another shell with `psql` access:

```powershell
.\scripts\Invoke-AardvarklandMfaBreakGlass.ps1 -UserEmail admin@example.com -Reason "Lost authenticator during pilot"
```

## Frontend Scope

These guardrails are backend operational controls. They do not change normal
warehouse worker screens. System administrators can use the frontend
`Stabilita` page to inspect alerts, readiness/startup checks, and retention
cleanup status. It also shows incident ownership/resolution state, recovery
backup/restore details, performance guardrails, and alert delivery state.
Health/readiness remains usable by Docker, scripts, monitoring, and pilot
operators.
