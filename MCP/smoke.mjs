import { spawn } from 'node:child_process';

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

function send(method, params = {}) {
  const id = nextId++;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => reject(new Error(`Timeout waiting for ${method}`)), 5000);
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
  const init = await send('initialize', { protocolVersion: '2024-11-05' });
  const list = await send('tools/list');
  const toolNames = list.tools.map((tool) => tool.name);

  if (!toolNames.includes('aardvark_role_journey')) {
    throw new Error('Missing aardvark_role_journey tool');
  }
  if (!toolNames.includes('aardvark_shift_stress_e2e')) {
    throw new Error('Missing aardvark_shift_stress_e2e tool');
  }
  if (!toolNames.includes('aardvark_hardware_sim_lab')) {
    throw new Error('Missing aardvark_hardware_sim_lab tool');
  }

  console.log(JSON.stringify({
    ok: true,
    serverInfo: init.serverInfo,
    tools: toolNames,
  }, null, 2));
} finally {
  child.kill();
}
