# Aardvarkland Storage System Frontend

React UI for Aardvarkland Storage System.

## Commands

```powershell
npm ci
npm run typecheck
npm run build
npm run dev
```

## Runtime

- Default port: `4000`
- Default API base URL: `http://localhost:4001/api`

## Admin Reliability UI

System administrators with `metrics.read` see the `Stabilita` system page. It
shows backend alert snapshots, incident ownership/resolution state, recovery
backup/restore drill status, runtime performance guardrails, readiness/startup
checks, alert delivery state, and retention cleanup status in Czech, English,
Ukrainian, French, German, and Spanish. Manual alert delivery, incident lifecycle updates, startup
preflight refresh, and retention cleanup actions require the backend
`job.manage` permission.

## Code Footprint

The repeatable metric is documented in `..\docs\code-footprint-metric.md` and
measured by `..\scripts\Measure-AardvarklandCodeFootprint.ps1`.

As of 2026-05-25:

- Clean product code: about 73 files and 14,397 lines. This counts
  `frontend/src` TypeScript, TSX, and CSS, excluding test/spec files.
- Total frontend app scope: about 87 files and 14,787 lines. This adds frontend
  config, public text assets, examples, and frontend docs.
