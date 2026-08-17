import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = process.env.DEMO_URL || 'http://127.0.0.1:4173/';
const port = Number(process.env.CDP_PORT || 9338);
const profileDir = join(process.env.TEMP || repoRoot, `aardvarkland-demo-verify-${Date.now()}`);

const roles = ['worker', 'manager', 'admin'];
const languages = ['cs', 'en', 'ua'];
const viewports = [
  { name: 'desktop', width: 1440, height: 960, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
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
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
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

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
}

async function prepare(cdp, role, language, view) {
  await evaluate(cdp, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector('[data-role="${role}"]')?.click();
      await wait(40);
      document.querySelector('[data-lang="${language}"]')?.click();
      await wait(40);
      document.querySelector('[data-view="${view}"]')?.click();
      await wait(80);
      window.scrollTo(0, 0);
    })()
  `);
}

async function getVisibleViews(cdp, role, language) {
  return evaluate(cdp, `
    (async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      document.querySelector('[data-role="${role}"]')?.click();
      await wait(40);
      document.querySelector('[data-lang="${language}"]')?.click();
      await wait(40);
      return [...document.querySelectorAll('[data-view]')].map((button) => button.dataset.view);
    })()
  `);
}

async function checkPage(cdp, context) {
  return evaluate(cdp, `
    (() => {
      const context = ${JSON.stringify(context)};
      const issues = [];
      const viewportWidth = document.documentElement.clientWidth;
      const forbidden = {
        cs: [/\\bWorker\\b/, /\\bWarehouse manager\\b/, /\\bSystem admin\\b/, /\\bSample data\\b/, /\\bResult\\b/, /\\bPicking\\b/, /\\bpicking\\b/, /\\btracking\\b/, /\\bworkflow\\b/, /\\bLabel\\b/, /\\bSettings\\b/, /\\bProducts\\b/],
        en: [/Skladník/, /Vedoucí/, /Správce/, /Ukázková/, /Vychystání/, /Zásoby/, /Tiskárny/, /Přehled/],
        ua: [/Skladník/, /Vedoucí/, /Správce/, /\\bWorker\\b/, /\\bWarehouse manager\\b/, /\\bSystem admin\\b/, /\\bSample data\\b/, /\\bResult\\b/, /\\bPicking\\b/, /\\bTracking\\b/, /\\bLabel\\b/, /\\bSettings\\b/],
      };
      const text = document.body.innerText;
      for (const pattern of forbidden[context.language] || []) {
        if (pattern.test(text)) issues.push({ type: 'translation', pattern: String(pattern), text: text.match(pattern)?.[0] || '' });
      }
      if (document.documentElement.scrollWidth > viewportWidth + 1) {
        issues.push({ type: 'page-horizontal-scroll', scrollWidth: document.documentElement.scrollWidth, viewportWidth });
      }
      const elements = [...document.querySelectorAll('body *')].filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        const selector = element.id ? '#' + element.id : element.className ? '.' + String(element.className).trim().split(/\\s+/).join('.') : element.tagName.toLowerCase();
        const inTableWrap = Boolean(element.closest('.table-wrap'));
        if (!inTableWrap && (rect.left < -1 || rect.right > viewportWidth + 1)) {
          issues.push({ type: 'viewport-overflow', selector, left: Math.round(rect.left), right: Math.round(rect.right), viewportWidth });
        }
        if (!inTableWrap && !element.matches('input, textarea') && element.scrollWidth > element.clientWidth + 1) {
          issues.push({ type: 'content-overflow', selector, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, text: element.innerText?.slice(0, 80) || '' });
        }
        if (inTableWrap && element.matches('td, th, .badge') && element.scrollWidth > element.clientWidth + 1) {
          issues.push({ type: 'table-text-overflow', selector, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth, text: element.innerText?.slice(0, 80) || '' });
        }
      }
      return issues.slice(0, 30);
    })()
  `);
}

async function main() {
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
    const failures = [];

    for (const viewport of viewports) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });
      await cdp.send('Page.navigate', { url });
      await waitForReady(cdp);
      await delay(250);

      for (const role of roles) {
        for (const language of languages) {
          const views = [...new Set(await getVisibleViews(cdp, role, language))];
          for (const view of views) {
            await prepare(cdp, role, language, view);
            const issues = await checkPage(cdp, { ...viewport, role, language, view });
            if (issues.length > 0) failures.push({ viewport: viewport.name, role, language, view, issues });
          }
        }
      }
    }

    ws.close();
    if (failures.length > 0) {
      console.error(JSON.stringify(failures, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log('Demo UI verification passed: no horizontal text overflow and no obvious mixed-language labels.');
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
