# Code Footprint Metric

Use this metric whenever README files, reports, or public copy mention the WMS
backend/frontend code size. Do not mix the two scopes below.

## Command

Run from the workspace root:

```powershell
.\scripts\Measure-AardvarklandCodeFootprint.ps1
```

For machine-readable output:

```powershell
.\scripts\Measure-AardvarklandCodeFootprint.ps1 -Json
```

## Scopes

### Clean Product Code

Use this when discussing how much actual product source code exists.

- Backend clean product code counts `backend/src/**/*.ts`, excluding
  `backend/src/generated/prisma/**` and any `*.test.*` or `*.spec.*` files, plus
  `backend/prisma/schema.prisma`.
- Frontend clean product code counts `frontend/src/**/*.ts`,
  `frontend/src/**/*.tsx`, and `frontend/src/**/*.css`, excluding any
  `*.test.*` or `*.spec.*` files.

### Total App Scope

Use this when discussing the implementation footprint needed to operate and
verify the app.

- Backend total app scope counts backend clean product code plus backend tests,
  Prisma migrations, runtime config, Docker/config examples, PowerShell/batch
  scripts, SQL, Markdown docs, and other text assets under `backend/`.
- Frontend total app scope counts frontend clean product code plus frontend
  config, public text assets, Markdown docs, scripts, HTML/CSS, and other text
  assets under `frontend/`.

## Exclusions

Both scopes exclude dependency folders, build output, generated output,
lockfiles, logs, generated reports, binary assets, model files, and the
generated Prisma client.

Concrete exclusions used by the script:

- directory segments: `node_modules`, `dist`, `build`, `coverage`, `.git`,
  `.vite`, `reports`, `playwright-report`, `test-results`
- files: `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`,
  `pnpm-lock.yaml`, `openapi.json`, `*.log`
- generated Prisma client: `backend/src/generated/prisma/**`

## Latest Snapshot

As of 2026-05-25, after the production-closure pass with RF/PWA shell, frontend
runtime observability, OpenAPI/frontend contract gate, nightly workflow, and
controlled refresh/stale UI states:

| Scope | Files | Lines |
| --- | ---: | ---: |
| Backend clean product code | 550 | 65,345 |
| Backend total app scope | 596 | 71,951 |
| Frontend clean product code | 77 | 15,601 |
| Frontend total app scope | 92 | 16,059 |
| Combined clean product code | 627 | 80,946 |
| Combined total app scope | 688 | 88,010 |

When updating this table, run the script above and copy the values directly.
