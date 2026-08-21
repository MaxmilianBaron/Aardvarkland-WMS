import { spawn } from 'node:child_process';

const options = parseArgs(process.argv.slice(2));
const readinessGate = normalizeReadinessGate(options.readinessGate ?? options.gate);
const durationMinutes = readinessGate.durationMinutes ?? Number(options.durationMinutes ?? options.duration ?? 30);
const workerCount = readinessGate.workerCount ?? Number(options.workerCount ?? options.workers ?? 10);
const timeoutMs = Math.max(120000, Math.round((Number.isFinite(durationMinutes) ? durationMinutes : 30) * 60 * 1000) + 900000);

if (options.transport !== 'stdio') {
  const args = [
    'server.mjs',
    '--direct-shift-stress',
    `--duration-minutes=${durationMinutes}`,
    `--worker-count=${String(workerCount)}`,
    `--run-mode=${String(options.runMode ?? options.mode ?? 'persistent')}`,
    `--scenario=${String(options.scenario ?? 'MCP/scenarios/eshop-electro-shift-30m.json')}`,
    `--language=${String(options.language ?? 'cs')}`,
    `--screenshots=${String(options.screenshots !== 'false' && options.screenshots !== false)}`,
    `--audit=${String(options.audit !== 'false' && options.audit !== false)}`,
    `--reload=${String(options.reload !== 'false' && options.reload !== false)}`,
    `--hardware-lab=${String(options.hardwareLab !== 'false' && options.hardwareLab !== false)}`,
    `--reset-database=${String(options.resetDatabase !== 'false' && options.resetDatabase !== false)}`,
    `--readiness-gate=${readinessGate.enabled ? readinessGate.label : 'off'}`,
    `--timeoutMs=${String(Number(options.timeoutMs ?? 90000))}`,
  ];
  const code = await runDirect(args, timeoutMs);
  process.exitCode = code ?? 1;
  process.exit();
}

const child = spawn(process.execPath, ['server.mjs'], {
  cwd: new URL('.', import.meta.url),
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buffer = Buffer.alloc(0);
let nextId = 1;
const pending = new Map();
let childExited = false;
let stderrTail = '';

child.stdout.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  drain();
});

child.stderr.on('data', (chunk) => {
  stderrTail = `${stderrTail}${chunk.toString('utf8')}`;
  if (stderrTail.length > 20000) stderrTail = stderrTail.slice(-20000);
});

child.on('error', (error) => {
  childExited = true;
  rejectPending(error);
});

child.on('exit', (code, signal) => {
  childExited = true;
  const stderrText = stderrTail.trim();
  const suffix = stderrText ? `\n\nMCP server stderr tail:\n${stderrText}` : '';
  rejectPending(new Error(`MCP server exited before responding (code=${code ?? 'null'}, signal=${signal ?? 'null'})${suffix}`));
});

function send(method, params = {}, timeout = 30000) {
  if (childExited) return Promise.reject(new Error('MCP server is not running.'));
  const id = nextId++;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
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
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`, (error) => {
      if (!error) return;
      pending.delete(id);
      clearTimeout(timer);
      reject(error);
    });
  });
}

function rejectPending(error) {
  for (const [id, waiter] of pending.entries()) {
    pending.delete(id);
    waiter.reject(error);
  }
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
    name: 'aardvark_shift_stress_e2e',
    arguments: {
      confirmResetDatabase: 'RESET_LOCAL_WMS_DB',
      confirmStressRun: 'RUN_30_MIN_WMS_SHIFT',
      scenarioPath: String(options.scenario ?? 'MCP/scenarios/eshop-electro-shift-30m.json'),
      language: String(options.language ?? 'cs'),
      durationMinutes,
      workerCount,
      runMode: String(options.runMode ?? options.mode ?? 'persistent'),
      screenshots: options.screenshots !== 'false' && options.screenshots !== false,
      runUiAudit: options.audit !== 'false' && options.audit !== false,
      runReloadJourney: options.reload !== 'false' && options.reload !== false,
      runHardwareLab: options.hardwareLab !== 'false' && options.hardwareLab !== false,
      resetDatabase: options.resetDatabase !== 'false' && options.resetDatabase !== false,
      readinessGate: readinessGate.enabled ? readinessGate.label : 'off',
      timeoutMs: Number(options.timeoutMs ?? 90000),
    },
  }, timeoutMs);

  const text = response.content?.[0]?.text ?? '{}';
  console.log(text);
  const result = JSON.parse(text);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  child.kill();
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

function normalizeReadinessGate(value) {
  const normalized = String(value ?? 'off').trim().toLowerCase();
  if (!normalized || ['off', 'false', '0', 'no', 'none'].includes(normalized)) {
    return { enabled: false, label: 'off' };
  }
  const label = ['60', '60m', '60min', 'software60'].includes(normalized) ? '60m' : '30m';
  return {
    enabled: true,
    label,
    durationMinutes: label === '60m' ? 60 : 30,
    workerCount: 10,
  };
}

function runDirect(args, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: new URL('.', import.meta.url),
      stdio: 'inherit',
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout waiting for direct shift stress run after ${timeout} ms`));
    }, timeout);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}
