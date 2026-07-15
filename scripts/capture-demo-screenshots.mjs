import { mkdir, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const outputDir = join(repoRoot, 'docs', 'screenshots');
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.env.DEMO_URL || 'https://maxmilianbaron.github.io/Aardvarkland-WMS-Backend-Frontend-Demo/';
const port = Number(process.env.CDP_PORT || 9337);
const profileDir = join(process.env.TEMP || repoRoot, `aardvarkland-demo-cdp-${Date.now()}`);

const shots = [
  { file: 'mcp-style-01-worker-overview-cs.png', role: 'worker', language: 'cs', view: 'rf' },
  { file: 'mcp-style-02-worker-rf-cs.png', role: 'worker', language: 'cs', view: 'tasks' },
  { file: 'mcp-style-03-worker-inventory-cs.png', role: 'worker', language: 'cs', view: 'inventory' },
  { file: 'mcp-style-04-worker-printing-cs.png', role: 'worker', language: 'cs', view: 'print-stations' },
  { file: 'mcp-style-05-manager-overview-cs.png', role: 'manager', language: 'cs', view: 'overview' },
  { file: 'mcp-style-06-manager-integrations-cs.png', role: 'manager', language: 'cs', view: 'integrations' },
  { file: 'mcp-style-07-admin-overview-cs.png', role: 'admin', language: 'cs', view: 'overview' },
  { file: 'mcp-style-08-admin-integrations-en.png', role: 'admin', language: 'en', view: 'integrations' },
  { file: 'mcp-style-09-worker-rf-ua.png', role: 'worker', language: 'ua', view: 'rf' },
  { file: 'mcp-style-10-mobile-worker-overview-cs.png', role: 'worker', language: 'cs', view: 'rf', width: 390, height: 844, mobile: true },
  { file: 'mcp-style-11-manager-control-tower-cs.png', role: 'manager', language: 'cs', view: 'control-tower' },
  { file: 'mcp-style-12-admin-stability-cs.png', role: 'admin', language: 'cs', view: 'reliability' },
  { file: 'mcp-style-en-01-worker-overview.png', role: 'worker', language: 'en', view: 'rf' },
  { file: 'mcp-style-en-02-worker-tasks.png', role: 'worker', language: 'en', view: 'tasks' },
  { file: 'mcp-style-en-03-worker-inventory.png', role: 'worker', language: 'en', view: 'inventory' },
  { file: 'mcp-style-en-04-worker-printing.png', role: 'worker', language: 'en', view: 'print-stations' },
  { file: 'mcp-style-en-05-manager-overview.png', role: 'manager', language: 'en', view: 'overview' },
  { file: 'mcp-style-en-06-manager-control-tower.png', role: 'manager', language: 'en', view: 'control-tower' },
  { file: 'mcp-style-en-07-admin-stability.png', role: 'admin', language: 'en', view: 'reliability' },
  { file: 'mcp-style-en-08-admin-integrations.png', role: 'admin', language: 'en', view: 'integrations' },
  { file: 'mcp-style-en-09-admin-overview.png', role: 'admin', language: 'en', view: 'overview' },
  { file: 'mcp-style-en-10-mobile-worker-overview.png', role: 'worker', language: 'en', view: 'rf', width: 390, height: 844, mobile: true },
];

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
        return;
      }
      pending.resolve(message.result);
    };
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      this.pending.set(id, { resolve: resolvePromise, reject });
    });
  }
}

async function getJson(path) {
  for (let index = 0; index < 40; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      if (response.ok) return response.json();
    } catch {
      await delay(250);
    }
  }
  throw new Error(`CDP endpoint ${path} did not become ready.`);
}

async function waitForReady(cdp) {
  let lastValue = null;
  for (let index = 0; index < 80; index += 1) {
    const result = await cdp.send('Runtime.evaluate', {
      expression: '({ state: document.readyState, hasApp: Boolean(document.querySelector("#nav-list .nav-button") && document.querySelector("#view-root")?.children.length) })',
      returnByValue: true,
    });
    const value = result.result?.value;
    lastValue = value;
    if (value?.hasApp) return;
    await delay(100);
  }
  throw new Error(`Page did not finish loading. Last state: ${JSON.stringify(lastValue)}`);
}

async function prepareState(cdp, shot) {
  const expression = `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector('[data-role="${shot.role}"]')?.click();
      await wait(80);
      document.querySelector('[data-lang="${shot.language}"]')?.click();
      await wait(80);
      document.querySelector('[data-view="${shot.view}"]')?.click();
      await wait(160);
      window.scrollTo(0, 0);
    })()
  `;
  await cdp.send('Runtime.evaluate', { expression, awaitPromise: true });
}

async function capture(cdp, shot) {
  const width = shot.width || 1440;
  const height = shot.height || 960;
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: Boolean(shot.mobile),
  });
  await cdp.send('Page.navigate', { url });
  await delay(800);
  await waitForReady(cdp);
  await delay(300);
  await prepareState(cdp, shot);
  const result = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: true,
  });
  await writeFile(join(outputDir, shot.file), Buffer.from(result.data, 'base64'));
  console.log(`saved docs/screenshots/${shot.file}`);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ], {
    stdio: 'ignore',
    windowsHide: true,
  });

  try {
    const pages = await getJson('/json/list');
    const target = pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl);
    if (!target) throw new Error('No CDP page target was found.');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise, reject) => {
      ws.onopen = resolvePromise;
      ws.onerror = reject;
    });
    const cdp = new Cdp(ws);

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const shot of shots) {
      await capture(cdp, shot);
    }

    ws.close();
  } finally {
    browser.kill();
    await delay(500);
    try {
      await rm(profileDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Could not remove temporary Edge profile: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
