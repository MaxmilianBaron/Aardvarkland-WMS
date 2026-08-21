import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const host = process.env.AARD_HARDWARE_SIM_UI_HOST ?? '127.0.0.1';
const port = Number(process.env.AARD_HARDWARE_SIM_UI_PORT ?? 3010);

const payloadPresets = {
  LOC: 'AARD1:LOC:MAIN:A-01-01',
  SKU: 'AARD1:SKU:MAIN:ABC123',
  HU: 'AARD1:HU:MAIN:HU0001',
  PARCEL: 'AARD1:PARCEL:MAIN:P0001',
  TASK: 'AARD1:TASK:MAIN:T0001',
  GS1: ']C1010850123456789010LOT-1<GS>17260531',
  RAW: 'RAW-FALLBACK-001',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
    if (request.method === 'GET' && url.pathname === '/healthz') {
      return json(response, 200, { ok: true });
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return html(response, pageHtml());
    }
    if (request.method === 'POST' && url.pathname === '/api/run') {
      const body = await readJson(request);
      const result = await runHardwareSim(body);
      return json(response, 200, result);
    }
    return json(response, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    return json(response, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(`[hardware-sim-ui] http://${host}:${port}`);
});

function runHardwareSim(body) {
  const args = [
    'run-hardware-sim-lab.mjs',
    `--frontend-url=${body.frontendUrl || 'http://localhost:4000'}`,
    `--backend-url=${body.backendUrl || 'http://localhost:4001/api'}`,
    `--warehouse-code=${body.warehouseCode || 'MAIN'}`,
    `--language=${body.language || 'cs'}`,
    `--fake-printer-port=${Number(body.fakePrinterPort || 19100)}`,
    `--render-mode=${body.renderMode || 'offline'}`,
    `--run-scanner=${body.runScanner !== false}`,
    `--run-printer=${body.runPrinter !== false}`,
    `--ensure-rf-task=${body.ensureRfTask !== false}`,
    `--screenshots=${body.screenshots !== false}`,
    `--allow-external-labelary=${body.allowExternalLabelary === true}`,
    `--allow-non-local-targets=${body.allowNonLocalTargets === true}`,
  ];
  if (body.scannerPayloads) {
    args.push(`--scanner-payloads=${JSON.stringify(body.scannerPayloads)}`);
  }

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: here,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('exit', (code) => {
      const parsed = parseLastJson(stdout);
      resolve({
        ok: code === 0 && parsed?.ok !== false,
        exitCode: code,
        result: parsed,
        stdout,
        stderr,
      });
    });
    child.on('error', (error) => {
      resolve({ ok: false, error: error.message, stdout, stderr });
    });
  });
}

function parseLastJson(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const firstBrace = trimmed.indexOf('{');
  if (firstBrace < 0) return null;
  try {
    return JSON.parse(trimmed.slice(firstBrace));
  } catch {
    return null;
  }
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function html(response, body) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(body);
}

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body, null, 2));
}

function pageHtml() {
  return `<!doctype html>
<html lang="cs">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aardvark Hardware Simulator</title>
<style>
:root{font-family:Inter,Segoe UI,Arial,sans-serif;color:#172033;background:#eef1f5}
body{margin:0}
main{max-width:1180px;margin:0 auto;padding:24px;display:grid;gap:16px}
header{display:flex;justify-content:space-between;gap:16px;align-items:center}
h1{font-size:24px;margin:0}
h2{font-size:16px;margin:0 0 12px}
section{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
label{display:grid;gap:6px;font-size:13px;font-weight:700}
input,select,button,textarea{font:inherit}
input,select,textarea{border:1px solid #94a3b8;border-radius:6px;padding:10px;background:#fff}
button{border:0;border-radius:6px;padding:10px 14px;background:#0f766e;color:#fff;font-weight:700;cursor:pointer}
button.secondary{background:#334155}
button:disabled{opacity:.55;cursor:not-allowed}
.row{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
.row label{min-width:180px;flex:1}
.status{min-height:24px;font-weight:700}
.ok{color:#047857}.fail{color:#b91c1c}
pre{white-space:pre-wrap;background:#111827;color:#dbeafe;padding:14px;border-radius:8px;max-height:480px;overflow:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
td,th{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}
@media(max-width:820px){.grid{grid-template-columns:1fr}header{display:block}}
</style>
<main>
  <header>
    <h1>Aardvark Hardware Simulator</h1>
    <div id="status" class="status"></div>
  </header>
  <div class="grid">
    <section>
      <h2>Scanner</h2>
      <div class="row">
        <label>Typ
          <select id="payloadType">${Object.keys(payloadPresets).map((key) => `<option value="${key}">${key}</option>`).join('')}</select>
        </label>
        <label>Terminator
          <select id="terminator"><option value="enter">Enter</option><option value="tab">Tab</option><option value="none">None</option></select>
        </label>
      </div>
      <label>Payload
        <input id="payloadValue" value="${payloadPresets.LOC}">
      </label>
      <div class="row">
        <button id="scanOnly">Scan</button>
        <button class="secondary" id="fullLab">Full lab</button>
      </div>
    </section>
    <section>
      <h2>Printer</h2>
      <div class="row">
        <label>Fake TCP port
          <input id="fakePrinterPort" value="19100" inputmode="numeric">
        </label>
        <label>Render
          <select id="renderMode"><option value="offline">Offline</option><option value="both">Offline + Labelary</option><option value="labelary">Labelary</option></select>
        </label>
      </div>
      <label><span><input id="allowLabelary" type="checkbox"> Labelary external render</span></label>
      <label><span><input id="screenshots" type="checkbox" checked> Screenshots</span></label>
      <label><span><input id="ensureRfTask" type="checkbox" checked> Ensure RF task</span></label>
    </section>
  </div>
  <section>
    <h2>Captured jobs</h2>
    <div id="captures"></div>
  </section>
  <section>
    <h2>Result</h2>
    <pre id="output">{}</pre>
  </section>
</main>
<script>
const presets=${JSON.stringify(payloadPresets)};
const payloadType=document.querySelector('#payloadType');
const payloadValue=document.querySelector('#payloadValue');
payloadType.addEventListener('change',()=>payloadValue.value=presets[payloadType.value]||'');
document.querySelector('#scanOnly').addEventListener('click',()=>runLab(true,false));
document.querySelector('#fullLab').addEventListener('click',()=>runLab(true,true));
async function runLab(runScanner,runPrinter){
  const status=document.querySelector('#status');
  const output=document.querySelector('#output');
  const captures=document.querySelector('#captures');
  status.textContent='Running...';
  status.className='status';
  captures.innerHTML='';
  const body={
    runScanner,
    runPrinter,
    fakePrinterPort:Number(document.querySelector('#fakePrinterPort').value||19100),
    renderMode:document.querySelector('#renderMode').value,
    allowExternalLabelary:document.querySelector('#allowLabelary').checked,
    ensureRfTask:document.querySelector('#ensureRfTask').checked,
    screenshots:document.querySelector('#screenshots').checked,
    scannerPayloads:[{type:payloadType.value,value:payloadValue.value,terminator:document.querySelector('#terminator').value}]
  };
  const response=await fetch('/api/run',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const json=await response.json();
  output.textContent=JSON.stringify(json.result||json,null,2);
  status.textContent=json.ok?'OK':'FAILED';
  status.className='status '+(json.ok?'ok':'fail');
  const rows=(json.result?.printer?.captures||[]).map((capture)=>'<tr><td>'+capture.index+'</td><td>'+capture.bytes+'</td><td>'+(capture.validation?.ok?'rendered':'invalid')+'</td><td>'+capture.filePath+'</td></tr>').join('');
  captures.innerHTML=rows?'<table><thead><tr><th>#</th><th>Bytes</th><th>Status</th><th>ZPL</th></tr></thead><tbody>'+rows+'</tbody></table>':'No captured jobs.';
}
</script>
</html>`;
}
