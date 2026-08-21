import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const options = parseArgs(process.argv.slice(2));
const timeoutMs = Number(options.timeoutMs ?? 90000);
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
    name: 'aardvark_skladnik_live_process',
    arguments: {
      confirmLiveWrite: true,
      role: String(options.role ?? 'skladnik'),
      process: requiredOption('process'),
      loginName: String(options.loginName ?? ''),
      password: String(options.password ?? 'Mcp-Local-42!'),
      frontendUrl: String(options.frontendUrl ?? 'http://localhost:4000'),
      backendUrl: String(options.backendUrl ?? 'http://localhost:4001/api'),
      language: String(options.language ?? 'cs'),
      viewport: {
        width: Number(options.width ?? 1440),
        height: Number(options.height ?? 960),
      },
      screenshots: options.screenshots !== 'false' && options.screenshots !== false,
      timeoutMs,
      data: parseData(options.data ?? options.dataJson, options.dataFile),
    },
  }, callTimeoutMs);

  const text = response.content?.[0]?.text ?? '{}';
  console.log(text);
  const result = JSON.parse(text);
  process.exitCode = result.ok ? 0 : 1;
} finally {
  child.kill();
}

function requiredOption(name) {
  if (!options[name]) throw new Error(`Missing --${name}`);
  return String(options[name]);
}

function parseData(value, dataFile) {
  if (dataFile) return JSON.parse(readFileSync(String(dataFile), 'utf8'));
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'string') return value;
  return JSON.parse(value);
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
