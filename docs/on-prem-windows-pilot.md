# Aardvarkland On-Prem Windows Pilot Runbook

This runbook is for the first small WMS pilot: one warehouse manager, about ten
warehouse workers, local scanners, and local ZPL printing through the
Aardvarkland Print Agent.

## Production Secrets

Generate secrets on the pilot machine and copy them into the production
environment file. Do not reuse values from `.env.example` or `docker-compose.yml`.

```powershell
.\scripts\New-AardvarklandProductionSecrets.ps1
```

The backend rejects known `local-*`, `docker-*`, demo, and placeholder values
when `NODE_ENV=production`.

## Docker Pilot Start

Use `docker-compose.yml` for local development only. For a production-like pilot,
copy `backend\.env.production.example` to a private environment file, replace
every generated secret, then start with the production example compose file:

```powershell
docker compose --env-file .\backend\.env.production -f .\docker-compose.prod.example.yml up --build -d
```

The production example binds Postgres, backend, and frontend to `127.0.0.1` by
default. Open firewall ports only when another warehouse workstation really
needs access, and prefer a reverse proxy or VPN for remote access.

When using the production compose file, keep `DATABASE_URL` pointed at the
Compose service hostname `postgres`. Use `localhost` only for a native Windows
service backend running outside Docker.

Before the first production-like startup after backend schema changes, apply
database migrations:

```powershell
cd backend
npm run prisma:deploy
```

The production compose file runs `backend`, `frontend`, and `queue-worker` as
separate restartable services. The backend readiness payload includes the latest
queue-worker heartbeat from the database; for the pilot keep
`HEALTH_REQUIRE_QUEUE_WORKER=true` so a stopped worker is visible before the
shift starts. It also reads `WMS_BACKUP_STATUS_PATH` and reports backup/restore
drill freshness in `/api/health/ready` and `/api/health/backup`. Startup
preflight and reliability guardrails are visible through `/api/health/startup`,
`/api/health/ready`, and the protected `/api/operations/reliability/*`
endpoints. The system administrator UI also exposes these signals under
`Stabilita`.

```powershell
docker compose --env-file .\backend\.env.production -f .\docker-compose.prod.example.yml ps
curl http://127.0.0.1:4001/api/health/startup
curl http://127.0.0.1:4001/api/health/ready
curl http://127.0.0.1:4001/api/health/backup
```

## Backup And Restore Drill

Create a daily backup before the shift and after large imports. The helper below
creates a timestamped `pg_dump` artifact under `.\backups`, records a status
manifest under `.\backend\.runtime\backup-status.json`, and optionally restores
the dump into a non-production check database.

```powershell
.\scripts\Invoke-AardvarklandBackupDrill.ps1 -RestoreDrill
```

On the pilot workstation, register the same drill as a daily scheduled task:

```powershell
.\scripts\Register-AardvarklandBackupDrillTask.ps1 -At 03:00
```

Manual backup commands remain available when the helper is not suitable:

```powershell
docker exec aardvarkland-storage-postgres-prod pg_dump -U aardvarkland -d aardvarkland_storage -Fc -f /tmp/aardvarkland_storage.dump
docker cp aardvarkland-storage-postgres-prod:/tmp/aardvarkland_storage.dump .\backups\aardvarkland_storage.dump
```

Verify restore on a non-production database before the pilot sign-off:

```powershell
docker exec aardvarkland-storage-postgres-prod createdb -U aardvarkland aardvarkland_restore_check
docker cp .\backups\aardvarkland_storage.dump aardvarkland-storage-postgres-prod:/tmp/aardvarkland_storage.dump
docker exec aardvarkland-storage-postgres-prod pg_restore -U aardvarkland -d aardvarkland_restore_check --clean --if-exists /tmp/aardvarkland_storage.dump
```

After a successful drill, verify that readiness sees fresh backup and restore
checks:

```powershell
curl http://127.0.0.1:4001/api/health/backup
```

Pilot acceptance requires a restore check, backend readiness check, Print Agent
restart check, queue-worker restart check, one physical ZPL label print, and
one physical scanner rescan into the WMS UI.

Before physical acceptance, run the complete software gate against the active
local stack. This includes a real database/API scan check, concurrent refresh
token rotation, authenticated realtime invalidation, and the fake-printer
hardware simulation:

```powershell
.\scripts\Invoke-AardvarklandOperationalGate.ps1 -ApplyMigrations -LiveApiE2e
```

## Operational Acceptance Checklist

Keep these items open until they are proven on the pilot machine. Software-only
Software and fake-printer tests are useful rehearsals, but they do not close physical
hardware acceptance.

- [ ] Run `.\scripts\Invoke-AardvarklandBackupDrill.ps1` against a
      non-production restore database and confirm `/api/health/backup` reports a
      fresh backup and restore drill.
- [ ] Install the backend and queue worker with the accepted Windows
      service/restart policy, force a restart, and confirm `/api/health/ready`
      returns healthy afterward.
- [ ] Have the pilot operator accept the alert path from
      `docs\backend-alerting.md`, including who receives Windows Event Log,
      SMTP, or webhook alerts.
- [ ] Perform the physical scanner path: scan a real SKU/location/task value
      into RF, confirm the backend scan result, and verify the UI does not fall
      back to fake data.
- [ ] Perform the physical print path: queue a ZPL label through the local Print
      Agent, print it on the target printer, scan the printed code back into
      Aardvarkland, and attach the result to the pilot report.
- [ ] Review the admin `Stabilita` page after the run and confirm readiness,
      frontend runtime events, print queue, scanner fleet, backup, and restore
      drill states are understandable to the operator.

## Backend Monitoring

Use `docs\backend-alerting.md` for the accepted pilot alert checklist. At
minimum, monitor backend readiness, HTTP 5xx growth, auth backoff locks, queue
worker heartbeat age, outbox/dead letters, print queue failures, and backup or
restore drill staleness. For administrator checks, use the protected reliability
API with a system-admin bearer token and the `metrics.read` permission.

For a Windows pilot without a central monitoring service, register the local
alert check after the backend is reachable:

```powershell
.\scripts\Register-AardvarklandBackendAlertTask.ps1 -EveryMinutes 5
```

Retention cleanup is automatic when `RETENTION_CLEANUP_ENABLED=true` and the
queue worker is running. Manual preview and cleanup are available to system
administrators from the `Stabilita` page and require `job.manage` for writes.

## Print Agent

Create every print agent with a generated token of at least 32 characters. Store
the token only in the local agent configuration. If a token is suspected to be
shared, rotate it in WMS and update the workstation config immediately.

```powershell
cd print-agent
npm run start
```

## Unified Pilot Acceptance

Run the quick software gate during preparation:

```powershell
.\scripts\Invoke-AardvarklandPilotAcceptance.ps1 -Profile quick
```

Run the full pilot gate on the accepted pilot machine:

```powershell
.\scripts\Invoke-AardvarklandPilotAcceptance.ps1 `
  -Profile 30m `
  -RunRestoreDrill `
  -RunWindowsServiceRestart `
  -RequirePhysicalHardware `
  -RequireExternalPenTest
```

Every run writes `pilot-acceptance.json` plus a separate SHA-256 manifest.
Software checks are `PASS` or `FAIL`. Scanner, printer/rescan, external
penetration test, and operator alert acceptance remain `OPEN` until evidence is
provided by the real pilot environment.

The restore drill now compares critical entity counts for warehouses, users,
SKUs, locations, stock, movements, reservations, tasks, outbox events, and audit
logs between the source and restored databases.

## Windows Service And Upgrade Lifecycle

The service installer is documented in `service\README.md`. It creates
automatically restarted WinSW services for backend, queue worker, frontend, and
Print Agent.

Before an upgrade:

```powershell
.\scripts\Test-AardvarklandPilotPreflight.ps1 `
  -RequireAdministrator -RequireWinSw -RequireProductionEnvironment
```

Verified upgrade with rollback:

```powershell
.\scripts\Invoke-AardvarklandUpgrade.ps1 -RestartServices
```

The upgrade helper snapshots current backend/frontend build outputs, runs clean
dependency installs, backend verification, migrations, frontend build, Print
Agent validation, service restart, and readiness checks. A failed upgrade
restores the previous build outputs.
