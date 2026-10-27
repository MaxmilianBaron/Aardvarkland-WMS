import http from 'node:http';
import net from 'node:net';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');
const port = Number(process.env.AARDVARKLAND_LAUNCHER_PORT || 3002);

const checks = [
  { id: 'frontend', label: 'Frontend', port: 4000, url: 'http://localhost:4000' },
  { id: 'backend', label: 'Backend', port: 4001, url: 'http://localhost:4001/api/health' },
  { id: 'database', label: 'PostgreSQL', port: 5432, url: null },
  { id: 'launcher', label: 'Local panel', port, url: `http://localhost:${port}` },
];

const logFiles = [
  ['Backend output', 'backend/backend-local-start.out.log'],
  ['Backend errors', 'backend/backend-local-start.err.log'],
  ['Frontend output', 'frontend/frontend-local-start.out.log'],
  ['Frontend errors', 'frontend/frontend-local-start.err.log'],
  ['Local database output', 'backend/local-postgres-start.out.log'],
  ['Local database errors', 'backend/local-postgres-start.err.log'],
];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function checkPort(targetPort) {
  return new Promise((resolveCheck) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: targetPort });
    const finish = (ok) => {
      socket.destroy();
      resolveCheck(ok);
    };

    socket.setTimeout(700);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function readLog(relativePath) {
  try {
    const fullPath = resolve(rootDir, relativePath);
    const content = await readFile(fullPath, 'utf8');
    return content.slice(-12000);
  } catch {
    return '';
  }
}

async function getStatus() {
  const services = await Promise.all(
    checks.map(async (check) => ({
      ...check,
      running: await checkPort(check.port),
    })),
  );

  const logs = await Promise.all(
    logFiles.map(async ([label, relativePath]) => ({
      label,
      relativePath,
      content: await readLog(relativePath),
    })),
  );

  return {
    updatedAt: new Date().toISOString(),
    services,
    logs,
  };
}

function renderPage() {
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Aardvarkland Local Panel</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, Segoe UI, Arial, sans-serif;
      background: #151719;
      color: #f1f3f4;
    }
    body {
      margin: 0;
      background: #151719;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 18px 24px;
      border-bottom: 1px solid #2a2f35;
      background: #1d2024;
    }
    h1 {
      margin: 0;
      font-size: 22px;
      font-weight: 700;
    }
    main {
      max-width: 1180px;
      margin: 0 auto;
      padding: 22px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    a.button {
      color: #f1f3f4;
      text-decoration: none;
      border: 1px solid #3c4650;
      border-radius: 6px;
      padding: 8px 12px;
      background: #252a30;
      font-size: 14px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 18px;
    }
    .service, .log {
      border: 1px solid #303740;
      border-radius: 8px;
      background: #1d2024;
    }
    .service {
      padding: 14px;
    }
    .label {
      color: #aeb6bf;
      font-size: 13px;
      margin-bottom: 10px;
    }
    .state {
      display: flex;
      align-items: center;
      gap: 9px;
      font-size: 18px;
      font-weight: 700;
    }
    .dot {
      width: 11px;
      height: 11px;
      border-radius: 999px;
      background: #d64545;
    }
    .running .dot {
      background: #2fc06d;
    }
    .logs {
      display: grid;
      gap: 12px;
    }
    .log h2 {
      margin: 0;
      padding: 12px 14px;
      border-bottom: 1px solid #303740;
      color: #d8dde3;
      font-size: 15px;
    }
    pre {
      min-height: 90px;
      max-height: 260px;
      overflow: auto;
      margin: 0;
      padding: 14px;
      color: #d7e0ea;
      font: 12px/1.45 Consolas, Cascadia Mono, monospace;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .muted {
      color: #9aa4ae;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Aardvarkland Local Panel</h1>
      <div class="muted" id="updated">Nacitam stav...</div>
    </div>
    <nav class="actions">
      <a class="button" href="http://localhost:4000" target="_blank" rel="noreferrer">Otevrit aplikaci</a>
      <a class="button" href="http://localhost:4001/api/health" target="_blank" rel="noreferrer">Backend health</a>
    </nav>
  </header>
  <main>
    <section class="grid" id="services"></section>
    <section class="logs" id="logs"></section>
  </main>
  <script>
    const servicesEl = document.getElementById('services');
    const logsEl = document.getElementById('logs');
    const updatedEl = document.getElementById('updated');

    function serviceHtml(service) {
      const state = service.running ? 'Bezi' : 'Ceka';
      return '<article class="service ' + (service.running ? 'running' : '') + '">' +
        '<div class="label">' + service.label + ' : localhost:' + service.port + '</div>' +
        '<div class="state"><span class="dot"></span><span>' + state + '</span></div>' +
      '</article>';
    }

    function logHtml(log) {
      const content = log.content || 'Zatim bez vystupu.';
      return '<article class="log"><h2>' + log.label + '</h2><pre>' +
        content.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])) +
        '</pre></article>';
    }

    async function refresh() {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const data = await response.json();
      servicesEl.innerHTML = data.services.map(serviceHtml).join('');
      logsEl.innerHTML = data.logs.map(logHtml).join('');
      updatedEl.textContent = 'Aktualizovano: ' + new Date(data.updatedAt).toLocaleTimeString();
    }

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`;
}

const server = http.createServer(async (request, response) => {
  if (request.url === '/api/status') {
    const status = await getStatus();
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    response.end(JSON.stringify(status));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(renderPage());
});

server.listen(port, () => {
  process.stdout.write(`[launcher] Aardvarkland Local Panel running on http://localhost:${port}\n`);
});
