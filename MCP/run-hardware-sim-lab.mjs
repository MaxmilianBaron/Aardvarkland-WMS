import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const options = parseArgs(process.argv.slice(2));
const timeoutMs = Number(options.timeoutMs ?? 45000);
const callTimeoutMs = Number(options.callTimeoutMs ?? Math.max(180000, timeoutMs * 4));

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();

child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});

function send(method, params = {}, timeout = 30000) {
  const id = nextId++;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for ${method}`));
    }, timeout);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

function drain() {
  while (buffer.length > 0) {
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString('utf8');
    const match = /content-length:\s*(\d+)/i.exec(header);
    if (!match) return;
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd) return;

    const message = JSON.parse(buffer.subarray(bodyStart, bodyEnd).toString('utf8'));
    buffer = buffer.subarray(bodyEnd);

    const waiter = pending.get(message.id);
    if (!waiter) continue;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  }
}

try {
  await send('initialize', { protocolVersion: '2024-11-05' });
  const response = await send('tools/call', {
    name: 'aardvark_hardware_sim_lab',
    arguments: {
      frontendUrl: String(options.frontendUrl ?? 'http://localhost:4000'),
      backendUrl: String(options.backendUrl ?? 'http://localhost:4001/api'),
      scenarioPath: String(options.scenario ?? options.scenarioPath ?? 'MCP/scenarios/hardware-labels-lite.json'),
      warehouseCode: String(options.warehouseCode ?? 'MAIN'),
      language: String(options.language ?? 'cs'),
      viewport: {
        width: Number(options.width ?? 1440),
        height: Number(options.height ?? 960),
      },
      scannerPayloads: parsePayloads(options.scannerPayloads ?? options.scannerPayloadsJson, options.scannerPayloadsFile),
      runScanner: parseBoolean(options.runScanner, true),
      runPrinter: parseBoolean(options.runPrinter, true),
      ensureRfTask: parseBoolean(options.ensureRfTask, true),
      fakePrinterHost: String(options.fakePrinterHost ?? '127.0.0.1'),
      fakePrinterPort: Number(options.fakePrinterPort ?? 19100),
      failoverFakePrinterPort: Number(options.failoverFakePrinterPort ?? 19102),
      renderMode: String(options.renderMode ?? 'offline'),
      allowExternalLabelary: parseBoolean(options.allowExternalLabelary, false),
      allowNonLocalTargets: parseBoolean(options.allowNonLocalTargets, false),
      reportPrintResult: parseBoolean(options.reportPrintResult, true),
      runMultiPrinterFailover: parseBoolean(options.runMultiPrinterFailover, true),
      screenshots: parseBoolean(options.screenshots, true),
      timeoutMs,
    },
  }, callTimeoutMs);

  const text = response.content?.[0]?.text ?? '{}';
  console.log(text);
  const result = JSON.parse(text);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  child.kill();
}

function parsePayloads(value, filePath) {
  if (filePath) return JSON.parse(readFileSync(String(filePath), 'utf8'));
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  const text = String(value).trim();
  if (!text) return undefined;
  if (text.startsWith('[')) return JSON.parse(text);
  return text.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    parsed[key] = inlineValue ?? args[index + 1] ?? true;
    if (inlineValue === undefined && args[index + 1] && !args[index + 1].startsWith('--')) index += 1;
  }
  return parsed;
}
