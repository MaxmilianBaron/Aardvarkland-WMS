# Aardvarkland Storage System Backend

NestJS API for Aardvarkland Storage System.

## Commands

```powershell
npm ci
npm run prisma:generate
npm run typecheck
npm run lint
npm test
npm run build
```

## Runtime

- Default port: `4001`
- API prefix: `/api`
- Health endpoint: `/api/health`

## Hardening

Production/staging runtime validates and uses these backend hardening settings:

- `AUTH_FAILED_LOGIN_BACKOFF_ENABLED=true` stores failed login state in
  `auth_login_attempts` and temporarily locks repeated failures.
- `JWT_KEY_ID`, `JWT_PREVIOUS_SECRETS`, `MFA_SECRET_ENCRYPTION_KEY_ID`, and
  `MFA_PREVIOUS_SECRET_ENCRYPTION_KEYS` support controlled key rotation.
- `PRIVILEGED_MFA_ENFORCEMENT=block` makes privileged admin and warehouse lead
  routes require an access token with satisfied MFA. Local development defaults
  to `warn`.
- `CARRIER_CREDENTIAL_ENCRYPTION_KEY_ID` and
  `CARRIER_CREDENTIAL_PREVIOUS_ENCRYPTION_KEYS` support carrier credential
  decryption during key rotation.
- `DATABASE_STATEMENT_TIMEOUT_MS` and `DATABASE_LOCK_TIMEOUT_MS` protect the
  API from long-running SQL and stuck locks.
- `STRUCTURED_LOGS_ENABLED=true` writes redacted JSON request logs.
- `INTEGRATION_CIRCUIT_BREAKER_ENABLED=true` protects the backend when external
  integration endpoints repeatedly fail.
- `HEALTH_CONSISTENCY_CHECK_ENABLED` and `HEALTH_CONSISTENCY_MAX_ERRORS` control
  the warehouse consistency readiness check.
- `STARTUP_PREFLIGHT_STRICT` controls whether failed startup preflight checks
  can block staging/production startup.
- `GRACEFUL_SHUTDOWN_TIMEOUT_MS` controls how long shutdown waits for in-flight
  requests before the process exits.
- `RETENTION_CLEANUP_ENABLED`, `RETENTION_CLEANUP_INTERVAL_SECONDS`,
  `RETENTION_CLEANUP_BATCH_SIZE`, and the `RETENTION_*_DAYS` variables control
  automatic cleanup of old terminal operational records.
- `OPERATIONAL_ALERT_DELIVERY_ENABLED`, `OPERATIONAL_ALERT_CHANNELS`,
  `OPERATIONAL_ALERT_DEDUPE_MINUTES`, and optional webhook settings control
  deduplicated operational alert delivery to local log, Windows Event Log,
  SMTP, and webhook channels.
- `SLOW_ROUTE_WARN_MS`, `SLOW_ROUTE_CRITICAL_MS`, and
  `HTTP_5XX_RATE_WARN_PER_MINUTE` control runtime performance alert thresholds.

## Reliability

Startup preflight verifies database reachability, required WMS tables, Prisma
migration history, core permissions, and backup status path setup. Readiness
now reports startup preflight, graceful shutdown drain state, warehouse
consistency, queue worker heartbeat, outbox, print queue, backup status, rate
limit store, and database timeout checks.

Protected operational endpoints are available under
`/api/operations/reliability`:

- `GET /alerts` for normalized monitoring/admin alert snapshots.
- `GET /alerts/deliveries` for deduplicated alert channel state.
- `POST /alerts/deliver` for a manual delivery run through configured channels.
- `GET /incidents` for current reliability incidents.
- `POST /incidents/:incidentKey/acknowledge` and
  `POST /incidents/:incidentKey/resolve` for audited incident lifecycle updates.
- `GET /recovery` for backup and restore drill status.
- `GET /consistency` for repeatable active-warehouse consistency summaries.
- `GET /startup-preflight` for the latest startup preflight snapshot.
- `POST /startup-preflight/refresh` for a manual preflight refresh.
- `GET /retention` for retention cleanup status and dry-run counts.
- `POST /retention/run` for a manual retention cleanup run.
- `GET /shutdown` for the current graceful shutdown drain state.

The database migration `20260525163000_reliability_guardrails` adds guardrail
constraints for invalid stock/reservation/task/print/outbox/dead-letter states,
a uniqueness guard for active verified MFA secrets, and indexes for operational
readiness checks. The migration `20260525190000_job_manage_permission` adds the
`job.manage` system permission used for manual maintenance actions. The
migration `20260525203000_operational_hardening` adds incident lifecycle state,
alert delivery deduplication state, audit export indexes, and extra operational
indexes for readiness checks.

After schema changes, run:

```powershell
npm run prisma:deploy
npm run prisma:generate
```

For a full pre-deploy gate from the workspace root:

```powershell
.\scripts\Invoke-AardvarklandOperationalGate.ps1 -ApplyMigrations
```

Operational guidance lives in `..\docs\backend-reliability.md` and
`..\docs\backend-alerting.md`.

If a privileged local administrator loses MFA access, use the audited local
break-glass procedure from the workspace root:

```powershell
.\scripts\Invoke-AardvarklandMfaBreakGlass.ps1 -UserEmail admin@example.com -Reason "Lost authenticator during pilot"
```

Previous key ring variables use comma-separated values. `JWT_PREVIOUS_SECRETS`
contains raw previous secrets. MFA and carrier previous key variables use
`key-id:secret` entries, for example `mfa-20260501:old-secret`.

## Code Footprint

The repeatable metric is documented in `..\docs\code-footprint-metric.md` and
measured by `..\scripts\Measure-AardvarklandCodeFootprint.ps1`.

As of 2026-05-25:

- Clean product code: about 546 files and 64,501 lines. This counts
  `backend/src` TypeScript, excluding generated Prisma and test/spec files,
  plus `backend/prisma/schema.prisma`.
- Total backend app scope: about 589 files and 70,899 lines. This adds backend
  tests, Prisma migrations, runtime config, scripts, examples, and backend docs.
