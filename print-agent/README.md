# Aardvarkland Print Agent

Local agent for real ZPL label printing in Aardvarkland WMS.

## V1 Scope

- Claims queued print jobs from the backend.
- Claims only jobs for printers mapped in the local agent config when printer
  routing is configured on the backend.
- Prints ZPL to a network printer over TCP port 9100.
- Prints ZPL through Windows RAW printing by using `windows/RawPrinter.ps1`.
- Can run a local fake TCP 9100 printer for tests without hardware.
- Reports `PRINTED` or `FAILED` back to the backend.
- Never retries forever. Backend `maxAttempts` controls retry count.

## Setup

1. Create a print agent in WMS and keep its generated token. Tokens must be at
   least 32 characters and are stored only as a hash by the backend.
2. Copy `print-agent.config.example.json` to `print-agent.config.json`.
3. Set `backendUrl`, `warehouseId`, `agentCode`, `token`, and printer mappings.
   The mapping keys, such as `PACK-01`, are sent to the backend as the
   agent's served printer codes so multi-printer queues can route safely.
4. Run:

```powershell
npm start
```

The browser is not the production print path. The browser only creates or previews print jobs; this local agent talks to the real printer.

## Hardware-Free Test

Start a fake printer:

```powershell
npm run fake:printer
```

Point a `TCP_9100` printer mapping to `127.0.0.1:9100`. Captured raw ZPL is stored in `print-agent/captures/`; the fake printer reports `OK` only when the payload starts with `^XA` and ends with `^XZ`.

Use the fake printer for local transport checks. Validate the complete RF and
printing workflow with the target scanner and printer before production use.
