# Aardvarkland Windows Services

The native Windows pilot service installer uses WinSW as the service host.
Place an accepted `winsw.exe` build at `service\winsw.exe`.

Prepare `backend\.env.production`, build backend and frontend, and create
`print-agent\print-agent.config.json`. Then run an elevated PowerShell:

```powershell
.\scripts\Test-AardvarklandPilotPreflight.ps1 `
  -RequireAdministrator -RequireWinSw -RequireProductionEnvironment

.\scripts\Install-AardvarklandWindowsServices.ps1 `
  -Action Install -IncludePrintAgent
```

The installer creates separate automatically restarted services for backend,
queue worker, frontend, and optionally Print Agent. Generated service files and
service logs stay local to the pilot machine.

Use `-WhatIf` to inspect installation without changing Windows:

```powershell
.\scripts\Install-AardvarklandWindowsServices.ps1 `
  -Action Install -IncludePrintAgent -WhatIf
```

Status, restart, and removal:

```powershell
.\scripts\Install-AardvarklandWindowsServices.ps1 -Action Status -IncludePrintAgent
.\scripts\Install-AardvarklandWindowsServices.ps1 -Action Restart -IncludePrintAgent
.\scripts\Install-AardvarklandWindowsServices.ps1 -Action Uninstall -IncludePrintAgent
```
