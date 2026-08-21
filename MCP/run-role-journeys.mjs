import { spawn } from 'node:child_process';

const options = parseArgs(process.argv.slice(2));
const roles = parseList(options.roles, ['skladnik', 'vedouci', 'spravce']);
const languages = parseList(options.languages ?? options.language, ['cs', 'en', 'ua', 'fr', 'de', 'es']);
const viewports = parseViewports(options.viewports, [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
]);
const timeoutMs = Number(options.timeoutMs ?? 30000);
const callTimeoutMs = Number(options.callTimeoutMs ?? Math.max(120000, timeoutMs * 4));
const screenshots = options.screenshots !== 'false' && options.screenshots !== false;

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

  const results = [];
  for (const viewport of viewports) {
    for (const language of languages) {
      for (const role of roles) {
        const response = await send('tools/call', {
          name: 'aardvark_role_journey',
          arguments: {
            role,
            language,
            frontendUrl: String(options.frontendUrl ?? 'http://localhost:4000'),
            backendUrl: String(options.backendUrl ?? 'http://localhost:4001/api'),
            password: String(options.password ?? 'Mcp-Local-42!'),
            viewport,
            screenshots,
            timeoutMs,
          },
        }, callTimeoutMs);

        const text = response.content?.[0]?.text ?? '{}';
        const result = JSON.parse(text);
        const overflowCount = Array.isArray(result.routes)
          ? result.routes.reduce((sum, route) => sum + Number(route.overflowCount ?? 0), 0)
          : 0;
        const failures = [...(result.failures ?? [])];
        if (overflowCount > 0 && !failures.some((failure) => String(failure).includes('overflow'))) {
          failures.push(`${overflowCount} visible element(s) overflow their layout`);
        }
        const compact = {
          ok: result.ok === true && overflowCount === 0,
          role,
          language,
          viewport,
          reportPath: result.reportPath,
          failures,
          events: result.events ?? [],
          overflowCount,
        };
        results.push(compact);
        console.log(`${compact.ok ? 'ok' : 'fail'} ${role} ${language} ${viewport.width}x${viewport.height} overflow=${overflowCount}`);
      }
    }
  }

  const summary = {
    ok: results.every((result) => result.ok),
    count: results.length,
    failures: results.filter((result) => !result.ok),
    results,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exitCode = summary.ok ? 0 : 1;
} finally {
  child.kill();
}

function parseList(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseViewports(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value)
    .split(',')
    .map((item) => {
      const match = /^(\d+)x(\d+)$/i.exec(item.trim());
      if (!match) throw new Error(`Invalid viewport "${item}". Use WIDTHxHEIGHT.`);
      return { width: Number(match[1]), height: Number(match[2]) };
    });
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
