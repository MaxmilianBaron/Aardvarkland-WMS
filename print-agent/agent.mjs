import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const agentDir = dirname(fileURLToPath(import.meta.url));
const fileConfig = readConfigFile();
const config = {
  backendUrl: env('AARD_PRINT_BACKEND_URL', fileConfig.backendUrl ?? 'http://localhost:4001/api').replace(/\/$/, ''),
  warehouseId: env('AARD_PRINT_WAREHOUSE', fileConfig.warehouseId ?? 'MAIN'),
  agentCode: env('AARD_PRINT_AGENT_CODE', fileConfig.agentCode ?? 'LOCAL-PRINT-AGENT'),
  token: env('AARD_PRINT_AGENT_TOKEN', fileConfig.token ?? ''),
  intervalMs: numberEnv('AARD_PRINT_INTERVAL_MS', fileConfig.intervalMs ?? 2500),
  limit: numberEnv('AARD_PRINT_CLAIM_LIMIT', fileConfig.limit ?? 1),
  version: '0.1.0',
  hostname: hostname(),
  defaultPrinterCode: env('AARD_PRINT_DEFAULT_PRINTER', fileConfig.defaultPrinterCode ?? ''),
  printers: readPrinterMap(fileConfig.printers ?? {}),
};
config.printerCodes = Object.keys(config.printers).map((code) => code.trim().toUpperCase()).filter(Boolean);

if (!config.token) {
  console.error('AARD_PRINT_AGENT_TOKEN is required.');
  process.exit(1);
}

if (config.token.length < 32) {
  console.error('AARD_PRINT_AGENT_TOKEN must be at least 32 characters.');
  process.exit(1);
}

console.log(`[print-agent] ${config.agentCode} -> ${config.backendUrl} / ${config.warehouseId}`);
runLoop().catch((error) => {
  console.error('[print-agent] fatal error', error);
  process.exit(1);
});

async function runLoop() {
  while (true) {
    try {
      const jobs = await claimJobs();
      for (const job of jobs) {
        await processJob(job);
      }
    } catch (error) {
      console.error('[print-agent] loop error', error instanceof Error ? error.message : error);
    }
    await sleep(config.intervalMs);
  }
}

async function claimJobs() {
  const response = await apiPost(`/warehouses/${encodeURIComponent(config.warehouseId)}/print-agent/jobs/claim`, {
    agentCode: config.agentCode,
    token: config.token,
    limit: config.limit,
    version: config.version,
    hostname: config.hostname,
    printerCodes: config.printerCodes,
    acceptUnassignedJobs: Boolean(config.defaultPrinterCode),
  });

  return Array.isArray(response.jobs) ? response.jobs : [];
}

async function processJob(job) {
  const printerCode = job.printerCode || config.defaultPrinterCode;
  const printer = printerCode ? config.printers[printerCode] : undefined;
  if (!printer) {
    await report(job.id, 'FAILED', `Printer mapping is missing for ${printerCode || 'empty printer code'}`);
    return;
  }

  try {
    await report(job.id, 'PRINTING', '');
    for (let copy = 0; copy < Math.max(1, Number(job.copies ?? 1)); copy += 1) {
      await printZpl(printer, String(job.renderedZpl ?? ''));
    }
    await report(job.id, 'PRINTED', '');
    console.log(`[print-agent] printed ${job.id} on ${printerCode}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report(job.id, 'FAILED', message);
    console.error(`[print-agent] failed ${job.id}: ${message}`);
  }
}

async function printZpl(printer, zpl) {
  const trimmed = zpl.trim();
  if (!trimmed.startsWith('^XA') || !trimmed.endsWith('^XZ')) {
    throw new Error('Rendered ZPL is invalid or empty.');
  }

  if (printer.mode === 'WINDOWS_RAW') {
    await printWindowsRaw(printer, trimmed);
    return;
  }

  await printTcp9100(printer, trimmed);
}

function printTcp9100(printer, zpl) {
  const host = printer.host;
  const port = Number(printer.port ?? 9100);
  if (!host) {
    throw new Error('TCP_9100 printer requires host.');
  }

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port, timeout: 10000 }, () => {
      socket.write(zpl, 'utf8', () => socket.end());
    });
    socket.on('error', reject);
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error(`Printer ${host}:${port} timed out.`));
    });
    socket.on('close', (hadError) => {
      if (!hadError) {
        resolve();
      }
    });
  });
}

function printWindowsRaw(printer, zpl) {
  const printerName = printer.windowsPrinterName || printer.name;
  if (!printerName) {
    throw new Error('WINDOWS_RAW printer requires windowsPrinterName.');
  }

  const helper = join(agentDir, 'windows', 'RawPrinter.ps1');
  const zplBase64 = Buffer.from(zpl, 'utf8').toString('base64');
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helper,
      '-PrinterName',
      printerName,
      '-ZplBase64',
      zplBase64,
    ], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Windows RAW helper exited with code ${code}`));
    });
  });
}

async function report(jobId, status, errorMessage) {
  await apiPost(`/warehouses/${encodeURIComponent(config.warehouseId)}/print-agent/jobs/${encodeURIComponent(jobId)}/result`, {
    agentCode: config.agentCode,
    token: config.token,
    status,
    errorMessage,
  });
}

async function apiPost(path, body) {
  const response = await fetch(`${config.backendUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.error || `HTTP ${response.status}`;
    throw new Error(String(message));
  }

  return payload?.data ?? payload;
}

function readConfigFile() {
  const path = process.env.AARD_PRINT_AGENT_CONFIG || join(agentDir, 'print-agent.config.json');
  if (!existsSync(path)) {
    return {};
  }

  return JSON.parse(readFileSync(path, 'utf8'));
}

function readPrinterMap(filePrinters) {
  const raw = process.env.AARD_PRINT_PRINTERS_JSON;
  if (raw) {
    return JSON.parse(raw);
  }

  return filePrinters;
}

function env(name, fallback) {
  return process.env[name] || fallback;
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
