#!/usr/bin/env node
import { mkdtemp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { closeSync, existsSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createConnection, createServer } from 'node:net';

const mcpRoot = resolve(fileURLToPath(new URL('.', import.meta.url)));
const defaultReportsDir = join(mcpRoot, 'reports');
const frontendTranslationCatalog = loadFrontendTranslationCatalog();

const serverInfo = {
  name: 'aardvarkland-live-frontend-mcp',
  version: '0.1.0',
};

const tools = [
  {
    name: 'aardvark_health_check',
    description: 'Checks frontend, backend, and local console health endpoints as if preparing for a live UI run.',
    inputSchema: {
      type: 'object',
      properties: {
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        backendUrl: { type: 'string', default: 'http://localhost:4001/api' },
        localPanelUrl: { type: 'string', default: 'http://localhost:3002' },
        timeoutMs: { type: 'number', default: 8000 },
      },
    },
  },
  {
    name: 'aardvark_role_journey',
    description: 'Runs a non-destructive browser journey through the frontend as skladnik, vedouci, or spravce and writes a JSON report with screenshots.',
    inputSchema: {
      type: 'object',
      required: ['role'],
      properties: {
        role: { type: 'string', enum: ['skladnik', 'vedouci', 'spravce'] },
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        backendUrl: { type: 'string', default: 'http://localhost:4001/api' },
        loginName: { type: 'string', description: 'Login name. Defaults to a local role-specific env var, then mcp-<role>@aardvarkland.local.' },
        password: { type: 'string', description: 'Password. Prefer passwordEnv for shared configs.' },
        passwordEnv: { type: 'string', description: 'Environment variable containing the password.' },
        language: { type: 'string', enum: ['cs', 'en', 'ua', 'fr', 'de', 'es'], default: 'cs' },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 1440 },
            height: { type: 'number', default: 960 },
          },
        },
        screenshots: { type: 'boolean', default: true },
        allowMutations: { type: 'boolean', default: false },
        timeoutMs: { type: 'number', default: 20000 },
      },
    },
  },
  {
    name: 'aardvark_skladnik_live_process',
    description: 'Runs a real, UI-driven warehouse process as a worker/manager/admin. This writes through the live frontend and requires confirmLiveWrite=true.',
    inputSchema: {
      type: 'object',
      required: ['process', 'confirmLiveWrite'],
      properties: {
        role: { type: 'string', enum: ['skladnik', 'vedouci', 'spravce'], default: 'skladnik' },
        process: {
          type: 'string',
          enum: [
            'inbound_receive',
            'inventory_receive',
            'inventory_move',
            'inventory_adjust',
            'task_claim_start_confirm',
            'rf_scan_expected_steps',
            'packing_scan_and_ship',
            'label_preview_and_queue',
            'print_setup_and_label_queue',
            'outbound_allocate',
            'outbound_release_picking',
            'wave_release',
            'settings_create_user',
          ],
        },
        confirmLiveWrite: {
          type: 'boolean',
          description: 'Must be true. The tool clicks real UI actions that can mutate backend data.',
        },
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        backendUrl: { type: 'string', default: 'http://localhost:4001/api' },
        loginName: { type: 'string' },
        password: { type: 'string' },
        passwordEnv: { type: 'string' },
        language: { type: 'string', enum: ['cs', 'en', 'ua', 'fr', 'de', 'es'], default: 'cs' },
        data: {
          type: 'object',
          description: 'Process values, for example quantity, lineReference, sku, targetLocation, taskReference, scanValues, steps, ship.',
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 1440 },
            height: { type: 'number', default: 960 },
          },
        },
        screenshots: { type: 'boolean', default: true },
        timeoutMs: { type: 'number', default: 30000 },
      },
    },
  },
  {
    name: 'aardvark_full_stack_e2e',
    description: 'Resets the local/staging WMS database, imports the MCP scenario, runs real UI writes, verifies backend state, reload behavior, and terminal queue state.',
    inputSchema: {
      type: 'object',
      required: ['confirmResetDatabase'],
      properties: {
        confirmResetDatabase: {
          type: 'string',
          enum: ['RESET_LOCAL_WMS_DB'],
          description: 'Required safety phrase. This tool resets the local/staging WMS database and refuses production-looking targets.',
        },
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        backendUrl: { type: 'string', default: 'http://localhost:4001/api' },
        scenarioPath: { type: 'string', default: 'MCP/scenarios/eshop-electro-lite.json' },
        language: { type: 'string', enum: ['cs', 'en', 'ua', 'fr', 'de', 'es'], default: 'cs' },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 1440 },
            height: { type: 'number', default: 960 },
          },
        },
        screenshots: { type: 'boolean', default: true },
        resetDatabase: { type: 'boolean', default: true },
        timeoutMs: { type: 'number', default: 45000 },
      },
    },
  },
  {
    name: 'aardvark_shift_stress_e2e',
    description: 'Runs a reset-only realistic e-shop warehouse shift stress test with one manager actor and configurable worker actors, including RF scanner and print queue work.',
    inputSchema: {
      type: 'object',
      required: ['confirmResetDatabase', 'confirmStressRun'],
      properties: {
        confirmResetDatabase: {
          type: 'string',
          enum: ['RESET_LOCAL_WMS_DB'],
          description: 'Required safety phrase. This tool resets the local/staging WMS database and refuses production-looking targets.',
        },
        confirmStressRun: {
          type: 'string',
          enum: ['RUN_30_MIN_WMS_SHIFT'],
          description: 'Required safety phrase acknowledging this is a long-running, write-heavy MCP shift simulation.',
        },
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        backendUrl: { type: 'string', default: 'http://localhost:4001/api' },
        scenarioPath: { type: 'string', default: 'MCP/scenarios/eshop-electro-shift-30m.json' },
        language: { type: 'string', enum: ['cs', 'en', 'ua', 'fr', 'de', 'es'], default: 'cs' },
        durationMinutes: { type: 'number', default: 30 },
        workerCount: { type: 'number', default: 10 },
        runMode: {
          type: 'string',
          enum: ['continuous', 'persistent', 'phased'],
          default: 'persistent',
          description: 'persistent keeps one logged-in browser per actor; continuous starts all worker queues with short-lived sessions; phased keeps the scenario offset schedule.',
        },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 1440 },
            height: { type: 'number', default: 960 },
          },
        },
        screenshots: { type: 'boolean', default: true },
        runUiAudit: { type: 'boolean', default: true },
        runReloadJourney: { type: 'boolean', default: true },
        runHardwareLab: { type: 'boolean', default: true },
        readinessGate: {
          type: 'string',
          enum: ['off', '30m', '60m'],
          default: 'off',
          description: 'Software-only acceptance gate preset. 30m/60m force 1 manager, 10 workers, in-shift fake hardware printing, and multi-printer failover assertions.',
        },
        resetDatabase: { type: 'boolean', default: true },
        timeoutMs: { type: 'number', default: 45000 },
      },
    },
  },
  {
    name: 'aardvark_employee_frontend_audit',
    description: 'Runs an employee-style frontend audit across role routes. It logs in as real roles, waits for live UI/API states, fills visible editable controls with safe test values, and reports button readiness.',
    inputSchema: {
      type: 'object',
      properties: {
        roles: {
          type: 'array',
          items: { type: 'string', enum: ['skladnik', 'vedouci', 'spravce'] },
          description: 'Roles to test. Defaults to all roles.',
        },
        languages: {
          type: 'array',
          items: { type: 'string', enum: ['cs', 'en', 'ua', 'fr', 'de', 'es'] },
          description: 'UI languages to test. Defaults to cs.',
        },
        viewports: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              width: { type: 'number' },
              height: { type: 'number' },
            },
          },
          description: 'Viewport sizes to test. Defaults to 1440x960.',
        },
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        backendUrl: { type: 'string', default: 'http://localhost:4001/api' },
        fillControls: { type: 'boolean', default: true },
        failOnOverflow: { type: 'boolean', default: true },
        screenshots: { type: 'boolean', default: true },
        timeoutMs: { type: 'number', default: 30000 },
      },
    },
  },
  {
    name: 'aardvark_ui_overflow_scan',
    description: 'Opens the frontend in a real browser and reports visible elements where text or content overflows its box.',
    inputSchema: {
      type: 'object',
      properties: {
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 1440 },
            height: { type: 'number', default: 960 },
          },
        },
        timeoutMs: { type: 'number', default: 15000 },
      },
    },
  },
  {
    name: 'aardvark_hardware_sim_lab',
    description: 'Runs the hybrid dev hardware simulator: scanner-like RF input through CDP, backend scan assertions, fake TCP 9100 ZPL capture, optional Labelary preview, and print-agent claim/report flow.',
    inputSchema: {
      type: 'object',
      properties: {
        frontendUrl: { type: 'string', default: 'http://localhost:4000' },
        backendUrl: { type: 'string', default: 'http://localhost:4001/api' },
        scenarioPath: { type: 'string', default: 'MCP/scenarios/hardware-labels-lite.json' },
        warehouseCode: { type: 'string', default: 'MAIN' },
        language: { type: 'string', enum: ['cs', 'en', 'ua', 'fr', 'de', 'es'], default: 'cs' },
        viewport: {
          type: 'object',
          properties: {
            width: { type: 'number', default: 1440 },
            height: { type: 'number', default: 960 },
          },
        },
        scannerPayloads: {
          type: 'array',
          items: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  value: { type: 'string' },
                  terminator: { type: 'string', enum: ['enter', 'tab', 'none'] },
                },
              },
            ],
          },
        },
        runScanner: { type: 'boolean', default: true },
        runPrinter: { type: 'boolean', default: true },
        ensureRfTask: { type: 'boolean', default: true },
        fakePrinterHost: { type: 'string', default: '127.0.0.1' },
        fakePrinterPort: { type: 'number', default: 19100 },
        failoverFakePrinterPort: { type: 'number', default: 19102 },
        renderMode: { type: 'string', enum: ['offline', 'labelary', 'both'], default: 'offline' },
        allowExternalLabelary: { type: 'boolean', default: false },
        allowNonLocalTargets: { type: 'boolean', default: false },
        reportPrintResult: { type: 'boolean', default: true },
        runMultiPrinterFailover: { type: 'boolean', default: true },
        screenshots: { type: 'boolean', default: true },
        timeoutMs: { type: 'number', default: 45000 },
      },
    },
  },
];

const roleProfiles = {
  skladnik: {
    label: 'Skladník',
    envLogin: 'AARDVARK_MCP_SKLADNIK_LOGIN',
    envPassword: 'AARDVARK_MCP_SKLADNIK_PASSWORD',
    expectedMenuCs: ['Skenování', 'Úkoly', 'Příjem', 'Balení', 'Zásoby', 'Lokace', 'Tiskárny'],
    expectedMenuEn: ['Scanning', 'Tasks', 'Receiving', 'Packing', 'Inventory', 'Locations', 'Printers'],
    expectedMenuUa: ['Сканування', 'Завдання', 'Приймання', 'Пакування', 'Запаси', 'Локації', 'Принтери'],
    forbiddenMenuCs: ['Uživatelé', 'Integrace'],
    forbiddenMenuEn: ['Users', 'Integrations'],
    forbiddenMenuUa: ['Користувачі', 'Інтеграції'],
    routes: [
      { hash: '/rf', expectsCs: ['RF skener'], expectsEn: ['RF scanner'], expectsUa: ['RF сканер'] },
      { hash: '/tasks', expectsCs: ['Úkoly'], expectsEn: ['Tasks'], expectsUa: ['Завдання'] },
      { hash: '/inbound', expectsCs: ['Příjem'], expectsEn: ['Receiving'], expectsUa: ['Приймання'] },
      { hash: '/packing', expectsCs: ['Balení'], expectsEn: ['Packing'], expectsUa: ['Пакування'] },
      { hash: '/inventory', expectsCs: ['Zásoby'], expectsEn: ['Inventory'], expectsUa: ['Запаси'] },
      { hash: '/locations', expectsCs: ['Lokace a zaskladnění'], expectsEn: ['Locations and putaway'], expectsUa: ['Локації та розміщення'] },
      { hash: '/print-stations', expectsCs: ['Tisk provozního štítku'], expectsEn: ['Operational label print'], expectsUa: ['Друк робочої етикетки'] },
    ],
  },
  vedouci: {
    label: 'Vedoucí skladu',
    envLogin: 'AARDVARK_MCP_VEDOUCI_LOGIN',
    envPassword: 'AARDVARK_MCP_VEDOUCI_PASSWORD',
    expectedMenuCs: ['Přehled', 'Provoz', 'Objednávky', 'Úkoly', 'Produkty', 'Lokace', 'Příjem', 'Zásoby', 'Inventury', 'Kvalita', 'Balení', 'Doprava', 'Tiskárny', 'Integrace'],
    expectedMenuEn: ['Overview', 'Operations', 'Orders', 'Tasks', 'Products', 'Locations', 'Receiving', 'Inventory', 'Cycle counts', 'Quality', 'Packing', 'Carriers', 'Printers', 'Integrations'],
    expectedMenuUa: ['Огляд', 'Операції', 'Замовлення', 'Завдання', 'Продукти', 'Локації', 'Приймання', 'Запаси', 'Інвентаризації', 'Якість', 'Пакування', 'Доставка', 'Принтери', 'Інтеграції'],
    forbiddenMenuCs: ['Nastavení', 'Uživatelé', 'EDI', 'Fakturace', 'Klientský portál'],
    forbiddenMenuEn: ['Settings', 'Users', 'EDI', 'Billing', 'Client portal'],
    forbiddenMenuUa: ['Налаштування', 'Користувачі', 'EDI', 'Фактурація', 'Клієнтський портал'],
    routes: [
      { hash: '/overview', expectsCs: ['Přehled'], expectsEn: ['Overview'], expectsUa: ['Огляд'] },
      { hash: '/control-tower', expectsCs: ['Provoz'], expectsEn: ['Operations'], expectsUa: ['Операції'] },
      { hash: '/outbound', expectsCs: ['Objednávky'], expectsEn: ['Orders'], expectsUa: ['Замовлення'] },
      { hash: '/tasks', expectsCs: ['Úkoly'], expectsEn: ['Tasks'], expectsUa: ['Завдання'] },
      { hash: '/products', expectsCs: ['Produkty a SKU'], expectsEn: ['Products and SKUs'], expectsUa: ['Продукти та SKU'] },
      { hash: '/locations', expectsCs: ['Lokace a zaskladnění'], expectsEn: ['Locations and putaway'], expectsUa: ['Локації та розміщення'] },
      { hash: '/inbound', expectsCs: ['Příjem'], expectsEn: ['Receiving'], expectsUa: ['Приймання'] },
      { hash: '/inventory', expectsCs: ['Zásoby'], expectsEn: ['Inventory'], expectsUa: ['Запаси'] },
      { hash: '/cycle-counts', expectsCs: ['Inventury'], expectsEn: ['Cycle counts'], expectsUa: ['Інвентаризації'] },
      { hash: '/quality', expectsCs: ['Kvalita a vratky'], expectsEn: ['Quality and returns'], expectsUa: ['Якість і повернення'] },
      { hash: '/packing', expectsCs: ['Balení'], expectsEn: ['Packing'], expectsUa: ['Пакування'] },
      { hash: '/carriers', expectsCs: ['Doprava'], expectsEn: ['Carriers'], expectsUa: ['Доставка'] },
      { hash: '/print-stations', expectsCs: ['Tiskárny'], expectsEn: ['Printers'], expectsUa: ['Принтери'] },
      { hash: '/print-stations', expectsCs: ['Stav skenerů'], expectsEn: ['Scanner health'], expectsUa: ['Стан сканерів'], scrollTextCs: ['Stav skenerů'], scrollTextEn: ['Scanner health'], scrollTextUa: ['Стан сканерів'] },
      { hash: '/integrations', expectsCs: ['Integrace'], expectsEn: ['Integrations'], expectsUa: ['Інтеграції'] },
    ],
  },
  spravce: {
    label: 'Správce',
    envLogin: 'AARDVARK_MCP_SPRAVCE_LOGIN',
    envPassword: 'AARDVARK_MCP_SPRAVCE_PASSWORD',
    expectedMenuCs: ['Nastavení', 'Stabilita', 'Přehled', 'Produkty', 'Lokace', 'Inventury', 'Kvalita', 'Integrace', 'Tiskárny'],
    expectedMenuEn: ['Settings', 'Reliability', 'Overview', 'Products', 'Locations', 'Cycle counts', 'Quality', 'Integrations', 'Printers'],
    expectedMenuUa: ['Налаштування', 'Стабільність', 'Огляд', 'Продукти', 'Локації', 'Інвентаризації', 'Якість', 'Інтеграції', 'Принтери'],
    forbiddenMenuCs: ['Klientský portál', 'Fakturace'],
    forbiddenMenuEn: ['Client portal', 'Billing'],
    forbiddenMenuUa: ['Клієнтський портал', 'Фактурація'],
    routes: [
      { hash: '/settings', expectsCs: ['Nastavení'], expectsEn: ['Settings'], expectsUa: ['Налаштування'] },
      { hash: '/reliability', expectsCs: ['Stabilita', 'Frontend runtime'], expectsEn: ['Reliability', 'Frontend runtime'], expectsUa: ['Стабільність', 'Frontend runtime'] },
      { hash: '/overview', expectsCs: ['Přehled'], expectsEn: ['Overview'], expectsUa: ['Огляд'] },
      { hash: '/products', expectsCs: ['Produkty a SKU'], expectsEn: ['Products and SKUs'], expectsUa: ['Продукти та SKU'] },
      { hash: '/locations', expectsCs: ['Lokace a zaskladnění'], expectsEn: ['Locations and putaway'], expectsUa: ['Локації та розміщення'] },
      { hash: '/cycle-counts', expectsCs: ['Inventury'], expectsEn: ['Cycle counts'], expectsUa: ['Інвентаризації'] },
      { hash: '/quality', expectsCs: ['Kvalita a vratky'], expectsEn: ['Quality and returns'], expectsUa: ['Якість і повернення'] },
      { hash: '/integrations', expectsCs: ['Integrace'], expectsEn: ['Integrations'], expectsUa: ['Інтеграції'] },
      { hash: '/print-stations', expectsCs: ['Tiskárny'], expectsEn: ['Printers'], expectsUa: ['Принтери'] },
      { hash: '/print-stations', expectsCs: ['Stav skenerů'], expectsEn: ['Scanner health'], expectsUa: ['Стан сканерів'], scrollTextCs: ['Stav skenerů'], scrollTextEn: ['Scanner health'], scrollTextUa: ['Стан сканерів'] },
    ],
  },
};

let inputBuffer = Buffer.alloc(0);
const directShiftStress = process.argv.includes('--direct-shift-stress');

if (!directShiftStress) {
  process.stdin.on('data', (chunk) => {
    inputBuffer = Buffer.concat([inputBuffer, chunk]);
    void drainInputBuffer();
  });
}

async function drainInputBuffer() {
  while (inputBuffer.length > 0) {
    const frame = readFrame();
    if (!frame) return;
    await dispatchFrame(frame);
  }
}

function readFrame() {
  const header = findHeader(inputBuffer);

  if (!header) {
    const newlineIndex = inputBuffer.indexOf(0x0a);
    if (newlineIndex === -1) return null;
    const line = inputBuffer.subarray(0, newlineIndex).toString('utf8').trim();
    inputBuffer = inputBuffer.subarray(newlineIndex + 1);
    return line || null;
  }

  const headerText = inputBuffer.subarray(0, header.index).toString('utf8');
  const match = /content-length:\s*(\d+)/i.exec(headerText);
  if (!match) {
    inputBuffer = inputBuffer.subarray(header.index + header.separatorLength);
    return null;
  }

  const contentLength = Number(match[1]);
  const bodyStart = header.index + header.separatorLength;
  const bodyEnd = bodyStart + contentLength;
  if (inputBuffer.length < bodyEnd) return null;

  const body = inputBuffer.subarray(bodyStart, bodyEnd).toString('utf8');
  inputBuffer = inputBuffer.subarray(bodyEnd);
  return body;
}

function findHeader(buffer) {
  const crlf = buffer.indexOf(Buffer.from('\r\n\r\n'));
  if (crlf !== -1) return { index: crlf, separatorLength: 4 };
  const lf = buffer.indexOf(Buffer.from('\n\n'));
  if (lf !== -1) return { index: lf, separatorLength: 2 };
  return null;
}

async function dispatchFrame(frame) {
  let request;
  try {
    request = JSON.parse(frame);
  } catch {
    return;
  }

  const response = await handleRpc(request).catch((error) => ({
    jsonrpc: '2.0',
    id: request.id,
    error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
  }));

  if (response) writeRpc(response);
}

function writeRpc(response) {
  const body = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

async function handleRpc(request) {
  const { id, method, params = {} } = request;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: params.protocolVersion ?? '2024-11-05',
        capabilities: { tools: {} },
        serverInfo,
      },
    };
  }

  if (method === 'notifications/initialized') return null;

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools } };
  }

  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments ?? {};
    const result = await callTool(name, args);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        isError: result.ok === false,
      },
    };
  }

  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unsupported method: ${method}` } };
}

async function callTool(name, args) {
  switch (name) {
    case 'aardvark_health_check':
      return healthCheck(args);
    case 'aardvark_role_journey':
      return roleJourney(args);
    case 'aardvark_skladnik_live_process':
      return liveWarehouseProcess(args);
    case 'aardvark_full_stack_e2e':
      return fullStackE2e(args);
    case 'aardvark_shift_stress_e2e':
      return shiftStressE2e(args);
    case 'aardvark_employee_frontend_audit':
      return employeeFrontendAudit(args);
    case 'aardvark_ui_overflow_scan':
      return overflowScan(args);
    case 'aardvark_hardware_sim_lab':
      return hardwareSimLab(args);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

async function runDirectShiftStress() {
  const options = parseCliArgs(process.argv.slice(2));
  const readinessGate = normalizeShiftReadinessGate(options.readinessGate ?? options.gate);
  const durationMinutes = readinessGate.durationMinutes ?? Number(options.durationMinutes ?? options.duration ?? 30);
  const workerCount = readinessGate.workerCount ?? Number(options.workerCount ?? options.workers ?? 10);
  const compact = parseBooleanOption(options.compact, false);
  const result = await shiftStressE2e({
    confirmResetDatabase: 'RESET_LOCAL_WMS_DB',
    confirmStressRun: 'RUN_30_MIN_WMS_SHIFT',
    frontendUrl: options.frontendUrl,
    backendUrl: options.backendUrl,
    scenarioPath: String(options.scenario ?? options.scenarioPath ?? 'MCP/scenarios/eshop-electro-shift-30m.json'),
    language: String(options.language ?? 'cs'),
    durationMinutes,
    workerCount,
    runMode: String(options.runMode ?? options.mode ?? 'persistent'),
    screenshots: parseBooleanOption(options.screenshots, true),
    runUiAudit: parseBooleanOption(options.audit ?? options.runUiAudit, true),
    runReloadJourney: parseBooleanOption(options.reload ?? options.runReloadJourney, true),
    runHardwareLab: parseBooleanOption(options.hardwareLab ?? options.runHardwareLab, true),
    resetDatabase: parseBooleanOption(options.resetDatabase, true),
    readinessGate: readinessGate.enabled ? readinessGate.label : 'off',
    timeoutMs: Number(options.timeoutMs ?? 90000),
  });
  console.log(JSON.stringify(compact ? compactShiftStressResult(result) : result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

function compactShiftStressResult(result) {
  return {
    ok: result.ok,
    reportPath: result.reportPath,
    screenshotsDir: result.screenshotsDir,
    failures: result.failures,
    backendAssertions: result.backendAssertions,
    readinessAssertions: result.readinessAssertions,
    terminalStateAssertions: result.terminalStateAssertions?.map((item) => ({
      name: item.name,
      ok: item.ok,
      failure: item.failure,
      claimedJobId: item.claimedJobId,
      wrongAgentBlocked: item.wrongAgentBlocked,
      secondaryPrinted: item.secondaryPrinted,
      captureCount: item.captureCount,
    })),
    consoleErrors: result.consoleErrors?.length ?? 0,
    pageErrors: result.pageErrors?.length ?? 0,
    overflowCount: result.overflowCount,
    latency: result.latency,
    snapshots: result.backendSnapshots?.map((snapshot) => ({
      label: snapshot.label,
      ok: snapshot.ok,
      counts: snapshot.counts,
      failures: snapshot.failures,
      invariants: snapshot.invariants ? {
        negativeQuants: snapshot.invariants.negativeQuants,
        overReservedQuants: snapshot.invariants.overReservedQuants,
        inventoryStatus: snapshot.invariants.inventoryConsistency?.status,
        inventoryIssueCount: snapshot.invariants.inventoryConsistency?.issueCount,
      } : undefined,
    })),
  };
}

function parseCliArgs(args) {
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

function parseBooleanOption(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

async function healthCheck(args) {
  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const backendUrl = args.backendUrl ?? 'http://localhost:4001/api';
  const localPanelUrl = args.localPanelUrl ?? 'http://localhost:3002';
  const timeoutMs = args.timeoutMs ?? 8000;
  const checks = await Promise.all([
    httpCheck('frontend', frontendUrl, timeoutMs),
    httpCheck('frontendHealth', new URL('/healthz', frontendUrl).toString(), timeoutMs),
    httpCheck('backendHealth', joinUrl(backendUrl, '/health'), timeoutMs),
    httpCheck('localPanel', localPanelUrl, timeoutMs),
  ]);

  return {
    ok: checks.every((check) => check.ok || check.optional),
    checks,
  };
}

async function roleJourney(args) {
  const role = args.role;
  const profile = roleProfiles[role];
  if (!profile) return { ok: false, error: `Unknown role: ${role}` };

  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const backendUrl = args.backendUrl ?? 'http://localhost:4001/api';
  const timeoutMs = args.timeoutMs ?? 20000;
  const viewport = normalizeViewport(args.viewport);
  const screenshots = args.screenshots !== false;
  const language = normalizeLanguage(args.language);
  const loginTitle = loginTitleForLanguage(language);
  const credentials = resolveCredentials(role, profile, args);
  const loginName = credentials.loginName;
  const password = credentials.password;

  if (!loginName || !password) {
    return {
      ok: false,
      error: `Missing credentials for ${role}. Set loginName/password or ${profile.envLogin}/${profile.envPassword}.`,
    };
  }

  const report = createReport('role-journey', role);
  await mkdir(report.dir, { recursive: true });

  const browser = await launchBrowser({ viewport });
  const page = await browser.newPage();
  const events = [];
  const failures = [];
  const authResponses = [];

  try {
    await page.enable();
    page.onConsole((entry) => {
      if (['error', 'warning'].includes(entry.type)) events.push({ source: 'console', ...entry });
    });
    page.onPageError((entry) => events.push({ source: 'pageError', ...entry }));
    page.onNetworkResponse((entry) => {
      if (entry.url.includes('/auth/login')) authResponses.push(entry);
    });

    await page.navigate(frontendUrl, timeoutMs);
    await clearFrontendAuthSession(page);
    await page.navigate(frontendUrl, timeoutMs);
    await applyUiLanguage(page, language, timeoutMs);
    await page.waitForText(loginTitle, timeoutMs).catch(() => null);
    await page.waitForSelector('input[name="aardvarkland-login-name"]', timeoutMs);
    await page.type('input[name="aardvarkland-login-name"]', loginName);
    await page.type('input[name="aardvarkland-login-password"]', password);
    await page.waitForIdle(120);
    const credentialFields = await page.evaluate((expectedLogin, expectedPassword) => {
      const loginInput = document.querySelector('input[name="aardvarkland-login-name"]');
      const passwordInput = document.querySelector('input[name="aardvarkland-login-password"]');
      return {
        loginMatches: loginInput?.value === expectedLogin,
        passwordMatches: passwordInput?.value === expectedPassword,
        loginLength: loginInput?.value?.length ?? 0,
        passwordLength: passwordInput?.value?.length ?? 0,
      };
    }, loginName, password);
    if (!credentialFields.loginMatches || !credentialFields.passwordMatches) {
      failures.push(`login fields were not filled correctly (loginLength=${credentialFields.loginLength}, passwordLength=${credentialFields.passwordLength})`);
    }
    await page.click('button[type="submit"]');
    const loggedIn = await page.waitForNotText(loginTitle, timeoutMs).then(() => true, () => false);
    await page.waitForIdle(700);

    if (screenshots) await page.screenshot(join(report.dir, '01-after-login.png'));

    if (!loggedIn) {
      const loginText = await page.text();
      const authSummary = authResponses.map((entry) => `${entry.status} ${entry.url}`).join(', ') || 'no auth response';
      failures.push(`login failed or stayed on login page (${authSummary}): ${loginText.slice(0, 240).replace(/\s+/g, ' ')}`);
      const result = {
        ok: false,
        role,
        roleLabel: profile.label,
        language,
        frontendUrl,
        backendUrl,
        reportPath: report.file,
        screenshotsDir: report.dir,
        failures,
        events,
        routes: [],
      };
      await writeJson(report.file, result);
      return result;
    }

    const bodyText = await page.text();
    if (viewport.width >= 900) {
      expectIncludes(bodyText, languageList(profile, 'expectedMenu', language), failures, 'expected menu');
    }
    expectExcludes(bodyText, languageList(profile, 'forbiddenMenu', language), failures, 'forbidden menu');

    const routeResults = [];
    let index = 2;
    for (const route of profile.routes) {
      await page.evaluate((hash) => {
        window.location.hash = hash;
      }, route.hash);
      await page.waitForIdle(700);
      const text = await page.text();
      const routeFailures = [];
      expectIncludes(text, languageList(route, 'expects', language), routeFailures, `route ${route.hash}`);
      const scrollTargets = languageList(route, 'scrollText', language);
      if (scrollTargets.length > 0) {
        await page.evaluate((targets) => {
          const normalizedTargets = targets.map((target) => String(target).toLowerCase());
          const elements = [...document.querySelectorAll('h1, h2, h3, h4, strong, span, p')];
          const match = elements.find((element) => {
            const text = (element.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
            return normalizedTargets.some((target) => text.includes(target));
          });
          match?.scrollIntoView({ block: 'start', inline: 'nearest' });
        }, scrollTargets);
        await page.waitForIdle(400);
      }
      const overflow = await page.detectOverflow(12);
      if (overflow.length > 0) {
        routeFailures.push(`route ${route.hash}: ${overflow.length} visible element(s) overflow their layout`);
      }
      const screenshotPath = screenshots ? join(report.dir, `${String(index).padStart(2, '0')}-${safeFile(route.hash)}.png`) : null;
      if (screenshotPath) await page.screenshot(screenshotPath);
      routeResults.push({
        route: route.hash,
        ok: routeFailures.length === 0,
        failures: routeFailures,
        overflowCount: overflow.length,
        overflow: overflow.slice(0, 5),
        screenshot: screenshotPath,
      });
      failures.push(...routeFailures);
      index += 1;
    }

    if (args.allowMutations === true) {
      events.push({ type: 'info', message: 'allowMutations is true, but no destructive warehouse action is implemented yet. This MCP currently runs safe role journeys only.' });
    }

    const result = {
      ok: failures.length === 0 && !events.some((entry) => entry.source === 'pageError' || entry.type === 'error'),
      role,
      roleLabel: profile.label,
      language,
      frontendUrl,
      backendUrl,
      reportPath: report.file,
      screenshotsDir: report.dir,
      failures,
      events,
      routes: routeResults,
    };
    await writeJson(report.file, result);
    return result;
  } finally {
    await browser.close();
  }
}

async function liveWarehouseProcess(args) {
  if (args.confirmLiveWrite !== true) {
    return {
      ok: false,
      error: 'This tool performs real UI writes. Run it again with confirmLiveWrite=true and explicit test values.',
    };
  }

  const role = args.role ?? 'skladnik';
  const profile = roleProfiles[role];
  if (!profile) return { ok: false, error: `Unknown role: ${role}` };

  const process = args.process;
  const data = { ...(args.data ?? {}) };
  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const backendUrl = args.backendUrl ?? 'http://localhost:4001/api';
  const timeoutMs = args.timeoutMs ?? 30000;
  const viewport = normalizeViewport(args.viewport);
  const screenshots = args.screenshots !== false;
  const language = normalizeLanguage(args.language);
  const credentials = resolveCredentials(role, profile, args);

  if (!credentials.loginName || !credentials.password) {
    return {
      ok: false,
      error: `Missing credentials for ${role}. Set loginName/password or ${profile.envLogin}/${profile.envPassword}.`,
    };
  }

  if (!data.operatorLoginName) data.operatorLoginName = credentials.loginName;
  if (!data.operatorDisplayName) data.operatorDisplayName = displayNameFromMcpLogin(credentials.loginName);

  const report = createReport('live-process', `${role}-${process}`);
  await mkdir(report.dir, { recursive: true });

  const browser = await launchBrowser({ viewport });
  const page = await browser.newPage();
  const events = [];
  const failures = [];
  const steps = [];

  try {
    await page.enable();
    page.onConsole((entry) => {
      if (['error', 'warning'].includes(entry.type)) events.push({ type: 'console', ...entry });
    });
    page.onPageError((entry) => events.push({ type: 'pageError', ...entry }));

    await loginToFrontend(page, {
      frontendUrl,
      loginName: credentials.loginName,
      password: credentials.password,
      language,
      timeoutMs,
      failures,
    });

    if (failures.length === 0) {
      switch (process) {
        case 'inbound_receive':
          await runInboundReceive(page, data, steps, timeoutMs);
          break;
        case 'inventory_receive':
          await runInventoryReceive(page, data, steps, timeoutMs);
          break;
        case 'inventory_move':
          await runInventoryMove(page, data, steps, timeoutMs);
          break;
        case 'inventory_adjust':
          await runInventoryAdjust(page, data, steps, timeoutMs);
          break;
        case 'task_claim_start_confirm':
          await runTaskClaimStartConfirm(page, data, steps, timeoutMs);
          break;
        case 'rf_scan_expected_steps':
          await runRfExpectedSteps(page, data, steps, timeoutMs);
          break;
        case 'packing_scan_and_ship':
          await runPackingScanAndShip(page, data, steps, timeoutMs);
          break;
        case 'label_preview_and_queue':
          await runLabelPreviewAndQueue(page, data, steps, timeoutMs);
          break;
        case 'print_setup_and_label_queue':
          await runPrintSetupAndLabelQueue(page, data, steps, timeoutMs);
          break;
        case 'outbound_allocate':
          await runOutboundAllocate(page, data, steps, timeoutMs);
          break;
        case 'outbound_release_picking':
          await runOutboundReleasePicking(page, data, steps, timeoutMs);
          break;
        case 'wave_release':
          await runWaveRelease(page, data, steps, timeoutMs);
          break;
        case 'settings_create_user':
          await runSettingsCreateUser(page, data, steps, timeoutMs);
          break;
        default:
          failures.push(`Unknown process: ${process}`);
      }
    }

    if (screenshots) await page.screenshot(join(report.dir, 'final.png'));
    const overflow = await page.detectOverflow(20);
    const bodyText = await page.text();
    const idleStep = steps.some((step) => [
      'inbound-idle',
      'inventory-idle',
      'packing-idle',
      'task-no-work-available',
      'rf-idle',
    ].includes(step.action));
    const apiErrors = extractApiErrors(bodyText);
    if (!idleStep) failures.push(...apiErrors);

    const result = {
      ok: failures.length === 0 && events.every((entry) => entry.type !== 'pageError'),
      role,
      roleLabel: profile.label,
      process,
      language,
      frontendUrl,
      backendUrl,
      liveWriteConfirmed: true,
      reportPath: report.file,
      screenshotsDir: report.dir,
      failures,
      events,
      steps,
      overflowCount: overflow.length,
      overflow: overflow.slice(0, 10),
    };
    await writeJson(report.file, result);
    return result;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    if (screenshots) await page.screenshot(join(report.dir, 'error.png')).catch(() => null);
    const result = {
      ok: false,
      role,
      roleLabel: profile.label,
      process,
      language,
      frontendUrl,
      backendUrl,
      liveWriteConfirmed: true,
      reportPath: report.file,
      screenshotsDir: report.dir,
      failures,
      events,
      steps,
    };
    await writeJson(report.file, result);
    return result;
  } finally {
    await browser.close();
  }
}

async function fullStackE2e(args) {
  if (args.confirmResetDatabase !== 'RESET_LOCAL_WMS_DB') {
    return { ok: false, error: 'Missing safety phrase confirmResetDatabase: RESET_LOCAL_WMS_DB.' };
  }

  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const backendUrl = args.backendUrl ?? 'http://localhost:4001/api';
  const timeoutMs = args.timeoutMs ?? 45000;
  const language = normalizeLanguage(args.language);
  const viewport = normalizeViewport(args.viewport);
  const screenshots = args.screenshots !== false;
  const resetDatabase = args.resetDatabase !== false;
  const scenarioPath = resolveScenarioPath(args.scenarioPath ?? 'MCP/scenarios/eshop-electro-lite.json');

  const targetSafety = [
    assertLocalHttpTarget('frontendUrl', frontendUrl),
    assertLocalHttpTarget('backendUrl', backendUrl),
  ];
  const unsafeTarget = targetSafety.find((check) => !check.ok);
  if (unsafeTarget) return { ok: false, error: unsafeTarget.error, targetSafety };

  const report = createReport('full-stack-e2e', language);
  await mkdir(report.dir, { recursive: true });

  const setup = {
    frontendUrl,
    backendUrl,
    language,
    viewport,
    scenarioPath,
    resetDatabase,
    commands: [],
    health: [],
  };
  const uiSteps = [];
  const backendAssertions = [];
  const reloadAssertions = [];
  const terminalOrCleanupAssertions = [];
  const failures = [];

  try {
    const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
    if (resetDatabase) {
      const backendRoot = resolve(mcpRoot, '..', 'backend');
      setup.commands.push(await stopQueueWorkerForMcp(backendRoot, timeoutMs));
      setup.commands.push(await stopBackendForMcp(backendRoot, timeoutMs));
      setup.commands.push(...await ensureLocalDatabaseForMcp(backendRoot, timeoutMs));
      setup.commands.push(await runCommand(process.execPath, ['scripts/reset-mcp-db.mjs'], { cwd: backendRoot, timeoutMs: timeoutMs * 4 }));
      setup.commands.push(await runCommand(process.execPath, ['./node_modules/tsx/dist/cli.mjs', 'scripts/import-mcp-scenario.ts', scenarioPath], { cwd: backendRoot, timeoutMs: timeoutMs * 2 }));
      setup.commands.push(await buildBackendForMcp(backendRoot, timeoutMs));
      setup.commands.push(startBackendForMcp(backendRoot));
      setup.commands.push(startQueueWorkerForMcp(backendRoot));
      failures.push(...setup.commands.filter((command) => !command.ok).map((command) => `${command.command} failed: ${command.error ?? command.output}`));
      if (failures.length > 0) throw new Error('MCP setup failed before UI run.');
    }

    setup.health = await Promise.all([
      httpCheckWithRetry('frontendHealth', new URL('/healthz', frontendUrl).toString(), timeoutMs),
      httpCheckWithRetry('backendHealth', joinUrl(backendUrl, '/health'), timeoutMs, 30),
      httpCheckWithRetry('backendReady', joinUrl(backendUrl, '/health/ready'), timeoutMs, 30),
    ]);
    for (const check of setup.health) {
      if (!check.ok) failures.push(`${check.name} failed: ${check.status || check.error}`);
    }

    const spravceToken = await loginBackendForRole(backendUrl, 'spravce', timeoutMs).catch((error) => {
      failures.push(`backend admin login failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });

    const processes = buildFullStackProcesses(scenario);
    for (const processStep of processes) {
      const run = await liveWarehouseProcess({
        ...processStep,
        confirmLiveWrite: true,
        frontendUrl,
        backendUrl,
        language,
        viewport,
        screenshots,
        timeoutMs,
      });
      uiSteps.push(run);
      if (!run.ok) failures.push(`${processStep.role}/${processStep.process}: ${(run.failures ?? []).join('; ') || 'UI process failed'}`);
      if (run.ok && processStep.process === 'outbound_release_picking' && spravceToken) {
        const taskReferences = await findPickTaskReferencesForOrder(backendUrl, spravceToken, scenario, timeoutMs).catch((error) => {
          failures.push(`pick task lookup failed: ${error instanceof Error ? error.message : String(error)}`);
          return [];
        });
        if (taskReferences.length === 0) {
          failures.push('No order-linked PICK task found after releasing picking.');
        }
        for (const taskReference of taskReferences) {
          const taskRun = await liveWarehouseProcess({
            role: 'skladnik',
            process: 'task_claim_start_confirm',
            data: { taskReference, claim: false, start: true, confirm: true },
            confirmLiveWrite: true,
            frontendUrl,
            backendUrl,
            language,
            viewport,
            screenshots,
            timeoutMs,
          });
          uiSteps.push(taskRun);
          if (!taskRun.ok) failures.push(`skladnik/task_claim_start_confirm:${taskReference}: ${(taskRun.failures ?? []).join('; ') || 'UI process failed'}`);
        }
      }
    }

    if (spravceToken) {
      backendAssertions.push(await assertInboundReceived(backendUrl, spravceToken, scenario, timeoutMs));
      backendAssertions.push(await assertInventoryMoved(backendUrl, spravceToken, scenario, timeoutMs));
      backendAssertions.push(await assertTaskTerminalState(backendUrl, spravceToken, timeoutMs));
      backendAssertions.push(await assertOrderAllocated(backendUrl, spravceToken, scenario, timeoutMs));
      backendAssertions.push(await assertRuntimePrintJobExists(backendUrl, spravceToken, timeoutMs));
      backendAssertions.push(await assertMcpUserExists(backendUrl, spravceToken, timeoutMs));
      failures.push(...backendAssertions.filter((item) => !item.ok).map((item) => item.failure ?? item.name));

      const printResult = await simulatePrintAgent(backendUrl, {
        warehouseCode: scenario?.warehouse?.code ?? 'MAIN',
        agentCode: 'MCP-AGENT-E2E',
        token: 'mcp-agent-token-2026-local-secret',
        timeoutMs,
      });
      terminalOrCleanupAssertions.push(printResult);
      if (!printResult.ok) failures.push(printResult.failure ?? 'print agent simulation failed');
    }

    const reloadRun = await roleJourney({
      role: 'spravce',
      frontendUrl,
      backendUrl,
      language,
      viewport,
      screenshots,
      timeoutMs,
    });
    reloadAssertions.push({
      name: 'spravce_reload_role_journey',
      ok: reloadRun.ok,
      reportPath: reloadRun.reportPath,
      screenshotsDir: reloadRun.screenshotsDir,
      overflowCount: sumOverflow(reloadRun.routes),
      failures: reloadRun.failures,
    });
    if (!reloadRun.ok) failures.push(`reload journey failed: ${(reloadRun.failures ?? []).join('; ')}`);

    const consoleErrors = uiSteps.flatMap((step) => (step.events ?? []).filter((event) => event.type === 'console'));
    const pageErrors = uiSteps.flatMap((step) => (step.events ?? []).filter((event) => event.type === 'pageError'));
    const overflowCount = uiSteps.reduce((sum, step) => sum + Number(step.overflowCount ?? 0), 0) +
      reloadAssertions.reduce((sum, step) => sum + Number(step.overflowCount ?? 0), 0);
    const screenshotsList = uiSteps.flatMap((step) => [step.screenshotsDir].filter(Boolean));

    const result = {
      ok: failures.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0 && overflowCount === 0,
      reportPath: report.file,
      screenshotsDir: report.dir,
      setup,
      uiSteps,
      backendAssertions,
      reloadAssertions,
      terminalOrCleanupAssertions,
      screenshots: screenshotsList,
      consoleErrors,
      pageErrors,
      overflowCount,
      failures,
    };
    await writeJson(report.file, result);
    return result;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    const result = {
      ok: false,
      reportPath: report.file,
      screenshotsDir: report.dir,
      setup,
      uiSteps,
      backendAssertions,
      reloadAssertions,
      terminalOrCleanupAssertions,
      failures,
    };
    await writeJson(report.file, result);
    return result;
  }
}

async function shiftStressE2e(args) {
  if (args.confirmResetDatabase !== 'RESET_LOCAL_WMS_DB') {
    return { ok: false, error: 'Missing safety phrase confirmResetDatabase: RESET_LOCAL_WMS_DB.' };
  }
  if (args.confirmStressRun !== 'RUN_30_MIN_WMS_SHIFT') {
    return { ok: false, error: 'Missing safety phrase confirmStressRun: RUN_30_MIN_WMS_SHIFT.' };
  }

  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const backendUrl = args.backendUrl ?? 'http://localhost:4001/api';
  const timeoutMs = args.timeoutMs ?? 45000;
  const language = normalizeLanguage(args.language);
  const viewport = normalizeViewport(args.viewport);
  const screenshots = args.screenshots !== false;
  const resetDatabase = args.resetDatabase !== false;
  const runUiAudit = args.runUiAudit !== false;
  const runReloadJourney = args.runReloadJourney !== false;
  const readinessGate = normalizeShiftReadinessGate(args.readinessGate ?? args.gate);
  const runHardwareLab = readinessGate.enabled ? true : args.runHardwareLab !== false;
  const durationMinutes = normalizeShiftDurationMinutes(readinessGate.durationMinutes ?? args.durationMinutes);
  const durationMs = Math.round(durationMinutes * 60 * 1000);
  const runMode = normalizeShiftRunMode(args.runMode);
  const scenarioPath = resolveScenarioPath(args.scenarioPath ?? 'MCP/scenarios/eshop-electro-shift-30m.json');

  const targetSafety = [
    assertLocalHttpTarget('frontendUrl', frontendUrl),
    assertLocalHttpTarget('backendUrl', backendUrl),
  ];
  const unsafeTarget = targetSafety.find((check) => !check.ok);
  if (unsafeTarget) return { ok: false, error: unsafeTarget.error, targetSafety };

  const report = createReport('shift-stress-e2e', `${language}-${runMode}-${durationMinutes}m`);
  await mkdir(report.dir, { recursive: true });

  const setup = {
    frontendUrl,
    backendUrl,
    language,
    viewport,
    scenarioPath,
    resetDatabase,
    durationMinutes,
    runMode,
    readinessGate: readinessGate.enabled ? {
      enabled: true,
      label: readinessGate.label,
      expectedDurationMinutes: readinessGate.durationMinutes,
      expectedManagerCount: readinessGate.managerCount,
      expectedWorkerCount: readinessGate.workerCount,
      requiresInShiftHardware: readinessGate.requireInShiftHardware,
      requiresMultiPrinterFailover: readinessGate.requireMultiPrinterFailover,
    } : { enabled: false },
    commands: [],
    health: [],
    healthTimeline: [],
    actorCredentials: [],
  };
  const managerTimeline = [];
  const workerTimelines = {};
  const backendSnapshots = [];
  const backendAssertions = [];
  const reloadAssertions = [];
  const terminalStateAssertions = [];
  const readinessAssertions = [];
  const phaseResults = [];
  const failures = [];
  let infrastructureFailed = false;

  try {
    const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
    const runHardwareInShift = shouldRunShiftHardwareInOperation(scenario, runHardwareLab);
    const runFinalHardwareLab = shouldRunFinalHardwareLab(scenario, runHardwareLab);
    const workerCount = normalizeShiftWorkerCount(readinessGate.workerCount ?? args.workerCount ?? scenario?.mcpShift?.workerCount ?? 10);
    const actors = resolveShiftActors(scenario, workerCount);
    const phases = resolveShiftPhases(scenario);
    const publicActors = Object.fromEntries(Object.entries(actors).map(([key, actor]) => [key, {
      role: actor.role,
      loginName: actor.loginName,
      label: actor.label,
    }]));

    if (resetDatabase) {
      const backendRoot = resolve(mcpRoot, '..', 'backend');
      setup.commands.push(await stopQueueWorkerForMcp(backendRoot, timeoutMs));
      setup.commands.push(await stopBackendForMcp(backendRoot, timeoutMs));
      setup.commands.push(...await ensureLocalDatabaseForMcp(backendRoot, timeoutMs));
      setup.commands.push(await runCommand(process.execPath, ['scripts/reset-mcp-db.mjs'], { cwd: backendRoot, timeoutMs: timeoutMs * 4 }));
      setup.commands.push(await runCommand(process.execPath, ['./node_modules/tsx/dist/cli.mjs', 'scripts/import-mcp-scenario.ts', scenarioPath], { cwd: backendRoot, timeoutMs: timeoutMs * 2 }));
      setup.commands.push(await buildBackendForMcp(backendRoot, timeoutMs));
      setup.commands.push(startBackendForMcp(backendRoot));
      setup.commands.push(startQueueWorkerForMcp(backendRoot));
      failures.push(...setup.commands.filter((command) => !command.ok).map((command) => `${command.command} failed: ${command.error ?? command.output}`));
      if (failures.length > 0) throw new Error('MCP shift setup failed before UI run.');
    }

    setup.health = await Promise.all([
      httpCheckWithRetry('frontendHealth', new URL('/healthz', frontendUrl).toString(), timeoutMs),
      httpCheckWithRetry('backendHealth', joinUrl(backendUrl, '/health'), timeoutMs, 30),
      httpCheckWithRetry('backendReady', joinUrl(backendUrl, '/health/ready'), timeoutMs, 30),
    ]);
    for (const check of setup.health) {
      if (!check.ok) failures.push(`${check.name} failed: ${check.status || check.error}`);
    }
    if (setup.health.some((check) => !check.ok)) {
      infrastructureFailed = true;
      throw new Error('MCP shift health check failed before UI run.');
    }

    setup.actorCredentials = await validateShiftActorCredentials(backendUrl, actors, timeoutMs);
    if (runHardwareInShift) {
      const adminToken = await loginBackendForActor(backendUrl, actors.admin, timeoutMs);
      setup.scannerDevice = await ensureHardwareScanner(
        backendUrl,
        String(scenario?.mcpShift?.warehouseCode ?? scenario?.warehouse?.code ?? 'MAIN'),
        adminToken,
        timeoutMs,
      );
    }
    setup.workerCount = shiftWorkerKeysFromActors(actors).length;
    setup.runHardwareLab = runHardwareLab;
    setup.runHardwareInShift = runHardwareInShift;
    setup.runFinalHardwareLab = runFinalHardwareLab;
    setup.runMultiPrinterFailover = shouldRunShiftMultiPrinterFailover(scenario, runHardwareLab, readinessGate);
    failures.push(...setup.actorCredentials
      .filter((credential) => !credential.ok)
      .map((credential) => `MCP actor login failed: ${credential.actor} (${credential.loginName}): ${credential.error}`));
    if (setup.actorCredentials.some((credential) => !credential.ok)) {
      infrastructureFailed = true;
      throw new Error('MCP shift actor credential validation failed before UI run.');
    }

    const spravceToken = await loginBackendForRole(backendUrl, 'spravce', timeoutMs).catch((error) => {
      failures.push(`backend admin login failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
    const managerToken = await loginBackendForActor(backendUrl, actors.manager, timeoutMs).catch((error) => {
      failures.push(`backend shift manager login failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });

    const initialSnapshot = spravceToken
      ? await captureShiftSnapshot(backendUrl, spravceToken, scenario, timeoutMs, 'initial')
      : { label: 'initial', ok: false, failure: 'missing admin token' };
    backendSnapshots.push(initialSnapshot);

    const shiftStartedAt = Date.now();
    if (runMode === 'persistent') {
      const persistentResult = await runPersistentShiftActions({
        phases,
        actors,
        frontendUrl,
        backendUrl,
        language,
        viewport,
        screenshots,
        timeoutMs,
        scenario,
        spravceToken,
        durationMs,
        setup,
        reportDir: report.dir,
        runHardwareInShift,
      });
      phaseResults.push(persistentResult);
      recordShiftActionRuns(persistentResult.actions, persistentResult.name, managerTimeline, workerTimelines);
      failures.push(...persistentResult.actions
        .filter((run) => !run.ok)
        .map((run) => `${persistentResult.name}/${run.actor}/${run.process}: ${(run.failures ?? []).join('; ') || 'action failed'}`));
      if (persistentResult.infrastructureFailed) infrastructureFailed = true;
    } else if (runMode === 'continuous') {
      const continuousResult = await runContinuousShiftActions({
        phases,
        actors,
        frontendUrl,
        backendUrl,
        language,
        viewport,
        screenshots,
        timeoutMs,
        scenario,
        spravceToken,
        durationMs,
        setup,
        reportDir: report.dir,
        runHardwareInShift,
      });
      phaseResults.push(continuousResult);
      recordShiftActionRuns(continuousResult.actions, continuousResult.name, managerTimeline, workerTimelines);
      failures.push(...continuousResult.actions
        .filter((run) => !run.ok)
        .map((run) => `${continuousResult.name}/${run.actor}/${run.process}: ${(run.failures ?? []).join('; ') || 'action failed'}`));
      if (continuousResult.infrastructureFailed) infrastructureFailed = true;
    } else {
      for (const phase of phases) {
        await waitUntil(shiftStartedAt + Math.round((phase.offsetPercent / 100) * durationMs));
        const phaseHealth = await httpCheckWithRetry(`backendReadyBeforePhase:${phase.name}`, joinUrl(backendUrl, '/health/ready'), timeoutMs, 2);
        setup.healthTimeline.push(phaseHealth);
        if (!phaseHealth.ok) {
          infrastructureFailed = true;
          failures.push(`${phaseHealth.name} failed: ${phaseHealth.status || phaseHealth.error}`);
          break;
        }
        const phaseStartedAt = Date.now();
        const actionRuns = await runShiftPhaseActions({
          phase,
          actors,
          frontendUrl,
          backendUrl,
          language,
          viewport,
          screenshots,
          timeoutMs,
          scenario,
          spravceToken,
        });
        const phaseResult = {
          name: phase.name,
          offsetPercent: phase.offsetPercent,
          startedAt: new Date(phaseStartedAt).toISOString(),
          durationMs: Date.now() - phaseStartedAt,
          actions: actionRuns,
          ok: actionRuns.every((run) => run.ok),
        };
        phaseResults.push(phaseResult);
        recordShiftActionRuns(actionRuns, phase.name, managerTimeline, workerTimelines);
        failures.push(...actionRuns.filter((run) => !run.ok).map((run) => `${phase.name}/${run.actor}/${run.process}: ${(run.failures ?? []).join('; ') || 'action failed'}`));
      }

      await waitUntil(shiftStartedAt + durationMs);
    }

    const finalHealth = await httpCheckWithRetry('backendReadyBeforeFinalAssertions', joinUrl(backendUrl, '/health/ready'), timeoutMs, 2);
    setup.healthTimeline.push(finalHealth);
    if (!finalHealth.ok) {
      infrastructureFailed = true;
      failures.push(`${finalHealth.name} failed: ${finalHealth.status || finalHealth.error}`);
      backendSnapshots.push({
        label: 'final',
        ok: false,
        failure: `Backend unavailable before final assertions: ${finalHealth.status || finalHealth.error}`,
        failures: [finalHealth.status || finalHealth.error],
      });
    }

    if (!infrastructureFailed && spravceToken && !runHardwareInShift) {
      const printResult = await simulatePrintAgent(backendUrl, {
        warehouseCode: scenario?.warehouse?.code ?? 'MAIN',
        agentCode: 'MCP-SHIFT-AGENT',
        token: 'mcp-shift-agent-token-2026-local-secret',
        timeoutMs,
      });
      terminalStateAssertions.push(printResult);
      if (!printResult.ok) failures.push(printResult.failure ?? 'shift print agent simulation failed');
    } else if (!infrastructureFailed && runHardwareInShift) {
      const hardwareRuntimeAssertions = phaseResults
        .map((phaseResult) => phaseResult.hardwareRuntime)
        .filter(Boolean);
      terminalStateAssertions.push({
        name: 'shift_in_operation_fake_tcp_9100',
        ok: hardwareRuntimeAssertions.some((item) => item.ok && item.captureCount > 0),
        summaries: hardwareRuntimeAssertions,
        failures: hardwareRuntimeAssertions.flatMap((item) => item.failures ?? []),
      });
      const latestHardwareRuntime = hardwareRuntimeAssertions.at(-1);
      if (!latestHardwareRuntime?.ok || Number(latestHardwareRuntime?.captureCount ?? 0) < 1) {
        failures.push('in-shift fake TCP 9100 printer did not capture any successful ZPL job');
      }
    }

    if (!infrastructureFailed && spravceToken && shouldRunShiftMultiPrinterFailover(scenario, runHardwareLab, readinessGate)) {
      const multiPrinterFailover = await runMultiPrinterRetryFailoverLab({
        backendUrl,
        warehouseCode: scenario?.mcpShift?.warehouseCode ?? scenario?.warehouse?.code ?? 'MAIN',
        credentialsArgs: {
          loginName: actors.admin.loginName,
          password: actors.admin.password,
        },
        reportDir: join(report.dir, 'multi-printer-failover'),
        timeoutMs,
        fakePrinterHost: scenario?.mcpShift?.hardwareLab?.fakePrinterHost ?? '127.0.0.1',
        fakePrinterPort: scenario?.mcpShift?.hardwareLab?.failoverFakePrinterPort ?? 19102,
        renderMode: String(scenario?.mcpShift?.hardwareLab?.renderMode ?? 'offline'),
        allowExternalLabelary: scenario?.mcpShift?.hardwareLab?.allowExternalLabelary === true,
      });
      terminalStateAssertions.push({
        name: 'multi_printer_retry_failover',
        ok: multiPrinterFailover.ok,
        reportPath: join(report.dir, 'multi-printer-failover', 'report.json'),
        primaryPrinter: multiPrinterFailover.printers?.primary?.code,
        secondaryPrinter: multiPrinterFailover.printers?.secondary?.code,
        primaryFailureOk: multiPrinterFailover.firstFailure?.ok,
        retryStatus: multiPrinterFailover.retry?.status,
        secondFailureOk: multiPrinterFailover.secondFailure?.ok,
        reassignStatus: multiPrinterFailover.reassign?.status,
        wrongAgentBlocked: multiPrinterFailover.wrongAgentClaim?.ok,
        secondaryPrinted: multiPrinterFailover.secondaryRun?.ok,
        captureCount: multiPrinterFailover.captureCount,
        captures: multiPrinterFailover.captures,
        failures: multiPrinterFailover.failures ?? [],
      });
      if (!multiPrinterFailover.ok) {
        failures.push(`multi-printer retry/failover failed: ${(multiPrinterFailover.failures ?? []).join('; ') || 'unknown failure'}`);
      }
    } else if (shouldRunShiftMultiPrinterFailover(scenario, runHardwareLab, readinessGate)) {
      terminalStateAssertions.push({
        name: 'multi_printer_retry_failover',
        ok: false,
        skipped: true,
        failures: ['Skipped because backend health or admin login failed before multi-printer retry/failover lab.'],
      });
    }

    if (!infrastructureFailed && runFinalHardwareLab) {
      const hardwareLab = await hardwareSimLab({
        frontendUrl,
        backendUrl,
        scenarioPath: 'MCP/scenarios/hardware-labels-lite.json',
        warehouseCode: scenario?.warehouse?.code ?? 'MAIN',
        language,
        viewport,
        screenshots,
        runScanner: true,
        runPrinter: true,
        ensureRfTask: true,
        fakePrinterPort: Number(scenario?.mcpShift?.hardwareLab?.fakePrinterPort ?? 19101),
        renderMode: String(scenario?.mcpShift?.hardwareLab?.renderMode ?? 'offline'),
        allowExternalLabelary: false,
        timeoutMs,
      });
      terminalStateAssertions.push({
        name: 'hardware_sim_lab_shift_scanner_printer',
        ok: hardwareLab.ok,
        reportPath: hardwareLab.reportPath,
        artifactsDir: hardwareLab.artifactsDir,
        scannerOk: hardwareLab.scanner?.ok,
        printerOk: hardwareLab.printer?.ok,
        scannerCount: hardwareLab.scanner?.count,
        captures: hardwareLab.printer?.captures?.map((capture) => ({
          filePath: capture.filePath,
          bytes: capture.bytes,
          ok: capture.validation?.ok,
        })) ?? [],
        failures: hardwareLab.failures ?? [],
      });
      if (!hardwareLab.ok) failures.push(`hardware simulator lab failed: ${(hardwareLab.failures ?? []).join('; ') || 'unknown failure'}`);
    } else if (runFinalHardwareLab) {
      terminalStateAssertions.push({
        name: 'hardware_sim_lab_shift_scanner_printer',
        ok: false,
        skipped: true,
        failures: ['Skipped because backend health failed before final hardware lab.'],
      });
    }

    const finalSpravceToken = !infrastructureFailed
      ? await loginBackendForRole(backendUrl, 'spravce', timeoutMs).catch((error) => {
        failures.push(`backend final admin login failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      })
      : null;
    const finalManagerToken = !infrastructureFailed
      ? await loginBackendForActor(backendUrl, actors.manager, timeoutMs).catch((error) => {
        failures.push(`backend final shift manager login failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      })
      : null;

    if (!infrastructureFailed && finalManagerToken) {
      const managerSnapshot = await captureShiftSnapshot(backendUrl, finalManagerToken, scenario, timeoutMs, 'manager-visible-final');
      backendSnapshots.push(managerSnapshot);
    }
    const finalSnapshot = infrastructureFailed
      ? backendSnapshots.findLast?.((snapshot) => snapshot.label === 'final') ?? { label: 'final', ok: false, failure: 'backend unavailable' }
      : finalSpravceToken
        ? await captureShiftSnapshot(backendUrl, finalSpravceToken, scenario, timeoutMs, 'final')
        : { label: 'final', ok: false, failure: 'missing admin token' };
    if (!infrastructureFailed) backendSnapshots.push(finalSnapshot);

    backendAssertions.push(...assertShiftInvariants(initialSnapshot, finalSnapshot));
    failures.push(...backendAssertions.filter((item) => !item.ok).map((item) => item.failure ?? item.name));

    readinessAssertions.push(...buildShiftReadinessAssertions({
      readinessGate,
      durationMinutes,
      workerCount,
      actors,
      runHardwareInShift,
      terminalStateAssertions,
      backendAssertions,
    }));
    if (readinessGate.enabled) {
      failures.push(...readinessAssertions.filter((item) => !item.ok).map((item) => item.failure ?? item.name));
    }

    let uiAudit = null;
    if (!infrastructureFailed && runReloadJourney) {
      const reloadRun = await roleJourney({
        role: 'vedouci',
        frontendUrl,
        backendUrl,
        loginName: actors.manager.loginName,
        password: actors.manager.password,
        language,
        viewport,
        screenshots,
        timeoutMs,
      });
      reloadAssertions.push({
        name: 'vedouci_shift_reload_role_journey',
        ok: reloadRun.ok,
        reportPath: reloadRun.reportPath,
        screenshotsDir: reloadRun.screenshotsDir,
        overflowCount: sumOverflow(reloadRun.routes),
        failures: reloadRun.failures,
      });
      if (!reloadRun.ok) failures.push(`shift reload journey failed: ${(reloadRun.failures ?? []).join('; ')}`);

      uiAudit = runUiAudit ? await employeeFrontendAudit({
        roles: ['skladnik', 'vedouci', 'spravce'],
        languages: [language],
        viewports: [viewport],
        frontendUrl,
        backendUrl,
        fillControls: true,
        failOnOverflow: true,
        screenshots,
        timeoutMs,
      }) : null;
      if (uiAudit && !uiAudit.ok) failures.push(`employee frontend audit failed: ${(uiAudit.failures ?? []).slice(0, 6).join('; ')}`);
    } else if (infrastructureFailed) {
      reloadAssertions.push({
        name: 'vedouci_shift_reload_role_journey',
        ok: false,
        skipped: true,
        failures: ['Skipped because backend health failed before final UI reload.'],
      });
    } else {
      reloadAssertions.push({
        name: 'vedouci_shift_reload_role_journey',
        ok: true,
        skipped: true,
        failures: ['Skipped by runReloadJourney=false; run role journey separately for reload screenshots.'],
      });
    }

    const allRuns = flattenShiftRuns(phaseResults);
    const loginEvents = phaseResults.flatMap((phase) => phase.loginRuns ?? []);
    const consoleErrors = [
      ...allRuns.flatMap((run) => (run.events ?? []).filter((event) => event.type === 'console')),
      ...loginEvents.filter((event) => ['error', 'warning'].includes(event.type)).map((event) => ({ type: 'console', ...event })),
    ];
    const pageErrors = [
      ...allRuns.flatMap((run) => (run.events ?? []).filter((event) => event.type === 'pageError')),
      ...loginEvents.filter((event) => event.type === 'pageError'),
    ];
    const overflowCount = allRuns.reduce((sum, run) => sum + Number(run.overflowCount ?? 0), 0) +
      reloadAssertions.reduce((sum, step) => sum + Number(step.overflowCount ?? 0), 0) +
      (uiAudit?.runs ?? []).flatMap((run) => run.routes ?? []).reduce((sum, route) => sum + Number(route.overflowCount ?? 0), 0);

    const result = {
      ok: failures.length === 0 && consoleErrors.length === 0 && pageErrors.length === 0 && overflowCount === 0,
      reportPath: report.file,
      screenshotsDir: report.dir,
      setup,
      actors: publicActors,
      managerTimeline,
      workerTimelines,
      phases: phaseResults,
      backendSnapshots,
      backendAssertions,
      reloadAssertions,
      terminalStateAssertions,
      readinessAssertions,
      uiAudit,
      uiCleanupFindings: buildUiCleanupFindings({ uiAudit, backendAssertions, phaseResults }),
      infrastructureFailed,
      latency: summarizeShiftLatency(allRuns),
      consoleErrors,
      pageErrors,
      overflowCount,
      failures,
    };
    await writeJson(report.file, result);
    return result;
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    const result = {
      ok: false,
      reportPath: report.file,
      screenshotsDir: report.dir,
      setup,
      managerTimeline,
      workerTimelines,
      phases: phaseResults,
      backendSnapshots,
      backendAssertions,
      reloadAssertions,
      terminalStateAssertions,
      readinessAssertions,
      infrastructureFailed,
      failures,
    };
    await writeJson(report.file, result);
    return result;
  }
}

function normalizeShiftDurationMinutes(value) {
  const number = Number(value ?? 30);
  if (!Number.isFinite(number)) return 30;
  return Math.min(60, Math.max(0.1, number));
}

function normalizeShiftWorkerCount(value) {
  const number = Number(value ?? 10);
  if (!Number.isFinite(number)) return 10;
  return Math.min(20, Math.max(1, Math.round(number)));
}

function normalizeShiftReadinessGate(value) {
  const normalized = String(value ?? 'off').trim().toLowerCase();
  if (!normalized || ['off', 'false', '0', 'no', 'none'].includes(normalized)) {
    return { enabled: false, label: 'off' };
  }
  const label = ['60', '60m', '60min', 'software60'].includes(normalized) ? '60m' : '30m';
  return {
    enabled: true,
    label,
    durationMinutes: label === '60m' ? 60 : 30,
    managerCount: 1,
    workerCount: 10,
    requireInShiftHardware: true,
    requireMultiPrinterFailover: true,
  };
}

function normalizeShiftRunMode(value) {
  if (value === 'phased') return 'phased';
  if (value === 'continuous') return 'continuous';
  return 'persistent';
}

function shouldRunShiftHardwareInOperation(scenario, runHardwareLab) {
  return runHardwareLab !== false && scenario?.mcpShift?.hardwareLab?.inShift === true;
}

function shouldRunFinalHardwareLab(scenario, runHardwareLab) {
  if (runHardwareLab === false) return false;
  const hardwareLab = scenario?.mcpShift?.hardwareLab ?? {};
  if (hardwareLab.finalLab === true) return true;
  return hardwareLab.inShift !== true;
}

function shouldRunShiftMultiPrinterFailover(scenario, runHardwareLab, readinessGate) {
  if (runHardwareLab === false) return false;
  if (readinessGate?.requireMultiPrinterFailover === true) return true;
  const hardwareLab = scenario?.mcpShift?.hardwareLab ?? {};
  return hardwareLab.multiPrinterFailover === true;
}

function resolveShiftActors(scenario, workerCount = 10) {
  const defaultPassword = defaultMcpPassword();
  const configured = scenario?.mcpShift?.actors ?? {};
  const workerLabels = [
    'příjem',
    'putaway',
    'picking A',
    'picking B',
    'packing',
    'zásoby/výjimky',
    'RF skenery',
    'tisk/reprint',
    'replenishment',
    'flex picking/packing',
  ];
  const workerDefaults = Object.fromEntries(Array.from({ length: normalizeShiftWorkerCount(workerCount) }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return [`worker${number}`, {
      role: 'skladnik',
      loginName: `mcp-skladnik-${number}@aardvarkland.local`,
      label: `Skladník ${number} ${workerLabels[index] ?? 'provoz'}`,
    }];
  }));
  const defaults = {
    manager: { role: 'vedouci', loginName: 'mcp-vedouci-shift@aardvarkland.local', label: 'Vedoucí směny MCP' },
    admin: { role: 'spravce', loginName: defaultMcpLogin('spravce'), label: 'Správce MCP setup' },
    ...workerDefaults,
  };
  const allowedWorkerKeys = new Set(Object.keys(workerDefaults));
  const selectedConfigured = Object.fromEntries(Object.entries(configured).filter(([key]) => (
    !/^worker\d+$/i.test(key) || allowedWorkerKeys.has(key)
  )));
  return Object.fromEntries(Object.entries({ ...defaults, ...selectedConfigured }).map(([key, actor]) => {
    const merged = { ...(defaults[key] ?? {}), ...(actor ?? {}) };
    return [key, {
      role: merged.role,
      loginName: merged.loginName,
      label: merged.label ?? key,
      password: merged.password ?? defaultPassword,
    }];
  }));
}

function shiftWorkerKeysFromActors(actors) {
  return Object.keys(actors ?? {})
    .filter((key) => /^worker\d+$/i.test(key))
    .sort((left, right) => Number(left.replace(/\D+/g, '')) - Number(right.replace(/\D+/g, '')));
}

function shiftOperationalActorKeys(actors) {
  return ['manager', ...shiftWorkerKeysFromActors(actors)].filter((actorKey) => actors?.[actorKey]);
}

function shiftSetupActorKeys(actors) {
  return ['admin', ...shiftOperationalActorKeys(actors)].filter((actorKey) => actors?.[actorKey]);
}

function resolveShiftPhases(scenario) {
  const configured = scenario?.mcpShift?.phases;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map((phase, index) => ({
      name: String(phase.name ?? `phase-${index + 1}`),
      offsetPercent: Math.min(100, Math.max(0, Number(phase.offsetPercent ?? index * 10))),
      actions: Array.isArray(phase.actions) ? phase.actions : [],
    }));
  }

  const firstOrder = scenario?.outboundOrders?.[0]?.order ?? 'SO-TEST-2001';
  const firstSku = scenario?.products?.[0]?.sku ?? 'USB-C-65W-BLK';
  return [
    {
      name: 'fallback shift phase',
      offsetPercent: 0,
      actions: [
        { actor: 'worker01', process: 'inventory_receive', data: { sku: firstSku, quantity: 1 } },
        { actor: 'manager', process: 'outbound_allocate', data: { orderReference: firstOrder } },
        { actor: 'manager', process: 'outbound_release_picking', data: { orderReference: firstOrder, dynamicPick: true, pickActors: ['worker03', 'worker04'] } },
      ],
    },
  ];
}

async function runShiftPhaseActions(options) {
  const actions = Array.isArray(options.phase?.actions) ? options.phase.actions : [];
  const groups = new Map();
  actions.forEach((action, index) => {
    const sequence = Number.isFinite(Number(action.sequence)) ? Number(action.sequence) : index;
    if (!groups.has(sequence)) groups.set(sequence, []);
    groups.get(sequence).push(action);
  });

  const runs = [];
  for (const sequence of [...groups.keys()].sort((left, right) => left - right)) {
    const groupRuns = await Promise.all(groups.get(sequence).map((action) => runShiftAction({
      ...options,
      action,
    })));
    runs.push(...groupRuns);
  }
  return runs;
}

async function runContinuousShiftActions(options) {
  const {
    phases,
    actors,
    frontendUrl,
    backendUrl,
    language,
    viewport,
    screenshots,
    timeoutMs,
    scenario,
    spravceToken,
    durationMs,
    setup,
    reportDir,
    runHardwareInShift,
  } = options;
  const startedAt = Date.now();
  const deadline = startedAt + durationMs;
  const queues = buildContinuousShiftQueues(scenario, phases, actors);
  const actorKeys = shiftOperationalActorKeys(actors);
  const shiftHardwareRuntime = runHardwareInShift
    ? await createShiftHardwareRuntime({ scenario, reportDir, timeoutMs, mode: 'continuous' })
    : null;

  try {
    const adminRuns = queues.admin?.length
      ? await runContinuousActorQueue({
        actorKey: 'admin',
        queue: queues.admin,
        repeatableQueue: [],
        deadline,
        actors,
        frontendUrl,
        backendUrl,
        language,
        viewport,
        screenshots,
        timeoutMs,
        scenario,
        spravceToken,
        setup,
        reportDir,
        shiftHardwareRuntime,
      })
      : { actor: 'admin', runs: [], ok: true, infrastructureFailed: false };
    const actorResults = await Promise.all(actorKeys.map((actorKey) => runContinuousActorQueue({
      actorKey,
      queue: queues[actorKey] ?? [],
      repeatableQueue: (queues[actorKey] ?? []).filter((action) => action.repeatable === true),
      deadline,
      actors,
      frontendUrl,
      backendUrl,
      language,
      viewport,
      screenshots,
      timeoutMs,
      scenario,
      spravceToken,
      setup,
      reportDir,
      shiftHardwareRuntime,
    })));

    const actions = [...adminRuns.runs, ...actorResults.flatMap((result) => result.runs)];
    const hardwareRuntime = summarizeShiftHardwareRuntime(shiftHardwareRuntime);
    return {
      name: 'continuous simultánní směna',
      runMode: 'continuous',
      offsetPercent: 0,
      startedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
      actorQueues: Object.fromEntries(Object.entries(queues).map(([actorKey, queue]) => [actorKey, queue.length])),
      actorResults,
      actions,
      hardwareRuntime,
      ok: actions.every((run) => run.ok) && actorResults.every((result) => result.ok) && adminRuns.ok && (hardwareRuntime?.ok ?? true),
      infrastructureFailed: adminRuns.infrastructureFailed || actorResults.some((result) => result.infrastructureFailed),
    };
  } finally {
    await shiftHardwareRuntime?.close?.();
  }
}

async function runPersistentShiftActions(options) {
  const {
    actors,
    frontendUrl,
    backendUrl,
    language,
    viewport,
    screenshots,
    timeoutMs,
    scenario,
    durationMs,
    setup,
    reportDir,
    runHardwareInShift,
  } = options;
  const loginStartedAt = Date.now();
  const queues = buildContinuousShiftQueues(scenario, options.phases, actors);
  const actorKeys = shiftSetupActorKeys(actors);
  const sessions = {};
  const loginRuns = [];
  const shiftHardwareRuntime = runHardwareInShift
    ? await createShiftHardwareRuntime({ scenario, reportDir, timeoutMs, mode: 'persistent' })
    : null;

  try {
    for (const actorKey of actorKeys) {
      const actor = actors[actorKey];
      if (!actor) continue;
      const loginFailures = [];
      const browser = await launchBrowser({ viewport });
      const page = await browser.newPage();
      await page.enable();
      page.onConsole((entry) => {
        if (['error', 'warning'].includes(entry.type)) {
          loginRuns.push({ actor: actorKey, type: 'console', ...entry });
        }
      });
      page.onPageError((entry) => loginRuns.push({ actor: actorKey, type: 'pageError', ...entry }));
      await loginToFrontend(page, {
        frontendUrl,
        loginName: actor.loginName,
        password: actor.password,
        language,
        timeoutMs,
        failures: loginFailures,
      });
      if (screenshots) await page.screenshot(join(reportDir, `persistent-${actorKey}-login.png`)).catch(() => null);
      sessions[actorKey] = { actorKey, actor, browser, page, loginFailures };
      if (loginFailures.length > 0) {
        loginRuns.push({
          actor: actorKey,
          ok: false,
          failures: loginFailures,
        });
      }
    }

    const startedAt = Date.now();
    const deadline = startedAt + durationMs;

    const adminRuns = queues.admin?.length
      ? await runPersistentActorQueue({
        ...options,
        actorKey: 'admin',
        session: sessions.admin,
        queue: queues.admin,
        repeatableQueue: [],
        deadline,
        reportDir,
        setup,
        shiftHardwareRuntime,
      })
      : { actor: 'admin', runs: [], ok: true, infrastructureFailed: false };

    const workerKeys = shiftOperationalActorKeys(actors);
    const actorResults = await Promise.all(workerKeys.map((actorKey) => runPersistentActorQueue({
      ...options,
      actorKey,
      session: sessions[actorKey],
      queue: queues[actorKey] ?? [],
      repeatableQueue: (queues[actorKey] ?? []).filter((action) => action.repeatable === true),
      deadline,
      reportDir,
      setup,
      shiftHardwareRuntime,
    })));

    const actions = [...adminRuns.runs, ...actorResults.flatMap((result) => result.runs)];
    const loginFailures = loginRuns.filter((run) => run.ok === false);
    const hardwareRuntime = summarizeShiftHardwareRuntime(shiftHardwareRuntime);
    return {
      name: 'persistent simultánní směna',
      runMode: 'persistent',
      offsetPercent: 0,
      startedAt: new Date(startedAt).toISOString(),
      loginDurationMs: startedAt - loginStartedAt,
      durationMs: Date.now() - startedAt,
      actorQueues: Object.fromEntries(Object.entries(queues).map(([actorKey, queue]) => [actorKey, queue.length])),
      loginRuns,
      actorResults,
      actions,
      hardwareRuntime,
      ok: loginFailures.length === 0 && actions.every((run) => run.ok) && actorResults.every((result) => result.ok) && adminRuns.ok && (hardwareRuntime?.ok ?? true),
      infrastructureFailed: loginFailures.length > 0 || adminRuns.infrastructureFailed || actorResults.some((result) => result.infrastructureFailed),
    };
  } finally {
    if (screenshots) {
      await Promise.all(Object.values(sessions).map((session) =>
        session.page.screenshot(join(reportDir, `persistent-${session.actorKey}-final.png`)).catch(() => null),
      ));
    }
    await Promise.all(Object.values(sessions).map((session) => session.browser.close().catch(() => null)));
    await shiftHardwareRuntime?.close?.();
  }
}

async function runPersistentActorQueue(options) {
  const {
    actorKey,
    session,
    queue,
    repeatableQueue,
    deadline,
    backendUrl,
    timeoutMs,
    setup,
  } = options;
  const runs = [];
  let index = 0;
  let repeatIndex = 0;
  let consecutiveFailures = 0;
  let infrastructureFailed = false;

  if (!session || session.loginFailures?.length) {
    return {
      actor: actorKey,
      ok: false,
      startedActions: 0,
      infrastructureFailed: true,
      runs: [{
        ok: false,
        actor: actorKey,
        process: 'login',
        durationMs: 0,
        failures: session?.loginFailures ?? [`Missing persistent session for ${actorKey}`],
      }],
    };
  }

  while (Date.now() < deadline) {
    const remainingBeforeHealth = deadline - Date.now();
    if (remainingBeforeHealth < 5000) break;

    const action = index < queue.length
      ? queue[index++]
      : repeatableQueue.length > 0
        ? { ...repeatableQueue[repeatIndex++ % repeatableQueue.length], cycle: true }
        : null;
    if (!action) break;

    const healthTimeoutMs = Math.min(timeoutMs, Math.max(5000, deadline - Date.now()));
    const health = await httpCheckWithRetry(`backendReadyBeforePersistent:${actorKey}:${runs.length + 1}`, joinUrl(backendUrl, '/health/ready'), healthTimeoutMs, 3);
    setup.healthTimeline.push(health);
    if (!health.ok) {
      if (deadline - Date.now() < 5000) break;
      infrastructureFailed = true;
      runs.push({
        ok: false,
        actor: actorKey,
        process: action.process,
        durationMs: 0,
        failures: [`${health.name} failed: ${health.status || health.error}`],
        nestedRuns: [],
      });
      break;
    }

    const run = await runPersistentShiftActionWithRetries({
      ...options,
      action: { ...action, actor: actorKey },
      deadline,
    });
    run.continuousCycle = action.cycle === true;
    runs.push(run);

    if (run.ok || run.expectedFailureObserved) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 5) break;
    }
    const pacingMs = shiftActionPacingMs(options.scenario, action);
    if (pacingMs > 0 && Date.now() + pacingMs < deadline) await delay(pacingMs);
  }

  return {
    actor: actorKey,
    ok: !infrastructureFailed && runs.every((run) => run.ok || run.expectedFailureObserved),
    startedActions: runs.length,
    infrastructureFailed,
    runs,
  };
}

async function runPersistentShiftActionWithRetries(options) {
  const maxAttempts = Math.max(1, Number(options.action?.maxAttempts ?? 3));
  const retrySummaries = [];
  let lastRun = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastRun = await runPersistentShiftAction(options);
    if (attempt > 1) lastRun.retryAttempt = attempt;
    const authExpired = isAuthExpiredShiftRun(lastRun);
    if (!lastRun.ok && !lastRun.expectedFailureObserved && authExpired && Date.now() < options.deadline) {
      const relogin = await reloginPersistentShiftActor(options);
      retrySummaries.push({
        attempt,
        authExpired: true,
        reloginOk: relogin.ok,
        failures: lastRun.failures ?? [],
        reloginFailures: relogin.failures,
      });
      if (!relogin.ok) {
        lastRun.retryAttempts = retrySummaries;
        lastRun.reloginFailures = relogin.failures;
        return lastRun;
      }
      await delay(Math.min(1500, 500 * attempt));
      continue;
    }
    if (lastRun.ok || lastRun.expectedFailureObserved || !isRetryableShiftRun(lastRun) || Date.now() >= options.deadline) {
      if (retrySummaries.length > 0) lastRun.retryAttempts = retrySummaries;
      return lastRun;
    }

    retrySummaries.push({
      attempt,
      failures: lastRun.failures ?? [],
    });
    await delay(Math.min(5000, 800 * attempt));
  }

  if (lastRun && retrySummaries.length > 0) lastRun.retryAttempts = retrySummaries;
  return lastRun;
}

async function reloginPersistentShiftActor(options) {
  const page = options.session?.page;
  const actor = options.session?.actor;
  if (!page || !actor) return { ok: false, failures: ['persistent actor session is not available for re-login'] };
  const failures = [];
  await clearFrontendAuthSession(page);
  await loginToFrontend(page, {
    frontendUrl: options.frontendUrl,
    loginName: actor.loginName,
    password: actor.password,
    language: options.language,
    timeoutMs: options.timeoutMs,
    failures,
  });
  return { ok: failures.length === 0, failures };
}

async function runPersistentShiftAction(options) {
  const {
    action,
    actorKey,
    session,
    timeoutMs,
    reportDir,
    screenshots,
  } = options;
  const started = Date.now();
  const steps = [];
  const failures = [];
  const actor = session.actor;
  const data = {
    ...(action.data ?? {}),
    operatorLoginName: actor.loginName,
    operatorDisplayName: displayNameFromMcpLogin(actor.loginName),
  };

  try {
    await runWarehouseProcessOnPage(session.page, action.process, data, steps, timeoutMs);
    await runShiftHardwareAfterAction({ ...options, action, data, steps });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  const statusText = await actionStatus(session.page).catch(() => '');
  const idleStep = steps.some((step) => [
    'inbound-idle',
    'inventory-idle',
    'packing-idle',
    'task-no-work-available',
    'rf-idle',
  ].includes(step.action));
  if (!idleStep) failures.push(...extractApiErrors(statusText));
  const overflow = await session.page.detectOverflow(10).catch(() => []);
  const expectedFailureObserved = action.expectFailure === true && failures.length > 0;
  if (action.expectFailure === true && failures.length === 0) failures.push('Action was expected to fail but succeeded.');

  let screenshot = null;
  if (screenshots && failures.length > 0) {
    screenshot = join(reportDir, `persistent-${actorKey}-${safeFile(action.process)}-${Date.now()}-error.png`);
    await session.page.screenshot(screenshot).catch(() => null);
  }

  return {
    actor: actorKey,
    actorLabel: actor.label,
    role: actor.role,
    process: action.process,
    expectedFailure: action.expectFailure === true,
    expectedFailureObserved,
    ok: expectedFailureObserved || failures.length === 0,
    durationMs: Date.now() - started,
    reportPath: null,
    screenshotsDir: reportDir,
    screenshot,
    failures: expectedFailureObserved ? [] : failures,
    events: [],
    overflowCount: overflow.length,
    overflow,
    steps,
    nestedRuns: [],
  };
}

async function runWarehouseProcessOnPage(page, process, data, steps, timeoutMs) {
  switch (process) {
    case 'inbound_receive':
      await runInboundReceive(page, data, steps, timeoutMs);
      break;
    case 'inventory_receive':
      await runInventoryReceive(page, data, steps, timeoutMs);
      break;
    case 'inventory_move':
      await runInventoryMove(page, data, steps, timeoutMs);
      break;
    case 'inventory_adjust':
      await runInventoryAdjust(page, data, steps, timeoutMs);
      break;
    case 'task_claim_start_confirm':
      await runTaskClaimStartConfirm(page, data, steps, timeoutMs);
      break;
    case 'rf_scan_expected_steps':
      await runRfExpectedSteps(page, data, steps, timeoutMs);
      break;
    case 'packing_scan_and_ship':
      await runPackingScanAndShip(page, data, steps, timeoutMs);
      break;
    case 'label_preview_and_queue':
      await runLabelPreviewAndQueue(page, data, steps, timeoutMs);
      break;
    case 'print_setup_and_label_queue':
      await runPrintSetupAndLabelQueue(page, data, steps, timeoutMs);
      break;
    case 'outbound_allocate':
      await runOutboundAllocate(page, data, steps, timeoutMs);
      break;
    case 'outbound_release_picking':
      await runOutboundReleasePicking(page, data, steps, timeoutMs);
      break;
    case 'wave_release':
      await runWaveRelease(page, data, steps, timeoutMs);
      break;
    case 'settings_create_user':
      await runSettingsCreateUser(page, data, steps, timeoutMs);
      break;
    default:
      throw new Error(`Unknown process: ${process}`);
  }
}

async function runContinuousActorQueue(options) {
  const {
    actorKey,
    queue,
    repeatableQueue,
    deadline,
    backendUrl,
    timeoutMs,
    setup,
  } = options;
  const runs = [];
  let index = 0;
  let repeatIndex = 0;
  let consecutiveFailures = 0;
  let infrastructureFailed = false;

  while (Date.now() < deadline) {
    const remainingBeforeHealth = deadline - Date.now();
    if (remainingBeforeHealth < 1000) break;

    const action = index < queue.length
      ? queue[index++]
      : repeatableQueue.length > 0
        ? { ...repeatableQueue[repeatIndex++ % repeatableQueue.length], cycle: true }
        : null;
    if (!action) break;

    const healthTimeoutMs = Math.min(timeoutMs, Math.max(2000, deadline - Date.now()));
    const health = await httpCheckWithRetry(`backendReadyBeforeContinuous:${actorKey}:${runs.length + 1}`, joinUrl(backendUrl, '/health/ready'), healthTimeoutMs, 1);
    setup.healthTimeline.push(health);
    if (!health.ok) {
      if (deadline - Date.now() < 1000) break;
      infrastructureFailed = true;
      runs.push({
        ok: false,
        actor: actorKey,
        process: action.process,
        durationMs: 0,
        failures: [`${health.name} failed: ${health.status || health.error}`],
        nestedRuns: [],
      });
      break;
    }

    const run = await runShiftActionWithRetries({
      ...options,
      action: { ...action, actor: actorKey },
      deadline,
    });
    run.continuousCycle = action.cycle === true;
    runs.push(run);

    if (run.ok || run.expectedFailureObserved) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) break;
    }
    const pacingMs = shiftActionPacingMs(options.scenario, action);
    if (pacingMs > 0 && Date.now() + pacingMs < deadline) await delay(pacingMs);
  }

  return {
    actor: actorKey,
    ok: !infrastructureFailed && runs.every((run) => run.ok || run.expectedFailureObserved),
    startedActions: runs.length,
    infrastructureFailed,
    runs,
  };
}

function buildContinuousShiftQueues(scenario, phases, actors = {}) {
  const workerKeys = shiftWorkerKeysFromActors(actors);
  const [inboundWorker, putawayWorker, pickWorkerA, pickWorkerB, packingWorker, inventoryWorker, scannerWorker, printerWorker, replenishmentWorker, flexWorker] = workerKeys;
  const queues = Object.fromEntries(shiftSetupActorKeys(actors).map((actorKey) => [actorKey, []]));
  queues.admin ??= [];
  queues.manager ??= [];
  for (const workerKey of workerKeys) queues[workerKey] ??= [];

  for (const phase of phases) {
    for (const action of phase.actions ?? []) {
      const actorKey = String(action.actor ?? 'worker01');
      if (actorKey === 'admin') queues.admin.push({ ...action, phaseName: phase.name });
    }
  }

  const orders = (scenario?.outboundOrders ?? [])
    .map((order) => order.order)
    .filter(Boolean)
    .filter((order) => order !== 'SO-SHIFT-3029')
    .slice(0, 18);
  for (const orderReference of orders) {
    queues.manager.push({ process: 'outbound_allocate', data: { orderReference }, phaseName: 'continuous manager allocate' });
    queues.manager.push({
      process: 'outbound_release_picking',
      data: { orderReference },
      phaseName: 'continuous manager release',
    });
  }
  queues.manager.push({
    process: 'outbound_allocate',
    expectFailure: true,
    data: { orderReference: 'SO-SHIFT-3029' },
    phaseName: 'continuous shortage exception',
  });

  for (const shipment of scenario?.inboundShipments ?? []) {
    shipment.lines?.forEach((line, index) => {
      queues[inboundWorker]?.push({
        process: 'inbound_receive',
        data: {
          asnReference: shipment.asn,
          lineReference: String(index + 1),
          quantity: Math.max(1, Math.min(8, Number(line.quantity ?? 1))),
        },
        phaseName: 'continuous inbound',
      });
    });
  }
  for (const product of (scenario?.products ?? []).slice(0, 10)) {
    queues[inboundWorker]?.push({
      process: 'inventory_receive',
      data: { sku: product.sku, quantity: 1 },
      repeatable: true,
      phaseName: 'continuous replenishment',
    });
  }

  const moveTargets = ['A-05-02', 'A-01-01', 'A-03-02', 'B-01-01'];
  (scenario?.products ?? []).slice(1, 21).forEach((product, index) => {
    queues[putawayWorker]?.push({
      process: 'inventory_move',
      data: { sku: product.sku, quantity: 1, targetLocation: moveTargets[index % moveTargets.length], allowNoInventory: true, allowConflictAsIdle: true },
      repeatable: true,
      phaseName: 'continuous putaway',
    });
  });

  for (let index = 0; index < 24; index += 1) {
    queues[pickWorkerA]?.push({
      process: 'task_claim_start_confirm',
      data: { repeat: 1, allowNoTask: true },
      repeatable: true,
      phaseName: 'continuous picking A',
    });
    queues[pickWorkerB]?.push({
      process: 'task_claim_start_confirm',
      data: { repeat: 1, allowNoTask: true },
      repeatable: true,
      phaseName: 'continuous picking B',
    });
  }

  for (let index = 0; index < 2; index += 1) {
    queues[packingWorker]?.push({
      process: 'label_preview_and_queue',
      data: {
        printerCode: 'MCP-SHIFT-PRINTER',
        labelCode: index === 0 ? 'AARD1:LOC:MAIN:PACK-01' : 'AARD1:LOC:MAIN:SHIP-01',
        title: 'Packing prep',
        subtitle: 'Směnový test',
      },
      phaseName: 'continuous packing prep',
    });
  }
  for (let index = 0; index < 18; index += 1) {
    queues[packingWorker]?.push({
      process: 'packing_scan_and_ship',
      data: { ship: true, allowConflictAsIdle: true },
      repeatable: true,
      phaseName: 'continuous packing',
    });
  }

  (scenario?.products ?? []).slice(22, 34).forEach((product, index) => {
    queues[inventoryWorker]?.push({
      process: index % 2 === 0 ? 'inventory_move' : 'inventory_receive',
      data: {
        sku: product.sku,
        quantity: 1,
        targetLocation: moveTargets[index % moveTargets.length],
        allowNoInventory: true,
        allowConflictAsIdle: true,
      },
      repeatable: true,
      phaseName: 'continuous cycle count',
    });
  });
  queues[inventoryWorker]?.push({ process: 'rf_scan_expected_steps', data: { steps: 2, hardwareScanner: true, allowNoTask: true }, repeatable: true, phaseName: 'continuous rf hardware scanner' });
  queues[inventoryWorker]?.push({
    process: 'label_preview_and_queue',
    data: { printerCode: 'MCP-SHIFT-PRINTER', labelCode: 'AARD1:LOC:MAIN:SHIP-01', title: 'Reprint', subtitle: 'Směnový test', fakeTcpCapture: true },
    repeatable: true,
    phaseName: 'continuous fake TCP reprint',
  });

  queues[scannerWorker]?.push({ process: 'rf_scan_expected_steps', data: { steps: 4, hardwareScanner: true, allowNoTask: true }, repeatable: true, phaseName: 'continuous scanner specialist keyboard wedge' });
  queues[scannerWorker]?.push({
    process: 'task_claim_start_confirm',
    data: { repeat: 1, allowNoTask: true },
    repeatable: true,
    phaseName: 'continuous scanner follow-up task',
  });
  for (const payload of ['AARD1:LOC:MAIN:A-01-01', 'AARD1:SKU:MAIN:USB-C-65W-BLK', 'AARD1:PARCEL:MAIN:P0001']) {
    queues[printerWorker]?.push({
      process: 'label_preview_and_queue',
      data: { printerCode: 'MCP-SHIFT-PRINTER', labelCode: payload, title: 'Scanner/print check', subtitle: 'Směnový test 10 skladníků', fakeTcpCapture: true },
      repeatable: true,
      phaseName: 'continuous fake TCP label queue',
    });
  }
  (scenario?.products ?? []).slice(34, 44).forEach((product, index) => {
    queues[replenishmentWorker]?.push({
      process: 'inventory_move',
      data: { sku: product.sku, quantity: 1, targetLocation: moveTargets[index % moveTargets.length], allowNoInventory: true, allowConflictAsIdle: true },
      repeatable: true,
      phaseName: 'continuous replenishment worker',
    });
  });
  for (let index = 0; index < 12; index += 1) {
    queues[flexWorker]?.push({
      process: index % 3 === 0 ? 'packing_scan_and_ship' : 'task_claim_start_confirm',
      data: index % 3 === 0 ? { ship: true, allowConflictAsIdle: true } : { repeat: 1, allowNoTask: true },
      repeatable: true,
      phaseName: 'continuous flex worker',
    });
  }

  return queues;
}

function shiftActionPacingMs(scenario, action) {
  const config = scenario?.mcpShift ?? {};
  const hardwareConfig = config.hardwareLab ?? {};
  const process = String(action?.process ?? '');
  const configured = process === 'label_preview_and_queue' || process === 'print_setup_and_label_queue'
    ? hardwareConfig.printPacingMs ?? config.actionPacingMs
    : config.actionPacingMs;
  const value = Number(configured ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10000, Math.round(value)));
}

function recordShiftActionRuns(actionRuns, phaseName, managerTimeline, workerTimelines) {
  for (const run of actionRuns) {
    const timelineEntry = {
      phase: phaseName,
      actor: run.actor,
      process: run.process,
      ok: run.ok,
      expectedFailure: run.expectedFailure,
      expectedFailureObserved: run.expectedFailureObserved,
      continuousCycle: run.continuousCycle === true,
      durationMs: run.durationMs,
      reportPath: run.reportPath,
      screenshotsDir: run.screenshotsDir,
      failures: run.failures,
      nestedRuns: run.nestedRuns?.map((nested) => ({
        actor: nested.actor,
        process: nested.process,
        ok: nested.ok,
        durationMs: nested.durationMs,
        reportPath: nested.reportPath,
        failures: nested.failures,
      })) ?? [],
    };
    if (run.actor === 'manager') managerTimeline.push(timelineEntry);
    if (run.actor?.startsWith('worker')) {
      workerTimelines[run.actor] ??= [];
      workerTimelines[run.actor].push(timelineEntry);
    }
    for (const nested of run.nestedRuns ?? []) {
      if (!nested.actor?.startsWith?.('worker')) continue;
      workerTimelines[nested.actor] ??= [];
      workerTimelines[nested.actor].push({
        phase: phaseName,
        actor: nested.actor,
        process: nested.process,
        ok: nested.ok,
        expectedFailure: false,
        expectedFailureObserved: false,
        continuousCycle: run.continuousCycle === true,
        durationMs: nested.durationMs,
        reportPath: nested.reportPath,
        screenshotsDir: nested.screenshotsDir,
        failures: nested.failures ?? [],
        taskReference: nested.taskReference,
        parentActor: run.actor,
        parentProcess: run.process,
      });
    }
  }
}

async function runShiftAction(options) {
  const {
    action,
    actors,
    frontendUrl,
    backendUrl,
    language,
    viewport,
    screenshots,
    timeoutMs,
    scenario,
    spravceToken,
  } = options;
  const actorKey = String(action.actor ?? 'worker01');
  const actor = actors[actorKey];
  const started = Date.now();
  const failures = [];
  const nestedRuns = [];

  if (!actor) {
    return {
      ok: false,
      actor: actorKey,
      process: action.process,
      durationMs: Date.now() - started,
      failures: [`Unknown shift actor: ${actorKey}`],
      nestedRuns,
    };
  }

  const run = await liveWarehouseProcess({
    role: actor.role,
    process: action.process,
    data: action.data ?? {},
    confirmLiveWrite: true,
    frontendUrl,
    backendUrl,
    loginName: actor.loginName,
    password: actor.password,
    language,
    viewport,
    screenshots,
    timeoutMs,
  });

  if (action.expectFailure === true) {
    if (run.ok) failures.push('Action was expected to fail but succeeded.');
  } else if (!run.ok) {
    failures.push(...(run.failures ?? ['UI process failed']));
  }

  if (run.ok) {
    try {
      const hardwareRun = await runShiftHardwareAfterAction({
        ...options,
        action,
        data: {
          ...(action.data ?? {}),
          operatorLoginName: actor.loginName,
          operatorDisplayName: displayNameFromMcpLogin(actor.loginName),
        },
        steps: run.steps ?? [],
      });
      if (hardwareRun) run.hardwarePrintRun = hardwareRun;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (run.ok && action.data?.dynamicPick === true && spravceToken) {
    const orderReference = action.data.orderReference;
    const pickActors = Array.isArray(action.data.pickActors) && action.data.pickActors.length
      ? action.data.pickActors.map(String)
      : ['worker03', 'worker04'];
    const taskReferences = await findPickTaskReferencesForOrder(backendUrl, spravceToken, scenario, timeoutMs, orderReference).catch((error) => {
      failures.push(`pick task lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    });
    const dynamicRuns = await Promise.all(taskReferences.map((taskReference, index) => {
      const pickActorKey = pickActors[index % pickActors.length];
      const pickActor = actors[pickActorKey];
      if (!pickActor) {
        return Promise.resolve({
          ok: false,
          actor: pickActorKey,
          process: 'task_claim_start_confirm',
          durationMs: 0,
          failures: [`Unknown dynamic pick actor: ${pickActorKey}`],
        });
      }
      const nestedStarted = Date.now();
      return liveWarehouseProcess({
        role: pickActor.role,
        process: 'task_claim_start_confirm',
        data: { taskReference, claim: false, start: true, confirm: true },
        confirmLiveWrite: true,
        frontendUrl,
        backendUrl,
        loginName: pickActor.loginName,
        password: pickActor.password,
        language,
        viewport,
        screenshots,
        timeoutMs,
      }).then((nestedRun) => ({
        ...nestedRun,
        actor: pickActorKey,
        process: 'task_claim_start_confirm',
        durationMs: Date.now() - nestedStarted,
        taskReference,
      }));
    }));
    nestedRuns.push(...dynamicRuns);
    failures.push(...dynamicRuns.filter((nested) => !nested.ok).map((nested) => `${nested.actor}/${nested.taskReference}: ${(nested.failures ?? []).join('; ') || 'dynamic pick failed'}`));
  }

  const expectedFailureObserved = action.expectFailure === true && !run.ok;
  return {
    actor: actorKey,
    actorLabel: actor.label,
    role: actor.role,
    process: action.process,
    expectedFailure: action.expectFailure === true,
    expectedFailureObserved,
    ok: failures.length === 0,
    durationMs: Date.now() - started,
    reportPath: run.reportPath,
    screenshotsDir: run.screenshotsDir,
    failures,
    events: run.events ?? [],
    overflowCount: run.overflowCount ?? 0,
    run,
    nestedRuns,
  };
}

async function runShiftActionWithRetries(options) {
  const maxAttempts = Math.max(1, Number(options.action?.maxAttempts ?? 3));
  const retrySummaries = [];
  let lastRun = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    lastRun = await runShiftAction(options);
    if (attempt > 1) lastRun.retryAttempt = attempt;
    if (lastRun.ok || lastRun.expectedFailureObserved || !isRetryableShiftRun(lastRun) || Date.now() >= options.deadline) {
      if (retrySummaries.length > 0) lastRun.retryAttempts = retrySummaries;
      return lastRun;
    }

    retrySummaries.push({
      attempt,
      failures: lastRun.failures ?? [],
      reportPath: lastRun.reportPath,
    });
    await delay(Math.min(1500 * attempt, 5000));
  }

  if (lastRun && retrySummaries.length > 0) lastRun.retryAttempts = retrySummaries;
  return lastRun;
}

async function createShiftHardwareRuntime(options) {
  const config = options.scenario?.mcpShift?.hardwareLab ?? {};
  const host = String(config.fakePrinterHost ?? '127.0.0.1').trim() || '127.0.0.1';
  const port = normalizePort(config.fakePrinterPort ?? 19101);
  const warehouseCode = String(options.scenario?.mcpShift?.warehouseCode ?? options.scenario?.warehouse?.code ?? 'MAIN').trim().toUpperCase();
  const printerCode = normalizeHardwareCode(config.printerCode ?? 'MCP-SHIFT-PRINTER', 'MCP-SHIFT-PRINTER');
  const agentCode = normalizeHardwareCode(config.agentCode ?? 'MCP-SHIFT-AGENT', 'MCP-SHIFT-AGENT');
  const agentToken = String(config.agentToken ?? 'mcp-shift-agent-token-2026-local-secret').trim();
  const captureDir = join(options.reportDir, 'in-shift-hardware');
  const fakePrinter = await startFakeZplPrinter({ host, port, reportDir: captureDir });
  const runtime = {
    name: 'shift_in_operation_fake_tcp_9100',
    mode: options.mode,
    warehouseCode,
    printerCode,
    agentCode,
    agentToken,
    host,
    port,
    captureDir,
    renderMode: normalizeHardwareRenderMode(String(config.renderMode ?? 'offline')),
    maxRenderedCaptures: Math.max(1, Math.min(100, Number(config.maxRenderedCaptures ?? 25))),
    allowExternalLabelary: config.allowExternalLabelary === true,
    autoCaptureQueuedLabels: config.autoCaptureQueuedLabels !== false,
    fakePrinter,
    runs: [],
    failures: [],
    queue: Promise.resolve(),
    async close() {
      await runtime.queue.catch(() => null);
      await fakePrinter.close().catch(() => null);
    },
  };
  return runtime;
}

function shouldCaptureShiftHardwareAction(runtime, action, data) {
  if (!runtime) return false;
  if (!['label_preview_and_queue', 'print_setup_and_label_queue'].includes(String(action?.process ?? ''))) return false;
  if (action?.expectFailure === true || data?.enqueue === false) return false;
  if (data?.fakeTcpCapture === true) return true;
  if (runtime.autoCaptureQueuedLabels !== true) return false;
  return normalizeHardwareCode(data?.printerCode, '') === runtime.printerCode;
}

async function runShiftHardwareAfterAction(options) {
  const runtime = options.shiftHardwareRuntime;
  if (!shouldCaptureShiftHardwareAction(runtime, options.action, options.data)) return null;
  const action = options.action;
  const data = options.data ?? {};
  const steps = Array.isArray(options.steps) ? options.steps : [];
  const runNumber = runtime.runs.length + 1;
  const captureDir = join(
    runtime.captureDir,
    `${String(runNumber).padStart(3, '0')}-${safeFile(String(action.actor ?? 'actor'))}-${safeFile(String(data.labelCode ?? action.process ?? 'label'))}`,
  );
  await mkdir(captureDir, { recursive: true });

  const run = await enqueueShiftHardwareRuntime(runtime, async () => {
    const renderMode = runNumber <= runtime.maxRenderedCaptures ? runtime.renderMode : 'none';
    const captureRun = await simulatePrintAgentTcpCapture(options.backendUrl, {
      warehouseCode: runtime.warehouseCode,
      agentCode: runtime.agentCode,
      token: runtime.agentToken,
      timeoutMs: Math.min(options.timeoutMs ?? 30000, 25000),
      fakePrinter: runtime.fakePrinter,
      host: runtime.host,
      port: runtime.port,
      reportDir: captureDir,
      renderMode,
      allowExternalLabelary: runtime.allowExternalLabelary,
      reportPrintResult: true,
    });
    const entry = {
      ...captureRun,
      actor: String(action.actor ?? ''),
      process: String(action.process ?? ''),
      labelCode: data.labelCode ?? null,
      captureDir,
    };
    runtime.runs.push({
      actor: entry.actor,
      process: entry.process,
      labelCode: entry.labelCode,
      ok: entry.ok,
      status: entry.status,
      claimedJobId: entry.claimedJobId,
      capturePath: entry.capture?.filePath ?? null,
      renderArtifacts: entry.render?.artifacts ?? [],
      failure: entry.failure,
    });
    if (!captureRun.ok) runtime.failures.push(captureRun.failure ?? 'in-shift fake TCP 9100 capture failed');
    return entry;
  });

  steps.push({
    action: 'shift-fake-tcp-9100-capture',
    ok: run.ok,
    status: run.status,
    claimedJobId: run.claimedJobId,
    capturePath: run.capture?.filePath ?? null,
    renderArtifacts: run.render?.artifacts ?? [],
    failure: run.failure,
  });
  if (!run.ok) throw new Error(run.failure ?? 'in-shift fake TCP 9100 capture failed');
  return run;
}

async function enqueueShiftHardwareRuntime(runtime, operation) {
  const task = runtime.queue.catch(() => null).then(operation);
  runtime.queue = task.catch(() => null);
  return task;
}

function summarizeShiftHardwareRuntime(runtime) {
  if (!runtime) return null;
  const captures = runtime.fakePrinter?.captures ?? [];
  return {
    name: runtime.name,
    mode: runtime.mode,
    warehouseCode: runtime.warehouseCode,
    printer: {
      code: runtime.printerCode,
      host: runtime.host,
      port: runtime.port,
      protocol: 'TCP_9100',
    },
    agent: { code: runtime.agentCode },
    captureDir: runtime.captureDir,
    captureCount: captures.length,
    captures: captures.map((capture) => ({
      index: capture.index,
      filePath: capture.filePath,
      bytes: capture.bytes,
      ok: capture.validation?.ok,
      errors: capture.validation?.errors ?? [],
      receivedAt: capture.receivedAt,
    })),
    runs: runtime.runs.map((run) => ({
      actor: run.actor,
      process: run.process,
      labelCode: run.labelCode,
      ok: run.ok,
      status: run.status,
      claimedJobId: run.claimedJobId,
      capturePath: run.capture?.filePath ?? null,
      renderArtifacts: run.render?.artifacts ?? [],
      failure: run.failure,
    })),
    failures: runtime.failures,
    ok: runtime.failures.length === 0 && runtime.runs.length > 0 && captures.some((capture) => capture.validation?.ok),
  };
}

function isRetryableShiftRun(run) {
  const text = shiftRunFailureText(run);
  return [
    'konflikt',
    'conflict',
    'akce uz probehla',
    'cdp timeout',
    'missing table row',
    'server neodpovedel',
    'fetch failed',
    'target closed',
    'prihlaseni vyprselo',
    'session expired',
    'token expired',
    'unauthorized',
    '401',
  ].some((marker) => text.includes(marker));
}

function isAuthExpiredShiftRun(run) {
  const text = shiftRunFailureText(run);
  return [
    'prihlaseni vyprselo',
    'session expired',
    'token expired',
    'unauthorized',
    '401',
  ].some((marker) => text.includes(marker));
}

function shiftRunFailureText(run) {
  const text = [
    ...(run?.failures ?? []),
    ...(run?.nestedRuns ?? []).flatMap((nested) => nested.failures ?? []),
  ].join(' ').toLowerCase();
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function loginBackendForActor(backendUrl, actor, timeoutMs) {
  const response = await apiFetch(backendUrl, '/auth/login', {
    method: 'POST',
    body: { email: actor.loginName, password: actor.password },
    timeoutMs,
  });
  if (!response.accessToken) throw new Error('login response did not contain accessToken');
  return response.accessToken;
}

async function validateShiftActorCredentials(backendUrl, actors, timeoutMs) {
  const entries = Object.entries(actors);
  return Promise.all(entries.map(async ([actorKey, actor]) => {
    const started = Date.now();
    try {
      const token = await loginBackendForActor(backendUrl, actor, timeoutMs);
      return {
        actor: actorKey,
        role: actor.role,
        loginName: actor.loginName,
        ok: Boolean(token),
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      return {
        actor: actorKey,
        role: actor.role,
        loginName: actor.loginName,
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }));
}

async function captureShiftSnapshot(backendUrl, token, scenario, timeoutMs, label) {
  const warehouseCode = scenario?.mcpShift?.warehouseCode ?? scenario?.warehouse?.code ?? 'MAIN';
  const snapshot = {
    label,
    warehouseCode,
    capturedAt: new Date().toISOString(),
    ok: true,
    failures: [],
    counts: {},
    invariants: {},
    samples: {},
  };

  const endpoints = {
    inventoryConsistency: `/warehouses/${warehouseCode}/inventory/consistency`,
    quants: `/warehouses/${warehouseCode}/inventory/quants?includeZero=true&take=500`,
    tasks: `/warehouses/${warehouseCode}/tasks?take=500`,
    outboundOrders: `/warehouses/${warehouseCode}/outbound-orders?take=500`,
    inboundShipments: `/warehouses/${warehouseCode}/inbound-shipments?take=200`,
    printJobs: `/warehouses/${warehouseCode}/print-jobs?take=200`,
    shipments: `/warehouses/${warehouseCode}/shipments?take=200`,
  };

  const payloads = {};
  for (const [key, path] of Object.entries(endpoints)) {
    try {
      payloads[key] = await apiFetch(backendUrl, path, { token, timeoutMs });
    } catch (error) {
      snapshot.failures.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      payloads[key] = null;
    }
  }

  const quants = unwrapArray(payloads.quants);
  const tasks = unwrapArray(payloads.tasks);
  const orders = unwrapArray(payloads.outboundOrders);
  const inbound = unwrapArray(payloads.inboundShipments);
  const printJobs = unwrapArray(payloads.printJobs);
  const shipments = unwrapArray(payloads.shipments);

  const negativeQuants = quants.filter((row) => Number(row.quantity ?? row.availableQuantity ?? 0) < 0);
  const overReservedQuants = quants.filter((row) => Number(row.reservedQuantity ?? 0) > Number(row.quantity ?? row.availableQuantity ?? 0));
  const doneTasks = tasks.filter((row) => String(row.status ?? '').toUpperCase() === 'DONE');
  const activeTasks = tasks.filter((row) => !['DONE', 'CANCELLED', 'FAILED'].includes(String(row.status ?? '').toUpperCase()));
  const shippedOrders = orders.filter((row) => ['SHIPPED', 'COMPLETED', 'CLOSED'].includes(String(row.status ?? '').toUpperCase()));
  const terminalPrintJobs = printJobs.filter((row) => ['PRINTED', 'FAILED', 'CANCELLED'].includes(String(row.status ?? '').toUpperCase()));

  snapshot.counts = {
    quants: quants.length,
    tasks: tasks.length,
    activeTasks: activeTasks.length,
    doneTasks: doneTasks.length,
    outboundOrders: orders.length,
    shippedOrders: shippedOrders.length,
    inboundShipments: inbound.length,
    printJobs: printJobs.length,
    terminalPrintJobs: terminalPrintJobs.length,
    shipments: shipments.length,
  };
  snapshot.invariants = {
    negativeQuants: negativeQuants.length,
    overReservedQuants: overReservedQuants.length,
    inventoryConsistency: payloads.inventoryConsistency,
  };
  snapshot.samples = {
    tasks: tasks.slice(0, 5).map((row) => pickFields(row, ['id', 'type', 'status', 'quantity', 'outboundOrderId'])),
    orders: orders.slice(0, 5).map((row) => pickFields(row, ['id', 'orderNumber', 'status', 'priority'])),
    printJobs: printJobs.slice(0, 5).map((row) => pickFields(row, ['id', 'status', 'printerName', 'labelReference'])),
  };
  snapshot.ok = snapshot.failures.length === 0 && negativeQuants.length === 0 && overReservedQuants.length === 0;
  return snapshot;
}

function assertShiftInvariants(initialSnapshot, finalSnapshot) {
  const assertions = [];
  const finalCounts = finalSnapshot?.counts ?? {};
  const finalInvariants = finalSnapshot?.invariants ?? {};
  const initialCounts = initialSnapshot?.counts ?? {};

  assertions.push({
    name: 'inventory_no_negative_quants',
    ok: Number(finalInvariants.negativeQuants ?? 0) === 0,
    value: finalInvariants.negativeQuants ?? 0,
    failure: Number(finalInvariants.negativeQuants ?? 0) === 0 ? undefined : 'At least one stock quant is negative.',
  });
  assertions.push({
    name: 'inventory_reserved_not_above_quantity',
    ok: Number(finalInvariants.overReservedQuants ?? 0) === 0,
    value: finalInvariants.overReservedQuants ?? 0,
    failure: Number(finalInvariants.overReservedQuants ?? 0) === 0 ? undefined : 'At least one stock quant has reserved quantity above available quantity.',
  });
  assertions.push({
    name: 'tasks_progressed_to_terminal_state',
    ok: Number(finalCounts.doneTasks ?? 0) > Number(initialCounts.doneTasks ?? 0),
    before: initialCounts.doneTasks ?? 0,
    after: finalCounts.doneTasks ?? 0,
    failure: Number(finalCounts.doneTasks ?? 0) > Number(initialCounts.doneTasks ?? 0) ? undefined : 'No warehouse task reached DONE during the shift.',
  });
  assertions.push({
    name: 'print_queue_has_terminal_state',
    ok: Number(finalCounts.terminalPrintJobs ?? 0) > 0,
    value: finalCounts.terminalPrintJobs ?? 0,
    failure: Number(finalCounts.terminalPrintJobs ?? 0) > 0 ? undefined : 'No print job reached PRINTED/FAILED/CANCELLED during the shift.',
  });
  assertions.push({
    name: 'backend_snapshot_complete',
    ok: Boolean(finalSnapshot?.ok),
    failures: finalSnapshot?.failures ?? [],
    failure: finalSnapshot?.ok ? undefined : `Final backend snapshot failed: ${(finalSnapshot?.failures ?? []).join('; ')}`,
  });
  return assertions;
}

function buildShiftReadinessAssertions(options) {
  const gate = options.readinessGate;
  if (!gate?.enabled) return [];
  const actors = options.actors ?? {};
  const managerCount = actors.manager?.role === 'vedouci' ? 1 : 0;
  const workerCount = Number(options.workerCount ?? shiftWorkerKeysFromActors(actors).length);
  const terminalAssertions = options.terminalStateAssertions ?? [];
  const fakePrint = terminalAssertions.find((item) => item.name === 'shift_in_operation_fake_tcp_9100');
  const multiPrinterFailover = terminalAssertions.find((item) => item.name === 'multi_printer_retry_failover');
  const backendFailures = (options.backendAssertions ?? []).filter((item) => !item.ok);

  return [
    {
      name: 'readiness_gate_duration',
      ok: Number(options.durationMinutes) === Number(gate.durationMinutes),
      expectedMinutes: gate.durationMinutes,
      actualMinutes: options.durationMinutes,
      failure: Number(options.durationMinutes) === Number(gate.durationMinutes)
        ? undefined
        : `Readiness gate expected ${gate.durationMinutes} minutes but ran ${options.durationMinutes}.`,
    },
    {
      name: 'readiness_gate_actor_mix',
      ok: managerCount === gate.managerCount && workerCount === gate.workerCount,
      expectedManagers: gate.managerCount,
      actualManagers: managerCount,
      expectedWorkers: gate.workerCount,
      actualWorkers: workerCount,
      failure: managerCount === gate.managerCount && workerCount === gate.workerCount
        ? undefined
        : `Readiness gate expected ${gate.managerCount} manager and ${gate.workerCount} workers, got ${managerCount} manager and ${workerCount} workers.`,
    },
    {
      name: 'readiness_gate_in_shift_fake_print',
      ok: options.runHardwareInShift === true && fakePrint?.ok === true,
      runHardwareInShift: options.runHardwareInShift,
      captureCount: fakePrint?.summaries?.reduce((sum, item) => sum + Number(item.captureCount ?? 0), 0) ?? 0,
      failure: options.runHardwareInShift === true && fakePrint?.ok === true
        ? undefined
        : 'Readiness gate requires in-shift fake TCP 9100 print capture.',
    },
    {
      name: 'readiness_gate_multi_printer_retry_failover',
      ok: multiPrinterFailover?.ok === true && multiPrinterFailover?.wrongAgentBlocked === true && multiPrinterFailover?.secondaryPrinted === true,
      primaryPrinter: multiPrinterFailover?.primaryPrinter,
      secondaryPrinter: multiPrinterFailover?.secondaryPrinter,
      wrongAgentBlocked: multiPrinterFailover?.wrongAgentBlocked,
      secondaryPrinted: multiPrinterFailover?.secondaryPrinted,
      captureCount: multiPrinterFailover?.captureCount ?? 0,
      failure: multiPrinterFailover?.ok === true && multiPrinterFailover?.wrongAgentBlocked === true && multiPrinterFailover?.secondaryPrinted === true
        ? undefined
        : 'Readiness gate requires multi-printer retry/failover with wrong-agent routing blocked and secondary fake printer capture.',
    },
    {
      name: 'readiness_gate_backend_invariants',
      ok: backendFailures.length === 0,
      failures: backendFailures.map((item) => item.name),
      failure: backendFailures.length === 0
        ? undefined
        : `Readiness gate backend assertions failed: ${backendFailures.map((item) => item.name).join(', ')}`,
    },
  ];
}

function pickFields(row, fields) {
  const source = row && typeof row === 'object' ? row : {};
  return Object.fromEntries(fields.map((field) => [field, source[field]]));
}

function flattenShiftRuns(phaseResults) {
  return phaseResults.flatMap((phase) => (phase.actions ?? []).flatMap((action) => [action, ...(action.nestedRuns ?? [])]));
}

function summarizeShiftLatency(runs) {
  const values = runs.map((run) => Number(run.durationMs ?? 0)).filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (values.length === 0) return { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  return {
    count: values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
    maxMs: values[values.length - 1],
  };
}

function percentile(sortedValues, percentileValue) {
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1));
  return sortedValues[index];
}

function buildUiCleanupFindings({ uiAudit, backendAssertions, phaseResults }) {
  const findings = [];
  const failedActions = flattenShiftRuns(phaseResults).filter((run) => !run.ok && !run.expectedFailure);
  if (failedActions.length > 0) {
    findings.push({
      severity: 'P1',
      area: 'workflow',
      finding: 'Některé provozní akce neproběhly čistě přes UI.',
      evidence: failedActions.slice(0, 5).map((run) => `${run.actor}/${run.process}`),
    });
  }
  const failedAssertions = (backendAssertions ?? []).filter((assertion) => !assertion.ok);
  if (failedAssertions.length > 0) {
    findings.push({
      severity: 'P0',
      area: 'backend-state',
      finding: 'Backend invariant po směně neprošel.',
      evidence: failedAssertions.map((assertion) => assertion.name),
    });
  }
  if (uiAudit && !uiAudit.ok) {
    findings.push({
      severity: 'P1',
      area: 'frontend-cleanup',
      finding: 'Employee frontend audit našel problém v použitelnosti, překladu, overflow nebo stuck tlačítku.',
      evidence: (uiAudit.failures ?? []).slice(0, 8),
    });
  }
  findings.push({
    severity: 'P2',
    area: 'frontend-cleanup',
    finding: 'RF test assist tlačítka jsou vhodná pro MCP/dev, ale v produkčním UI musí zůstat schovaná přes DEV/mock gate.',
    evidence: ['rf-fill-expected', 'packing-fill-sku'],
  });
  return findings;
}

async function waitUntil(timestampMs) {
  const remaining = timestampMs - Date.now();
  if (remaining > 0) await delay(remaining);
}

async function employeeFrontendAudit(args) {
  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const backendUrl = args.backendUrl ?? 'http://localhost:4001/api';
  const timeoutMs = args.timeoutMs ?? 30000;
  const screenshots = args.screenshots !== false;
  const fillControls = args.fillControls !== false;
  const failOnOverflow = args.failOnOverflow !== false;
  const roles = normalizeRoleList(args.roles);
  const languages = normalizeLanguageList(args.languages);
  const viewports = normalizeViewportList(args.viewports);
  const report = createReport('employee-frontend-audit', `${roles.join('-')}-${languages.join('-')}`);
  await mkdir(report.dir, { recursive: true });

  const runs = [];
  const failures = [];

  for (const role of roles) {
    const profile = roleProfiles[role];
    if (!profile) {
      failures.push(`Unknown role: ${role}`);
      continue;
    }

    for (const language of languages) {
      for (const viewport of viewports) {
        const run = await runEmployeeFrontendAuditForRole({
          role,
          profile,
          language,
          viewport,
          frontendUrl,
          backendUrl,
          timeoutMs,
          screenshots,
          fillControls,
          failOnOverflow,
          reportDir: report.dir,
        });
        runs.push(run);
        failures.push(...run.failures.map((failure) => `${role}/${language}/${viewport.width}x${viewport.height}: ${failure}`));
      }
    }
  }

  const result = {
    ok: failures.length === 0 && runs.every((run) => run.ok),
    frontendUrl,
    backendUrl,
    roles,
    languages,
    viewports,
    fillControls,
    failOnOverflow,
    reportPath: report.file,
    screenshotsDir: report.dir,
    failures,
    runs,
  };
  await writeJson(report.file, result);
  return result;
}

async function runEmployeeFrontendAuditForRole(options) {
  const {
    role,
    profile,
    language,
    viewport,
    frontendUrl,
    backendUrl,
    timeoutMs,
    screenshots,
    fillControls,
    failOnOverflow,
    reportDir,
  } = options;
  const credentials = resolveCredentials(role, profile, {});
  const runLabel = `${role}-${language}-${viewport.width}x${viewport.height}`;
  const browser = await launchBrowser({ viewport });
  const page = await browser.newPage();
  const events = [];
  const failures = [];
  const routeResults = [];

  try {
    await page.enable();
    page.onConsole((entry) => {
      if (['error', 'warning'].includes(entry.type)) events.push({ type: 'console', ...entry });
    });
    page.onPageError((entry) => events.push({ type: 'pageError', ...entry }));

    await loginToFrontend(page, {
      frontendUrl,
      loginName: credentials.loginName,
      password: credentials.password,
      language,
      timeoutMs,
      failures,
    });

    if (screenshots) await page.screenshot(join(reportDir, `${runLabel}-01-after-login.png`));

    if (failures.length === 0) {
      const bodyText = await page.text();
      if (viewport.width >= 900) {
        expectIncludes(bodyText, languageList(profile, 'expectedMenu', language), failures, 'expected menu');
      }
      expectExcludes(bodyText, languageList(profile, 'forbiddenMenu', language), failures, 'forbidden menu');

      let index = 2;
      for (const route of profile.routes) {
        await navigateHash(page, route.hash);
        await waitForUiSettle(page, timeoutMs);

        const routeFailures = [];
        const routeText = await page.text();
        expectIncludes(routeText, languageList(route, 'expects', language), routeFailures, `route ${route.hash}`);

        const seed = `${role}-${safeFile(route.hash)}-${Date.now()}`;
        const controlAudit = fillControls ? await page.auditAndFillControls(seed) : { editableCount: 0, filledCount: 0, skippedCount: 0, fields: [], failures: [] };
        await waitForUiSettle(page, timeoutMs);
        const buttonAudit = await page.readButtonAudit();
        const stuckButtons = buttonAudit.buttons.filter((button) => button.busy);
        const overflow = await page.detectOverflow(20);
        const apiErrors = extractApiErrors(await page.text());
        routeFailures.push(...controlAudit.failures);
        routeFailures.push(...apiErrors);
        if (failOnOverflow && overflow.length > 0) {
          routeFailures.push(`route ${route.hash}: overflowCount ${overflow.length}`);
        }
        if (stuckButtons.length > 0) {
          routeFailures.push(`route ${route.hash}: buttons still look busy after wait: ${stuckButtons.map((button) => button.text).join(', ')}`);
        }

        const screenshotPath = screenshots ? join(reportDir, `${runLabel}-${String(index).padStart(2, '0')}-${safeFile(route.hash)}.png`) : null;
        if (screenshotPath) await page.screenshot(screenshotPath);

        routeResults.push({
          route: route.hash,
          ok: routeFailures.length === 0,
          failures: routeFailures,
          controls: {
            editableCount: controlAudit.editableCount,
            filledCount: controlAudit.filledCount,
            skippedCount: controlAudit.skippedCount,
            fields: controlAudit.fields.slice(0, 40),
          },
          buttons: {
            total: buttonAudit.total,
            enabled: buttonAudit.enabled,
            disabled: buttonAudit.disabled,
            busy: stuckButtons.length,
            items: buttonAudit.buttons.slice(0, 40),
          },
          overflowCount: overflow.length,
          overflow: overflow.slice(0, 10),
          screenshot: screenshotPath,
        });
        failures.push(...routeFailures);
        index += 1;
      }
    }

    return {
      ok: failures.length === 0 && events.every((entry) => entry.type !== 'pageError'),
      role,
      roleLabel: profile.label,
      language,
      viewport,
      frontendUrl,
      backendUrl,
      loginName: credentials.loginName,
      failures,
      events,
      routes: routeResults,
    };
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    if (screenshots) await page.screenshot(join(reportDir, `${runLabel}-error.png`)).catch(() => null);
    return {
      ok: false,
      role,
      roleLabel: profile.label,
      language,
      viewport,
      frontendUrl,
      backendUrl,
      loginName: credentials.loginName,
      failures,
      events,
      routes: routeResults,
    };
  } finally {
    await browser.close();
  }
}

async function overflowScan(args) {
  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const timeoutMs = args.timeoutMs ?? 15000;
  const viewport = normalizeViewport(args.viewport);
  const report = createReport('overflow-scan', 'ui');
  await mkdir(report.dir, { recursive: true });

  const browser = await launchBrowser({ viewport });
  const page = await browser.newPage();
  try {
    await page.enable();
    await page.navigate(frontendUrl, timeoutMs);
    await page.waitForIdle(1000);
    const overflow = await page.detectOverflow(50);
    const screenshotPath = join(report.dir, 'overflow-scan.png');
    await page.screenshot(screenshotPath);
    const result = {
      ok: overflow.length === 0,
      frontendUrl,
      overflowCount: overflow.length,
      overflow,
      screenshot: screenshotPath,
      reportPath: report.file,
    };
    await writeJson(report.file, result);
    return result;
  } finally {
    await browser.close();
  }
}

async function hardwareSimLab(args) {
  const frontendUrl = args.frontendUrl ?? 'http://localhost:4000';
  const backendUrl = args.backendUrl ?? 'http://localhost:4001/api';
  const timeoutMs = Number(args.timeoutMs ?? 45000);
  const language = normalizeLanguage(args.language);
  const viewport = normalizeViewport(args.viewport);
  const screenshots = args.screenshots !== false;
  const scenarioPath = resolveScenarioPath(args.scenarioPath ?? 'MCP/scenarios/hardware-labels-lite.json');
  const renderMode = normalizeHardwareRenderMode(args.renderMode);
  const runScanner = args.runScanner !== false;
  const runPrinter = args.runPrinter !== false;
  const ensureRfTask = args.ensureRfTask !== false;
  const allowExternalLabelary = args.allowExternalLabelary === true || process.env.AARDVARK_MCP_ALLOW_LABELARY === 'true';

  const targetSafety = args.allowNonLocalTargets === true ? [] : [
    assertLocalHttpTarget('frontendUrl', frontendUrl),
    assertLocalHttpTarget('backendUrl', backendUrl),
  ];
  const unsafeTarget = targetSafety.find((check) => !check.ok);
  if (unsafeTarget) {
    return {
      ok: false,
      error: `${unsafeTarget.error}. Set allowNonLocalTargets=true only for an explicitly approved staging simulator run.`,
      targetSafety,
    };
  }

  const report = createReport('hardware-sim-lab', 'hybrid');
  await mkdir(report.dir, { recursive: true });

  const setup = {
    frontendUrl,
    backendUrl,
    scenarioPath,
    language,
    viewport,
    renderMode,
    allowExternalLabelary,
    runScanner,
    runPrinter,
    runMultiPrinterFailover: args.runMultiPrinterFailover !== false,
    failoverFakePrinterPort: Number(args.failoverFakePrinterPort ?? 19102),
    health: [],
  };
  const failures = [];
  let scenario = {};

  try {
    scenario = JSON.parse(await readFile(scenarioPath, 'utf8'));
  } catch (error) {
    failures.push(`Scenario could not be read: ${error instanceof Error ? error.message : String(error)}`);
  }

  const warehouseCode = String(args.warehouseCode ?? scenario?.warehouse?.code ?? scenario?.warehouseId ?? 'MAIN').trim() || 'MAIN';
  const scannerPayloads = normalizeHardwareScannerPayloads(args.scannerPayloads ?? scenario?.scannerPayloads, warehouseCode);

  setup.health = await Promise.all([
    httpCheckWithRetry('frontendHealth', new URL('/healthz', frontendUrl).toString(), timeoutMs),
    httpCheckWithRetry('backendHealth', joinUrl(backendUrl, '/health'), timeoutMs, 20),
    httpCheckWithRetry('backendReady', joinUrl(backendUrl, '/health/ready'), timeoutMs, 20),
  ]);
  failures.push(...setup.health.filter((check) => !check.ok).map((check) => `${check.name} failed: ${check.status || check.error}`));

  const scanner = runScanner && failures.length === 0
    ? await runHardwareScannerLab({
        frontendUrl,
        backendUrl,
        language,
        viewport,
        timeoutMs,
        screenshots,
        reportDir: report.dir,
        warehouseCode,
        payloads: scannerPayloads,
        ensureRfTask,
        credentialsArgs: args,
      })
    : { ok: !runScanner, skipped: !runScanner, payloads: scannerPayloads };
  if (scanner.failures?.length) failures.push(...scanner.failures.map((failure) => `scanner: ${failure}`));

  const printer = runPrinter && failures.length === 0
    ? await runHardwarePrinterLab({
        frontendUrl,
        backendUrl,
        language,
        viewport,
        timeoutMs,
        screenshots,
        reportDir: report.dir,
        warehouseCode,
        scenario,
        args,
        renderMode,
        allowExternalLabelary,
      })
    : { ok: !runPrinter, skipped: !runPrinter };
  if (printer.failures?.length) failures.push(...printer.failures.map((failure) => `printer: ${failure}`));

  const multiPrinterFailover = args.runMultiPrinterFailover !== false && failures.length === 0
    ? await runMultiPrinterRetryFailoverLab({
        backendUrl,
        warehouseCode,
        reportDir: join(report.dir, 'multi-printer-failover'),
        timeoutMs,
        credentialsArgs: args,
        fakePrinterHost: args.fakePrinterHost,
        fakePrinterPort: args.failoverFakePrinterPort ?? scenario?.labelPrint?.failoverFakePrinterPort ?? 19102,
        renderMode,
        allowExternalLabelary,
      })
    : { ok: args.runMultiPrinterFailover === false, skipped: args.runMultiPrinterFailover === false };
  if (multiPrinterFailover.failures?.length) {
    failures.push(...multiPrinterFailover.failures.map((failure) => `multi-printer failover: ${failure}`));
  }

  const result = {
    ok: failures.length === 0 && scanner.ok !== false && printer.ok !== false && multiPrinterFailover.ok !== false,
    setup,
    warehouseCode,
    reportPath: report.file,
    artifactsDir: report.dir,
    failures,
    scanner,
    printer,
    multiPrinterFailover,
  };
  await writeJson(report.file, result);
  return result;
}

async function runHardwareScannerLab(options) {
  const failures = [];
  const events = [];
  const results = [];
  let ensuredTask = null;
  let ensuredScanner = null;
  let screenshot = null;
  let token = null;
  let browser = null;
  let page = null;

  try {
    token = await loginBackendForHardwareRole(options.backendUrl, 'skladnik', options.credentialsArgs, options.timeoutMs);
  } catch (error) {
    failures.push(`backend scanner login failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (token && options.ensureRfTask) {
    try {
      const adminToken = await loginBackendForHardwareRole(options.backendUrl, 'spravce', options.credentialsArgs, options.timeoutMs);
      ensuredScanner = await ensureHardwareScanner(options.backendUrl, options.warehouseCode, adminToken, options.timeoutMs);
      ensuredTask = await ensureHardwareRfTask(options.backendUrl, options.warehouseCode, token, adminToken, options.timeoutMs);
    } catch (error) {
      events.push({
        type: 'ensure-rf-setup',
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  try {
    browser = await launchBrowser({ viewport: options.viewport });
    page = await browser.newPage();
    page.onConsole((event) => events.push({ type: 'console', ...event }));
    page.onPageError((event) => events.push({ type: 'pageError', ...event }));
    await page.enable();

    const credentials = resolveCredentials('skladnik', roleProfiles.skladnik, options.credentialsArgs ?? {});
    await loginToFrontend(page, {
      frontendUrl: options.frontendUrl,
      backendUrl: options.backendUrl,
      loginName: credentials.loginName,
      password: credentials.password,
      language: options.language,
      timeoutMs: options.timeoutMs,
    });
    await navigateHash(page, '/rf');
    await page.clickMcpAction('rf-start-resume', Math.min(options.timeoutMs, 8000)).catch((error) => {
      events.push({
        type: 'rf-start-resume',
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    });

    const taskRowCount = await visibleMcpRowCount(page, 'rf-task').catch(() => 0);
    for (const payload of options.payloads) {
      const ui = await injectHardwareScannerPayload(page, payload, options.timeoutMs);
      const backend = token
        ? await resolveHardwareScan(options.backendUrl, options.warehouseCode, token, payload, options.timeoutMs)
        : { ok: false, failure: 'Backend login was not available.' };
      results.push({
        ...payload,
        ui,
        backend,
        ok: backend.ok && (ui.ok || taskRowCount === 0),
      });
    }

    if (options.screenshots) {
      screenshot = join(options.reportDir, 'scanner-rf-final.png');
      await page.screenshot(screenshot).catch(() => null);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    if (page && options.screenshots) {
      screenshot = join(options.reportDir, 'scanner-rf-error.png');
      await page.screenshot(screenshot).catch(() => null);
    }
  } finally {
    await browser?.close();
  }

  const backendFailures = results
    .filter((result) => !result.backend?.ok)
    .map((result) => `${result.type}:${result.value} -> ${result.backend?.failure ?? 'backend assertion failed'}`);
  const uiFailures = results
    .filter((result) => !result.ui?.ok || isRfScannerSetupError(result.ui?.statusText))
    .map((result) => `${result.type}:${result.value} -> ${result.ui?.failure ?? result.ui?.statusText ?? 'RF scanner UI did not accept the payload'}`);
  failures.push(...backendFailures);
  failures.push(...uiFailures);

  return {
    ok: failures.length === 0,
    warehouseCode: options.warehouseCode,
    ensuredScanner,
    ensuredTask,
    count: results.length,
    events,
    failures,
    screenshot,
    results,
  };
}

function isRfScannerSetupError(value) {
  return String(value ?? '').toLowerCase().includes('scanner device was not found');
}

async function injectHardwareScannerPayload(page, payload, timeoutMs) {
  try {
    await page.keyboardWedgeScanByTestId('rf-scan-input', payload.value, payload.terminator);
    await waitForApiSettle(page, Math.min(timeoutMs, 10000));
    return {
      ok: true,
      terminator: payload.terminator,
      statusText: await actionStatus(page),
      remainingInputValue: await page.readControlValueByTestId('rf-scan-input').catch(() => null),
    };
  } catch (error) {
    return {
      ok: false,
      terminator: payload.terminator,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveHardwareScan(backendUrl, warehouseCode, token, payload, timeoutMs) {
  try {
    const response = unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/scans/resolve`, {
      method: 'POST',
      token,
      timeoutMs,
      body: {
        scannedValue: payload.backendValue,
        metadata: {
          source: 'mcp-hardware-sim-lab',
          payloadType: payload.type,
          terminator: payload.terminator,
        },
      },
    }));
    const parsed = response?.parsed ?? null;
    const resolved = response?.resolved ?? null;
    return {
      ok: Boolean(parsed?.kind),
      parsedKind: parsed?.kind ?? null,
      parsed,
      resolved,
      failure: !parsed?.kind ? 'Scan resolver did not return a parsed kind.' : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

async function ensureHardwareRfTask(backendUrl, warehouseCode, workerToken, adminToken, timeoutMs) {
  const queue = unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/rf/queue?limit=20`, {
    token: workerToken,
    timeoutMs,
  }));
  const existingTasks = Array.isArray(queue?.tasks) ? queue.tasks : [];
  const reusable = existingTasks.find((task) => !['DONE', 'FAILED', 'CANCELLED'].includes(String(task?.status ?? '')));
  if (reusable?.id) return { created: false, taskId: reusable.id, status: reusable.status };

  const stamp = Date.now().toString(36).toUpperCase();
  const created = unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/tasks`, {
    method: 'POST',
    token: adminToken,
    timeoutMs,
    headers: {
      'Idempotency-Key': `hardware-sim-rf-task-${stamp}`,
    },
    body: {
      type: 'MOVE',
      status: 'OPEN',
      fromLocationReference: 'A-01-01',
      toLocationReference: 'A-01-01',
      quantity: 1,
      metadata: {
        source: 'mcp-hardware-sim-lab',
        purpose: 'scanner-ui-input',
      },
    },
  }));
  return { created: true, taskId: created?.id ?? null, status: created?.status ?? null };
}

async function ensureHardwareScanner(backendUrl, warehouseCode, adminToken, timeoutMs) {
  const scannerCode = `RF-${String(warehouseCode).trim().toUpperCase() || 'MAIN'}`;
  const scanners = unwrapArray(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/scanners`, {
    token: adminToken,
    timeoutMs,
  }));
  const existing = scanners.find((scanner) => String(scanner?.code ?? '').toUpperCase() === scannerCode);

  if (existing?.id || existing?.code) {
    const updated = unwrapObject(await apiFetch(
      backendUrl,
      `/warehouses/${encodeURIComponent(warehouseCode)}/scanners/${encodeURIComponent(existing.id ?? existing.code)}`,
      {
        method: 'PATCH',
        token: adminToken,
        timeoutMs,
        body: {
          status: 'ACTIVE',
          assignedZone: existing.assignedZone ?? 'MCP',
          metadata: {
            ...(existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata) ? existing.metadata : {}),
            source: 'mcp-hardware-sim-lab',
            virtual: true,
          },
        },
      },
    ));
    return { created: false, scannerId: updated?.id ?? existing.id ?? null, code: updated?.code ?? scannerCode, status: updated?.status ?? null };
  }

  const created = unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/scanners`, {
    method: 'POST',
    token: adminToken,
    timeoutMs,
    body: {
      code: scannerCode,
      name: 'MCP virtual RF scanner',
      status: 'ACTIVE',
      assignedZone: 'MCP',
      metadata: {
        source: 'mcp-hardware-sim-lab',
        virtual: true,
        hardwareFree: true,
      },
    },
  }));
  return { created: true, scannerId: created?.id ?? null, code: created?.code ?? scannerCode, status: created?.status ?? null };
}

async function runHardwarePrinterLab(options) {
  const labelPrint = options.scenario?.labelPrint ?? {};
  const stamp = Date.now().toString(36).toUpperCase();
  const host = String(options.args.fakePrinterHost ?? '127.0.0.1').trim() || '127.0.0.1';
  const port = normalizePort(options.args.fakePrinterPort ?? 19100);
  const printerCode = normalizeHardwareCode(options.args.printerCode ?? labelPrint.printerCode ?? 'FAKE-9100', 'FAKE-9100');
  const printerName = String(options.args.printerName ?? labelPrint.printerName ?? 'Aardvark fake TCP 9100').trim();
  const agentCode = normalizeHardwareCode(options.args.agentCode ?? labelPrint.agentCode ?? `MCP-HW-SIM-${stamp}`, `MCP-HW-SIM-${stamp}`);
  const agentToken = String(options.args.agentToken ?? labelPrint.agentToken ?? `mcp-hardware-sim-token-${stamp}-local-secret`).trim();
  const labelCode = String(options.args.labelCode ?? labelPrint.labelCode ?? 'AARD1:LOC:MAIN:A-01-01').trim();
  const title = String(options.args.title ?? labelPrint.title ?? 'Aardvark hardware simulator').trim();
  const subtitle = String(options.args.subtitle ?? labelPrint.subtitle ?? 'Fake TCP 9100 ZPL capture').trim();
  const templateReference = String(options.args.templateReference ?? labelPrint.templateReference ?? 'CUSTOM').trim();
  const failures = [];
  const steps = [];
  const events = [];
  let browser = null;
  let page = null;
  let fakePrinter = null;
  let screenshot = null;
  let adminToken = null;
  let queuedJob = null;
  let agentRun = null;

  try {
    adminToken = await loginBackendForHardwareRole(options.backendUrl, 'spravce', options.args, options.timeoutMs);
  } catch (error) {
    failures.push(`backend admin login failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    fakePrinter = await startFakeZplPrinter({ host, port, reportDir: options.reportDir });
    browser = await launchBrowser({ viewport: options.viewport });
    page = await browser.newPage();
    page.onConsole((event) => events.push({ type: 'console', ...event }));
    page.onPageError((event) => events.push({ type: 'pageError', ...event }));
    await page.enable();

    const credentials = resolveCredentials('spravce', roleProfiles.spravce, options.args ?? {});
    await loginToFrontend(page, {
      frontendUrl: options.frontendUrl,
      backendUrl: options.backendUrl,
      loginName: credentials.loginName,
      password: credentials.password,
      language: options.language,
      timeoutMs: options.timeoutMs,
    });

    await runPrintSetupAndLabelQueue(page, {
      printerCode,
      printerName,
      protocol: 'TCP_9100',
      host,
      port: String(port),
      windowsPrinterName: '',
      agentCode,
      agentName: `Hardware simulator ${stamp}`,
      agentToken,
      templateReference,
      labelCode,
      title,
      subtitle,
      enqueue: false,
    }, steps, options.timeoutMs);

    if (options.screenshots) {
      screenshot = join(options.reportDir, 'printer-setup-preview.png');
      await page.screenshot(screenshot).catch(() => null);
    }

    if (adminToken) {
      queuedJob = await queueHardwarePrintJob(options.backendUrl, options.warehouseCode, adminToken, {
        printerCode,
        agentCode,
        templateReference,
        labelCode,
        title,
        subtitle,
        stamp,
        timeoutMs: options.timeoutMs,
      });
    }

    agentRun = await simulatePrintAgentTcpCapture(options.backendUrl, {
      warehouseCode: options.warehouseCode,
      agentCode,
      token: agentToken,
      timeoutMs: options.timeoutMs,
      fakePrinter,
      host,
      port,
      reportDir: options.reportDir,
      renderMode: options.renderMode,
      allowExternalLabelary: options.allowExternalLabelary,
      reportPrintResult: options.args.reportPrintResult !== false,
      expectedJobId: queuedJob?.id,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
    if (page && options.screenshots) {
      screenshot = join(options.reportDir, 'printer-error.png');
      await page.screenshot(screenshot).catch(() => null);
    }
  } finally {
    await browser?.close();
    await fakePrinter?.close();
  }

  if (agentRun && !agentRun.ok) failures.push(agentRun.failure ?? 'print agent simulation failed');

  return {
    ok: failures.length === 0,
    warehouseCode: options.warehouseCode,
    printer: { code: printerCode, name: printerName, host, port, protocol: 'TCP_9100' },
    agent: { code: agentCode },
    label: { code: labelCode, title, subtitle, templateReference },
    steps,
    events,
    screenshot,
    queuedJob,
    captures: fakePrinter?.captures ?? [],
    agentRun,
    failures,
  };
}

async function runMultiPrinterRetryFailoverLab(options) {
  const stamp = Date.now().toString(36).toUpperCase();
  const backendUrl = options.backendUrl;
  const warehouseCode = String(options.warehouseCode ?? 'MAIN').trim().toUpperCase() || 'MAIN';
  const timeoutMs = Number(options.timeoutMs ?? 45000);
  const host = String(options.fakePrinterHost ?? '127.0.0.1').trim() || '127.0.0.1';
  const port = normalizePort(options.fakePrinterPort ?? 19102);
  const primaryPrinterCode = normalizeHardwareCode(options.primaryPrinterCode ?? 'MCP-FAILOVER-A', 'MCP-FAILOVER-A');
  const secondaryPrinterCode = normalizeHardwareCode(options.secondaryPrinterCode ?? 'MCP-FAILOVER-B', 'MCP-FAILOVER-B');
  const primaryAgentCode = normalizeHardwareCode(options.primaryAgentCode ?? 'MCP-FAILOVER-AGENT-A', 'MCP-FAILOVER-AGENT-A');
  const secondaryAgentCode = normalizeHardwareCode(options.secondaryAgentCode ?? 'MCP-FAILOVER-AGENT-B', 'MCP-FAILOVER-AGENT-B');
  const primaryToken = `mcp-failover-primary-${stamp}-local-secret`;
  const secondaryToken = `mcp-failover-secondary-${stamp}-local-secret`;
  const reportDir = options.reportDir;
  const failures = [];
  const steps = [];
  let fakePrinter = null;
  let adminToken = options.adminToken ?? null;
  let primaryJob = null;
  let firstFailure = null;
  let retry = null;
  let secondFailure = null;
  let reassign = null;
  let wrongAgentClaim = null;
  const wrongAgentCleanup = [];
  let secondaryRun = null;

  try {
    await mkdir(reportDir, { recursive: true });
    adminToken = adminToken ?? await loginBackendForHardwareRole(backendUrl, 'spravce', options.credentialsArgs ?? {}, timeoutMs);
    fakePrinter = await startFakeZplPrinter({ host, port, reportDir });

    const printerBodies = [
      { code: primaryPrinterCode, name: 'MCP failover primary printer' },
      { code: secondaryPrinterCode, name: 'MCP failover secondary printer' },
    ].map((printer) => ({
      ...printer,
      protocol: 'TCP_9100',
      host,
      port,
      metadata: { source: 'mcp-multi-printer-failover', stamp },
    }));

    for (const body of printerBodies) {
      steps.push({
        action: 'upsert-printer',
        printerCode: body.code,
        result: await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/printers`, {
          method: 'POST',
          token: adminToken,
          timeoutMs,
          body,
        }),
      });
    }

    const agentBodies = [
      {
        code: primaryAgentCode,
        name: 'MCP failover primary agent',
        token: primaryToken,
        printerCodes: [primaryPrinterCode],
      },
      {
        code: secondaryAgentCode,
        name: 'MCP failover secondary agent',
        token: secondaryToken,
        printerCodes: [secondaryPrinterCode],
      },
    ].map((agent) => ({
      ...agent,
      version: 'mcp-hardware-sim',
      hostname: 'mcp-multi-printer-failover',
      metadata: { source: 'mcp-multi-printer-failover', stamp },
    }));

    for (const body of agentBodies) {
      steps.push({
        action: 'upsert-print-agent',
        agentCode: body.code,
        printerCodes: body.printerCodes,
        result: await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/print-agents`, {
          method: 'POST',
          token: adminToken,
          timeoutMs,
          body,
        }),
      });
    }

    primaryJob = unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/print-jobs`, {
      method: 'POST',
      token: adminToken,
      headers: { 'Idempotency-Key': `multi-printer-failover-${stamp}` },
      timeoutMs,
      body: {
        printerCode: primaryPrinterCode,
        agentCode: primaryAgentCode,
        templateCode: 'CUSTOM',
        copies: 1,
        maxAttempts: 4,
        layout: defaultHardwareLabelLayout(),
        payload: {
          code: `AARD1:LOC:${warehouseCode}:PACK-01`,
          title: 'MCP failover primary',
          subtitle: 'Expected first printer failure',
        },
        idempotencyKey: `multi-printer-failover-${stamp}`,
      },
    }));
    steps.push({ action: 'queue-primary-job', jobId: primaryJob?.id, printerCode: primaryPrinterCode, agentCode: primaryAgentCode });

    firstFailure = await claimPrintJobAndReportFailure(backendUrl, {
      warehouseCode,
      jobId: primaryJob?.id,
      agentCode: primaryAgentCode,
      token: primaryToken,
      printerCodes: [primaryPrinterCode],
      timeoutMs,
      errorMessage: 'MCP software-only primary printer failure before retry.',
    });
    steps.push({ action: 'primary-failure', ...summarizeClaimFailure(firstFailure) });

    retry = unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/print-jobs/${encodeURIComponent(primaryJob.id)}/retry`, {
      method: 'POST',
      token: adminToken,
      timeoutMs,
      body: {
        printerCode: primaryPrinterCode,
        agentCode: primaryAgentCode,
        metadata: { source: 'mcp-multi-printer-failover', step: 'retry-primary' },
      },
    }));
    steps.push({ action: 'retry-primary-job', jobId: retry?.id, status: retry?.status, printerCode: retry?.printerCode, agentCode: retry?.agentCode });

    secondFailure = await claimPrintJobAndReportFailure(backendUrl, {
      warehouseCode,
      jobId: primaryJob.id,
      agentCode: primaryAgentCode,
      token: primaryToken,
      printerCodes: [primaryPrinterCode],
      timeoutMs,
      errorMessage: 'MCP software-only primary printer failure after retry.',
    });
    steps.push({ action: 'primary-failure-after-retry', ...summarizeClaimFailure(secondFailure) });

    reassign = unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/print-jobs/${encodeURIComponent(primaryJob.id)}/reassign`, {
      method: 'POST',
      token: adminToken,
      timeoutMs,
      body: {
        printerCode: secondaryPrinterCode,
        agentCode: secondaryAgentCode,
        metadata: {
          source: 'mcp-multi-printer-failover',
          reason: 'Primary fake printer failed twice; fail over to secondary fake printer.',
        },
      },
    }));
    steps.push({ action: 'reassign-to-secondary', jobId: reassign?.id, status: reassign?.status, printerCode: reassign?.printerCode, agentCode: reassign?.agentCode });

    wrongAgentClaim = await claimPrintJobsOnce(backendUrl, {
      warehouseCode,
      agentCode: primaryAgentCode,
      token: primaryToken,
      printerCodes: [primaryPrinterCode],
      limit: 10,
      timeoutMs,
    });
    const wrongAgentJobs = unwrapArray(wrongAgentClaim);
    const wrongAgentClaimedTarget = wrongAgentJobs.some((job) => job?.id === primaryJob.id);
    for (const staleJob of wrongAgentJobs.filter((job) => job?.id && job.id !== primaryJob.id)) {
      const cleanup = await reportHardwarePrintJobResult(backendUrl, {
        warehouseCode,
        jobId: staleJob.id,
        agentCode: primaryAgentCode,
        token: primaryToken,
        status: 'FAILED',
        timeoutMs,
        errorMessage: `MCP multi-printer failover drained stale non-target job ${staleJob.id}.`,
      }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
      wrongAgentCleanup.push({ id: staleJob.id, printerCode: staleJob.printerCode, cleanup });
    }
    steps.push({
      action: 'assert-primary-agent-cannot-claim-secondary-job',
      ok: !wrongAgentClaimedTarget,
      claimedJobIds: wrongAgentJobs.map((job) => job?.id).filter(Boolean),
      cleanup: wrongAgentCleanup,
    });
    if (wrongAgentClaimedTarget) {
      failures.push('Primary printer agent claimed the job after it was reassigned to the secondary printer.');
    }

    secondaryRun = await simulatePrintAgentTcpCapture(backendUrl, {
      warehouseCode,
      agentCode: secondaryAgentCode,
      token: secondaryToken,
      printerCodes: [secondaryPrinterCode],
      timeoutMs,
      fakePrinter,
      host,
      port,
      reportDir,
      renderMode: options.renderMode,
      allowExternalLabelary: options.allowExternalLabelary,
      reportPrintResult: true,
      expectedJobId: primaryJob.id,
    });
    steps.push({
      action: 'secondary-agent-print',
      ok: secondaryRun.ok,
      status: secondaryRun.status,
      claimedJobId: secondaryRun.claimedJobId,
      capturePath: secondaryRun.capture?.filePath ?? null,
      failure: secondaryRun.failure,
    });
    if (!secondaryRun.ok) failures.push(secondaryRun.failure ?? 'Secondary fake printer did not print the reassigned job.');
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    await fakePrinter?.close().catch(() => null);
  }

  const captures = fakePrinter?.captures ?? [];
  const result = {
    name: 'multi_printer_retry_failover',
    ok: failures.length === 0 && firstFailure?.ok === true && secondFailure?.ok === true && secondaryRun?.ok === true,
    warehouseCode,
    printers: {
      primary: { code: primaryPrinterCode, host, port, protocol: 'TCP_9100' },
      secondary: { code: secondaryPrinterCode, host, port, protocol: 'TCP_9100' },
    },
    agents: {
      primary: { code: primaryAgentCode, printerCodes: [primaryPrinterCode] },
      secondary: { code: secondaryAgentCode, printerCodes: [secondaryPrinterCode] },
    },
    primaryJobId: primaryJob?.id ?? null,
    firstFailure,
    retry,
    secondFailure,
    reassign,
    wrongAgentClaim: {
      ok: !unwrapArray(wrongAgentClaim).some((job) => job?.id === primaryJob?.id),
      claimedJobIds: unwrapArray(wrongAgentClaim).map((job) => job?.id).filter(Boolean),
      cleanup: wrongAgentCleanup,
    },
    secondaryRun,
    captureCount: captures.length,
    captures: captures.map((capture) => ({
      index: capture.index,
      filePath: capture.filePath,
      bytes: capture.bytes,
      ok: capture.validation?.ok,
      errors: capture.validation?.errors ?? [],
    })),
    steps,
    failures,
  };
  await writeJson(join(reportDir, 'report.json'), result);
  return result;
}

async function claimPrintJobAndReportFailure(backendUrl, options) {
  const claim = await claimHardwarePrintJob(backendUrl, {
    ...options,
    expectedJobId: options.jobId,
    reportPrintResult: true,
  });
  const job = claim.job;
  if (!job?.id) {
    return { ok: false, failure: 'Expected print job was not claimed for failure simulation.', claim };
  }
  const result = await reportHardwarePrintJobResult(backendUrl, {
    ...options,
    jobId: job.id,
    status: 'FAILED',
    errorMessage: options.errorMessage,
  });
  return { ok: true, claimedJobId: job.id, claim, result };
}

function summarizeClaimFailure(run) {
  return {
    ok: run?.ok === true,
    claimedJobId: run?.claimedJobId ?? null,
    failure: run?.failure,
    drainedJobs: run?.claim?.drainedJobs ?? [],
  };
}

async function queueHardwarePrintJob(backendUrl, warehouseCode, token, options) {
  return unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(warehouseCode)}/print-jobs`, {
    method: 'POST',
    token,
    headers: {
      'Idempotency-Key': `hardware-sim-${options.agentCode}-${options.stamp}`,
    },
    timeoutMs: options.timeoutMs,
    body: {
      printerCode: options.printerCode,
      agentCode: options.agentCode,
      templateCode: options.templateReference || undefined,
      copies: 1,
      maxAttempts: 2,
      layout: defaultHardwareLabelLayout(),
      payload: {
        code: options.labelCode,
        title: options.title,
        subtitle: options.subtitle,
      },
      idempotencyKey: `hardware-sim-${options.agentCode}-${options.stamp}`,
    },
  }));
}

async function simulatePrintAgentTcpCapture(backendUrl, options) {
  try {
    const claim = await claimHardwarePrintJob(backendUrl, options);
    const job = claim.job;
    if (!job?.id) {
      return { name: 'print_agent_fake_tcp_9100', ok: false, failure: 'Print agent did not claim a targeted job.', claim };
    }

    const zpl = String(job.renderedZpl ?? '');
    const sourceValidation = validateZplDocumentCapture(zpl);
    let printingReport = null;
    if (options.reportPrintResult) {
      printingReport = await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(options.warehouseCode)}/print-agent/jobs/${encodeURIComponent(job.id)}/result`, {
        method: 'POST',
        timeoutMs: options.timeoutMs,
        body: {
          agentCode: options.agentCode,
          token: options.token,
          status: 'PRINTING',
          metadata: { source: 'mcp-hardware-sim-lab' },
        },
      }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }

    let capture = null;
    let sendError = null;
    if (sourceValidation.ok) {
      try {
        const captureAfterIndex = options.fakePrinter.captures?.length ?? 0;
        const waitForCapture = options.fakePrinter.waitForCapture(Math.min(options.timeoutMs, 15000), captureAfterIndex);
        await sendTcpZpl(options.host, options.port, zpl, Math.min(options.timeoutMs, 15000));
        capture = await waitForCapture;
      } catch (error) {
        sendError = error instanceof Error ? error.message : String(error);
      }
    }

    const zplForArtifacts = capture?.payload ?? zpl;
    const render = await renderHardwareZplArtifacts(zplForArtifacts, {
      reportDir: options.reportDir,
      renderMode: options.renderMode,
      allowExternalLabelary: options.allowExternalLabelary,
      timeoutMs: options.timeoutMs,
    });
    const finalValidation = capture?.validation ?? sourceValidation;
    const status = finalValidation.ok && !sendError ? 'PRINTED' : 'FAILED';
    let finalReport = null;
    if (options.reportPrintResult) {
      finalReport = await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(options.warehouseCode)}/print-agent/jobs/${encodeURIComponent(job.id)}/result`, {
        method: 'POST',
        timeoutMs: options.timeoutMs,
        body: {
          agentCode: options.agentCode,
          token: options.token,
          status,
          errorMessage: status === 'PRINTED' ? '' : (sendError || finalValidation.errors.join('; ') || 'ZPL capture failed'),
          metadata: {
            source: 'mcp-hardware-sim-lab',
            capturePath: capture?.filePath ?? null,
            renderArtifacts: render.artifacts,
          },
        },
      });
    }

    return {
      name: 'print_agent_fake_tcp_9100',
      ok: status === 'PRINTED',
      status,
      claimedJobId: job.id,
      expectedJobId: options.expectedJobId ?? null,
      sourceValidation,
      capture,
      sendError,
      render,
      printingReport,
      finalReport,
      claim,
      failure: status === 'PRINTED' ? undefined : (sendError || finalValidation.errors.join('; ') || 'Print simulation failed'),
    };
  } catch (error) {
    return {
      name: 'print_agent_fake_tcp_9100',
      ok: false,
      failure: error instanceof Error ? error.message : String(error),
    };
  }
}

async function claimHardwarePrintJob(backendUrl, options) {
  const deadline = Date.now() + Math.min(options.timeoutMs, 30000);
  let lastClaim = null;
  const drainedJobs = [];
  while (Date.now() < deadline) {
    const claim = await claimPrintJobsOnce(backendUrl, {
      ...options,
      limit: options.expectedJobId ? 10 : 1,
      timeoutMs: Math.min(options.timeoutMs, 10000),
    });
    lastClaim = claim;
    const jobs = unwrapArray(claim);
    const job = options.expectedJobId ? jobs.find((item) => item?.id === options.expectedJobId) : jobs[0];
    const nonTargetJobs = options.expectedJobId ? jobs.filter((item) => item?.id && item.id !== options.expectedJobId) : [];
    if (nonTargetJobs.length > 0 && options.reportPrintResult !== false) {
      for (const nonTargetJob of nonTargetJobs) {
        const cleanup = await reportHardwarePrintJobResult(backendUrl, {
          ...options,
          jobId: nonTargetJob.id,
          status: 'FAILED',
          errorMessage: `Skipped by hardware simulator while draining stale non-target job ${nonTargetJob.id}.`,
        }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
        drainedJobs.push({ id: nonTargetJob.id, printerCode: nonTargetJob.printerCode, cleanup });
      }
    }
    if (job?.id) return { ok: true, job, claim, drainedJobs };
    await delay(500);
  }
  return { ok: false, job: null, claim: lastClaim, drainedJobs };
}

async function claimPrintJobsOnce(backendUrl, options) {
  return unwrapObject(await apiFetch(backendUrl, `/warehouses/${encodeURIComponent(options.warehouseCode)}/print-agent/jobs/claim`, {
    method: 'POST',
    timeoutMs: Math.min(Number(options.timeoutMs ?? 10000), 10000),
    body: {
      agentCode: options.agentCode,
      token: options.token,
      limit: options.limit ?? 1,
      version: 'mcp-hardware-sim',
      hostname: 'mcp-hardware-sim',
      ...(Array.isArray(options.printerCodes) ? { printerCodes: options.printerCodes } : {}),
      ...(typeof options.acceptUnassignedJobs === 'boolean' ? { acceptUnassignedJobs: options.acceptUnassignedJobs } : {}),
    },
  }));
}

async function reportHardwarePrintJobResult(backendUrl, options) {
  return apiFetch(backendUrl, `/warehouses/${encodeURIComponent(options.warehouseCode)}/print-agent/jobs/${encodeURIComponent(options.jobId)}/result`, {
    method: 'POST',
    timeoutMs: options.timeoutMs,
    body: {
      agentCode: options.agentCode,
      token: options.token,
      status: options.status,
      errorMessage: options.errorMessage ?? '',
      metadata: {
        source: 'mcp-hardware-sim-lab',
        cleanup: options.status === 'FAILED',
      },
    },
  });
}

async function startFakeZplPrinter(options) {
  const captures = [];
  const waiters = [];
  await mkdir(options.reportDir, { recursive: true });

  const server = createServer((socket) => {
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('end', () => {
      void (async () => {
        const payload = Buffer.concat(chunks).toString('utf8');
        const validation = validateZplDocumentCapture(payload);
        const index = captures.length + 1;
        const filePath = join(options.reportDir, `captured-${String(index).padStart(2, '0')}.zpl`);
        await writeFile(filePath, payload, 'utf8');
        const capture = {
          index,
          filePath,
          bytes: Buffer.byteLength(payload, 'utf8'),
          receivedAt: new Date().toISOString(),
          validation,
          payload,
        };
        captures.push(capture);
        for (let index = waiters.length - 1; index >= 0; index -= 1) {
          const waiter = waiters[index];
          if (capture.index > waiter.afterIndex) {
            waiters.splice(index, 1);
            waiter.resolve(capture);
          }
        }
      })().catch((error) => {
        while (waiters.length > 0) waiters.shift()?.reject(error);
      });
    });
  });

  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(options.port, options.host, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });

  return {
    host: options.host,
    port: options.port,
    captures,
    waitForCapture(timeoutMs, afterIndex = 0) {
      const existing = captures.find((capture) => capture.index > afterIndex);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          const waiterIndex = waiters.findIndex((waiter) => waiter.resolve === resolvePromise);
          if (waiterIndex >= 0) waiters.splice(waiterIndex, 1);
          rejectPromise(new Error('Timed out waiting for fake printer capture.'));
        }, timeoutMs);
        waiters.push({
          afterIndex,
          resolve: (capture) => {
            clearTimeout(timer);
            resolvePromise(capture);
          },
          reject: (error) => {
            clearTimeout(timer);
            rejectPromise(error);
          },
        });
      });
    },
    close() {
      return new Promise((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}

function sendTcpZpl(host, port, zpl, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.write(zpl, 'utf8', () => socket.end());
    });
    socket.on('error', rejectPromise);
    socket.on('timeout', () => {
      socket.destroy();
      rejectPromise(new Error(`Fake printer ${host}:${port} timed out.`));
    });
    socket.on('close', (hadError) => {
      if (!hadError) resolvePromise();
    });
  });
}

async function renderHardwareZplArtifacts(zpl, options) {
  const artifacts = [];
  const validation = validateZplDocumentCapture(zpl);

  if (options.renderMode === 'offline' || options.renderMode === 'both') {
    const svgPath = join(options.reportDir, 'render-offline.svg');
    const htmlPath = join(options.reportDir, 'render-offline.html');
    const svg = buildOfflineZplSvg(zpl, validation);
    await writeFile(svgPath, svg, 'utf8');
    await writeFile(htmlPath, buildOfflineZplHtml(svg, zpl, validation), 'utf8');
    artifacts.push({ mode: 'offline', type: 'svg', path: svgPath });
    artifacts.push({ mode: 'offline', type: 'html', path: htmlPath });
  }

  if (options.renderMode === 'labelary' || options.renderMode === 'both') {
    if (!options.allowExternalLabelary) {
      artifacts.push({
        mode: 'labelary',
        skipped: true,
        reason: 'Labelary is disabled by default. Set allowExternalLabelary=true to send ZPL to Labelary.',
      });
    } else {
      const pngPath = join(options.reportDir, 'render-labelary.png');
      try {
        await renderLabelaryPng(zpl, pngPath, options.timeoutMs);
        artifacts.push({ mode: 'labelary', type: 'png', path: pngPath });
      } catch (error) {
        artifacts.push({
          mode: 'labelary',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return { ok: validation.ok, validation, artifacts };
}

async function renderLabelaryPng(zpl, outputPath, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(timeoutMs, 20000));
  try {
    const response = await fetch('http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/', {
      method: 'POST',
      headers: {
        accept: 'image/png',
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: zpl,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Labelary returned HTTP ${response.status}`);
    await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  } finally {
    clearTimeout(timer);
  }
}

function buildOfflineZplSvg(zpl, validation) {
  const fields = extractZplFieldData(zpl);
  const commands = extractZplCommandSummary(zpl);
  const lines = [
    'Aardvark Hardware Simulator',
    validation.ok ? 'ZPL validation: OK' : `ZPL validation: ${validation.errors.join('; ')}`,
    `Labels: ${validation.labelCount}`,
    '',
    ...fields.map((field) => `FD: ${field}`),
    '',
    ...commands.slice(0, 18),
  ].filter((line, index, array) => line || array[index - 1]);
  const text = lines.slice(0, 28).map((line, index) =>
    `<text x="36" y="${48 + index * 22}" font-size="${index === 0 ? 18 : 13}" font-family="Consolas, monospace">${escapeXml(line)}</text>`,
  ).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="812" height="1218" viewBox="0 0 812 1218">
  <rect width="812" height="1218" fill="#f6f7f9"/>
  <rect x="24" y="24" width="764" height="1170" rx="8" fill="#ffffff" stroke="#1f2937" stroke-width="3"/>
  <rect x="560" y="54" width="168" height="168" fill="#111827"/>
  <rect x="584" y="78" width="42" height="42" fill="#ffffff"/>
  <rect x="662" y="78" width="42" height="42" fill="#ffffff"/>
  <rect x="584" y="156" width="42" height="42" fill="#ffffff"/>
  <rect x="642" y="138" width="20" height="20" fill="#ffffff"/>
  <rect x="690" y="158" width="18" height="18" fill="#ffffff"/>
  ${text}
  <rect x="36" y="980" width="590" height="76" fill="#111827"/>
  <text x="48" y="1028" fill="#ffffff" font-size="28" font-family="Consolas, monospace">${escapeXml(fields[0] ?? 'Captured ZPL')}</text>
</svg>`;
}

function buildOfflineZplHtml(svg, zpl, validation) {
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<title>Aardvark Hardware Simulator ZPL Preview</title>
<style>
body{font-family:Arial,sans-serif;margin:24px;background:#eef1f5;color:#111827}
.wrap{display:grid;grid-template-columns:minmax(320px,460px) 1fr;gap:24px;align-items:start}
.preview{background:white;padding:12px;border:1px solid #cbd5e1}
pre{white-space:pre-wrap;background:#111827;color:#e5e7eb;padding:16px;overflow:auto;max-height:80vh}
.status{font-weight:700;color:${validation.ok ? '#047857' : '#b91c1c'}}
</style>
<div class="wrap">
  <div class="preview">${svg}</div>
  <div>
    <p class="status">${validation.ok ? 'Valid ZPL' : escapeXml(validation.errors.join('; '))}</p>
    <pre>${escapeXml(zpl)}</pre>
  </div>
</div>
</html>`;
}

function extractZplFieldData(zpl) {
  const fields = [];
  const pattern = /\^FD([\s\S]*?)\^FS/g;
  let match;
  while ((match = pattern.exec(zpl)) !== null) {
    const value = String(match[1] ?? '').replace(/\s+/g, ' ').trim();
    if (value) fields.push(value.slice(0, 120));
  }
  return fields;
}

function extractZplCommandSummary(zpl) {
  return String(zpl)
    .replace(/\^/g, '\n^')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 40);
}

function validateZplDocumentCapture(value) {
  const payload = String(value ?? '');
  const trimmed = payload.trim();
  const errors = [];
  const startCount = (trimmed.match(/\^XA/g) ?? []).length;
  const endCount = (trimmed.match(/\^XZ/g) ?? []).length;

  if (!trimmed) errors.push('ZPL payload is empty.');
  if (!trimmed.startsWith('^XA')) errors.push('ZPL must start with ^XA.');
  if (!trimmed.endsWith('^XZ')) errors.push('ZPL must end with ^XZ.');
  if (startCount !== endCount) errors.push(`ZPL label boundary mismatch: ^XA=${startCount}, ^XZ=${endCount}.`);
  if (!/\^(FD|BQ|BC|BX)/.test(trimmed)) errors.push('ZPL does not contain a printable text or barcode command.');

  return {
    ok: errors.length === 0,
    errors,
    bytes: Buffer.byteLength(payload, 'utf8'),
    labelCount: Math.max(startCount, endCount, 0),
  };
}

async function loginBackendForHardwareRole(backendUrl, role, args, timeoutMs) {
  const profile = roleProfiles[role];
  const credentials = resolveCredentials(role, profile, args ?? {});
  const response = await apiFetch(backendUrl, '/auth/login', {
    method: 'POST',
    body: { email: credentials.loginName, password: credentials.password },
    timeoutMs,
  });
  if (!response.accessToken) throw new Error('login response did not contain accessToken');
  return response.accessToken;
}

function defaultHardwareLabelLayout() {
  return {
    widthMm: 100,
    heightMm: 150,
    dpi: 203,
    fields: [
      { type: 'text', x: 6, y: 7, width: 88, height: 10, binding: 'title', fontSize: 7 },
      { type: 'qr', x: 6, y: 23, width: 34, height: 34, binding: 'code', moduleSize: 6 },
      { type: 'code128', x: 6, y: 65, width: 88, height: 18, binding: 'code' },
      { type: 'text', x: 6, y: 88, width: 88, height: 8, binding: 'subtitle', fontSize: 5 },
    ],
  };
}

function normalizeHardwareScannerPayloads(input, warehouseCode) {
  const source = Array.isArray(input) && input.length > 0 ? input : defaultHardwareScannerPayloads(warehouseCode);
  return source
    .map((item, index) => {
      const value = typeof item === 'string'
        ? item
        : String(item?.value ?? item?.payload ?? item?.scannedValue ?? '').trim();
      if (!value) return null;
      const terminator = normalizeScannerTerminator(typeof item === 'object' ? item?.terminator : undefined);
      return {
        index,
        type: typeof item === 'object' && item?.type ? String(item.type) : inferScannerPayloadType(value),
        value,
        terminator,
        backendValue: appendScannerTerminator(value, terminator),
      };
    })
    .filter(Boolean);
}

function defaultHardwareScannerPayloads(warehouseCode) {
  const warehouse = String(warehouseCode || 'MAIN').trim().toUpperCase();
  return [
    { type: 'AARD1:LOC', value: `AARD1:LOC:${warehouse}:A-01-01`, terminator: 'enter' },
    { type: 'AARD1:SKU', value: `AARD1:SKU:${warehouse}:ABC123`, terminator: 'enter' },
    { type: 'AARD1:HU', value: `AARD1:HU:${warehouse}:HU0001`, terminator: 'tab' },
    { type: 'AARD1:PARCEL', value: `AARD1:PARCEL:${warehouse}:P0001`, terminator: 'enter' },
    { type: 'AARD1:TASK', value: `AARD1:TASK:${warehouse}:T0001`, terminator: 'enter' },
    { type: 'GS1', value: ']C1010850123456789010LOT-1<GS>17260531', terminator: 'enter' },
    { type: 'RAW', value: 'RAW-FALLBACK-001', terminator: 'enter' },
  ];
}

function inferScannerPayloadType(value) {
  const normalized = String(value).trim();
  if (/^AARD1:/i.test(normalized)) {
    const parts = normalized.split(':');
    return `AARD1:${String(parts[1] ?? 'RAW').toUpperCase()}`;
  }
  if (/^\][A-Za-z0-9]{2}/.test(normalized) || /^\(\d{2,4}\)/.test(normalized)) return 'GS1';
  return 'RAW';
}

function normalizeScannerTerminator(value) {
  const normalized = String(value ?? 'enter').trim().toLowerCase();
  if (normalized === 'tab') return 'tab';
  if (normalized === 'none' || normalized === 'false') return 'none';
  return 'enter';
}

function appendScannerTerminator(value, terminator) {
  if (terminator === 'tab') return `${value}\t`;
  if (terminator === 'enter') return `${value}\n`;
  return value;
}

function normalizeHardwareRenderMode(value) {
  return ['offline', 'labelary', 'both'].includes(value) ? value : 'offline';
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return 19100;
  return port;
}

function normalizeHardwareCode(value, fallback) {
  const normalized = String(value ?? fallback).trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
  return normalized || fallback;
}

function unwrapObject(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  return payload;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function resolveScenarioPath(value) {
  if (/^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/')) return resolve(value);
  const repoRelative = resolve(mcpRoot, '..', value);
  if (existsSync(repoRelative)) return repoRelative;
  return resolve(mcpRoot, value);
}

function assertLocalHttpTarget(name, value) {
  try {
    const url = new URL(value);
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, error: `${name} must be http(s): ${value}` };
    if (!localHosts.has(url.hostname)) return { ok: false, error: `${name} must be localhost for reset E2E: ${value}` };
    return { ok: true, name, url: value };
  } catch {
    return { ok: false, error: `${name} is not a valid URL: ${value}` };
  }
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function runCommand(command, args, options) {
  const started = Date.now();
  const timeoutMs = options?.timeoutMs ?? 60000;
  return new Promise((resolve) => {
    const output = [];
    let child;
    try {
      const useCmdShim = process.platform === 'win32' && /\.cmd$/i.test(command);
      const spawnCommand = useCmdShim ? 'cmd.exe' : command;
      const spawnArgs = useCmdShim ? ['/d', '/s', '/c', windowsCommandLine(command, args)] : args;
      child = spawn(spawnCommand, spawnArgs, {
        cwd: options?.cwd,
        env: { ...process.env, ...(options?.env ?? {}) },
        shell: false,
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        ok: false,
        command: `${command} ${args.join(' ')}`,
        cwd: options?.cwd,
        exitCode: null,
        durationMs: Date.now() - started,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const timeout = setTimeout(() => {
      child.kill();
      resolve({
        ok: false,
        command: `${command} ${args.join(' ')}`,
        cwd: options?.cwd,
        exitCode: null,
        durationMs: Date.now() - started,
        output: output.join('').slice(-4000),
        error: `timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);
    child.stdout?.on('data', (chunk) => output.push(chunk.toString()));
    child.stderr?.on('data', (chunk) => output.push(chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        command: `${command} ${args.join(' ')}`,
        cwd: options?.cwd,
        exitCode: null,
        durationMs: Date.now() - started,
        output: output.join('').slice(-4000),
        error: error instanceof Error ? error.message : String(error),
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve({
        ok: code === 0,
        command: `${command} ${args.join(' ')}`,
        cwd: options?.cwd,
        exitCode: code,
        durationMs: Date.now() - started,
        output: output.join('').slice(-4000),
      });
    });
  });
}

function windowsCommandLine(command, args) {
  return [command, ...args].map(quoteWindowsArg).join(' ');
}

function quoteWindowsArg(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

async function stopBackendForMcp(backendRoot, timeoutMs) {
  const stopBat = join(backendRoot, 'Stop Backend.bat');
  if (!existsSync(stopBat)) {
    return {
      ok: true,
      command: 'Stop Backend.bat',
      cwd: backendRoot,
      exitCode: 0,
      durationMs: 0,
      output: 'Backend stop launcher not found; assuming no managed backend process.',
    };
  }
  const result = await runCommand('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `& ${quotePowerShellSingle(stopBat)}`], { cwd: backendRoot, timeoutMs });
  if (!result.ok) return result;

  const deadline = Date.now() + Math.max(timeoutMs, 15000);
  while (Date.now() < deadline) {
    try {
      await fetch('http://localhost:4001/api/health/live', {
        signal: AbortSignal.timeout(1000),
      });
    } catch {
      return {
        ...result,
        output: `${result.output}\nBackend port 4001 is closed.`,
      };
    }
    await delay(300);
  }

  return {
    ...result,
    ok: false,
    error: 'Backend remained reachable on port 4001 after the stop launcher completed.',
  };
}

async function stopQueueWorkerForMcp(backendRoot, timeoutMs) {
  const stopScript = resolve(backendRoot, '..', 'scripts', 'stop-dev-service.ps1');
  if (!existsSync(stopScript)) {
    return {
      ok: true,
      command: 'stop queue worker',
      cwd: backendRoot,
      exitCode: 0,
      durationMs: 0,
      output: 'Queue worker stopper was not found; assuming no worker is running.',
    };
  }
  return runCommand('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    stopScript,
    '-Port',
    '0',
    '-Label',
    'queue worker',
    '-Patterns',
    join(backendRoot, 'dist', 'queue-worker.main.js'),
    'queue-worker.main',
    'start:queue',
  ], { cwd: backendRoot, timeoutMs });
}

async function ensureLocalDatabaseForMcp(backendRoot, timeoutMs) {
  const commands = [];
  const check = await runCommand(process.execPath, ['scripts/check-database-ready.mjs'], { cwd: backendRoot, timeoutMs: 15000 });
  if (check.ok) {
    commands.push({ ...check, command: `${check.command} (database already ready)` });
    return commands;
  }

  const startDbBat = join(backendRoot, 'Start Local Database.bat');
  if (!existsSync(startDbBat)) {
    commands.push({
      ok: false,
      command: 'Start Local Database.bat',
      cwd: backendRoot,
      exitCode: null,
      durationMs: 0,
      output: check.output,
      error: 'Local database was not ready and Start Local Database.bat was not found.',
    });
    return commands;
  }

  commands.push(startDetachedBatch('Start Local Database.bat', startDbBat, backendRoot));
  const deadline = Date.now() + Math.max(timeoutMs, 45000);
  let ready = check;
  while (Date.now() < deadline) {
    await delay(1000);
    ready = await runCommand(process.execPath, ['scripts/check-database-ready.mjs'], { cwd: backendRoot, timeoutMs: 8000 });
    if (ready.ok) {
      commands.push({ ...ready, command: `${ready.command} (database became ready)` });
      return commands;
    }
  }
  commands.push({
    ...ready,
    ok: false,
    command: `${ready.command} (database readiness timeout)`,
    error: ready.error ?? 'Local database did not become ready for MCP reset.',
  });
  return commands;
}

function startBackendForMcp(backendRoot) {
  const mainPath = join(backendRoot, 'dist', 'main.js');
  if (!existsSync(mainPath)) {
    return {
      ok: false,
      command: 'node dist/main.js',
      cwd: backendRoot,
      exitCode: null,
      durationMs: 0,
      output: '',
      error: 'Backend dist/main.js was not found after build.',
    };
  }
  return startDetachedCommand('backend dist/main.js', process.execPath, [mainPath], backendRoot, {
    NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS, ['--use-system-ca', '--max-old-space-size=4096']),
    PRISMA_QUERY_LOG: '0',
  });
}

function startQueueWorkerForMcp(backendRoot) {
  const workerPath = join(backendRoot, 'dist', 'queue-worker.main.js');
  if (!existsSync(workerPath)) {
    return {
      ok: false,
      command: 'node dist/queue-worker.main.js',
      cwd: backendRoot,
      exitCode: null,
      durationMs: 0,
      output: '',
      error: 'Backend dist/queue-worker.main.js was not found after build.',
    };
  }
  return startDetachedCommand('queue worker dist/queue-worker.main.js', process.execPath, [workerPath], backendRoot, {
    NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS, ['--use-system-ca', '--max-old-space-size=2048']),
    PRISMA_QUERY_LOG: '0',
  });
}

function mergeNodeOptions(existing, additions) {
  const parts = String(existing ?? '').split(/\s+/).map((part) => part.trim()).filter(Boolean);
  for (const option of additions) {
    if (!parts.some((part) => part === option || part.startsWith(`${option.split('=')[0]}=`))) {
      parts.push(option);
    }
  }
  return parts.join(' ');
}

function buildBackendForMcp(backendRoot, timeoutMs) {
  return runCommand(npmCommand(), ['run', 'build'], { cwd: backendRoot, timeoutMs: timeoutMs * 2 });
}

function startDetachedBatch(label, batPath, cwd, env = {}) {
  const started = Date.now();
  try {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Start-Process -FilePath ${quotePowerShellSingle(batPath)} -WindowStyle Hidden`,
    ], {
      cwd,
      env: { ...process.env, ...env },
      detached: true,
      shell: false,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
    return {
      ok: true,
      command: `detached ${label}`,
      cwd,
      exitCode: null,
      durationMs: Date.now() - started,
      output: `Started ${label} in the background.`,
    };
  } catch (error) {
    return {
      ok: false,
      command: `detached ${label}`,
      cwd,
      exitCode: null,
      durationMs: Date.now() - started,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function startDetachedCommand(label, command, args, cwd, env = {}) {
  const started = Date.now();
  const stdoutPath = join(cwd, 'mcp-backend-start.out.log');
  const stderrPath = join(cwd, 'mcp-backend-start.err.log');
  let stdoutFd = null;
  let stderrFd = null;
  try {
    stdoutFd = openSync(stdoutPath, 'a');
    stderrFd = openSync(stderrPath, 'a');
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      detached: true,
      shell: false,
      stdio: ['ignore', stdoutFd, stderrFd],
      windowsHide: true,
    });
    child.unref();
    return {
      ok: true,
      command: `detached ${label}`,
      cwd,
      exitCode: null,
      durationMs: Date.now() - started,
      output: `Started ${label} in the background. stdout=${stdoutPath} stderr=${stderrPath}`,
    };
  } catch (error) {
    return {
      ok: false,
      command: `detached ${label}`,
      cwd,
      exitCode: null,
      durationMs: Date.now() - started,
      output: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (stdoutFd !== null) closeSync(stdoutFd);
    if (stderrFd !== null) closeSync(stderrFd);
  }
}

function quotePowerShellSingle(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildFullStackProcesses(scenario) {
  const firstSku = scenario?.products?.[0]?.sku ?? 'USB-C-65W-BLK';
  const firstOrder = scenario?.outboundOrders?.[0]?.order ?? 'SO-TEST-2001';
  const base = Array.isArray(scenario?.mcpProcesses) ? scenario.mcpProcesses : [];
  return [
    ...base.filter((step) => step.process !== 'packing_scan_and_ship'),
    { role: 'skladnik', process: 'inventory_receive', data: { sku: firstSku, quantity: 1 } },
    { role: 'skladnik', process: 'inventory_adjust', data: { sku: firstSku, quantity: 1 } },
    { role: 'skladnik', process: 'rf_scan_expected_steps', data: { steps: 2 } },
    { role: 'vedouci', process: 'outbound_allocate', data: { orderReference: firstOrder } },
    { role: 'vedouci', process: 'outbound_release_picking', data: { orderReference: firstOrder } },
    ...base.filter((step) => step.process === 'packing_scan_and_ship'),
    {
      role: 'spravce',
      process: 'print_setup_and_label_queue',
      data: {
        printerCode: 'MCP-PRINTER-E2E',
        printerName: 'MCP E2E printer',
        agentCode: 'MCP-AGENT-E2E',
        agentName: 'MCP E2E print agent',
        agentToken: 'mcp-agent-token-2026-local-secret',
        labelCode: 'AARD1:LOC:MAIN:A-01-01',
        title: 'MCP E2E',
        subtitle: 'Print queue check',
      },
    },
    {
      role: 'spravce',
      process: 'settings_create_user',
      data: {
        displayName: 'MCP E2E Worker',
        loginName: `mcp-e2e-worker-${Date.now()}@aardvarkland.local`,
        password: 'Mcp-Local-42!',
        roleCode: 'WAREHOUSE_WORKER',
      },
    },
  ];
}

async function loginBackendForRole(backendUrl, role, timeoutMs) {
  const profile = roleProfiles[role];
  const credentials = resolveCredentials(role, profile, {});
  const response = await apiFetch(backendUrl, '/auth/login', {
    method: 'POST',
    body: { email: credentials.loginName, password: credentials.password },
    timeoutMs,
  });
  if (!response.accessToken) throw new Error('login response did not contain accessToken');
  return response.accessToken;
}

async function findPickTaskReferencesForOrder(backendUrl, token, scenario, timeoutMs, orderReferenceOverride) {
  const warehouseCode = scenario?.warehouse?.code ?? 'MAIN';
  const orderReference = orderReferenceOverride ?? scenario?.outboundOrders?.[0]?.order ?? 'SO-TEST-2001';
  const orders = unwrapArray(await apiFetch(backendUrl, `/warehouses/${warehouseCode}/outbound-orders`, { token, timeoutMs }));
  const order = orders.find((item) => {
    const row = item && typeof item === 'object' ? item : {};
    return row.orderNumber === orderReference || row.id === orderReference;
  });
  const orderId = order?.id;
  if (!orderId) throw new Error(`Outbound order ${orderReference} was not found for pick task lookup.`);

  const tasks = unwrapArray(await apiFetch(backendUrl, `/warehouses/${warehouseCode}/tasks`, { token, timeoutMs }));
  return tasks
    .filter((item) => {
      const row = item && typeof item === 'object' ? item : {};
      return row.type === 'PICK'
        && row.outboundOrderId === orderId
        && typeof row.reservationId === 'string'
        && row.reservationId.length > 0
        && !['DONE', 'CANCELLED', 'FAILED'].includes(String(row.status ?? ''));
    })
    .map((item) => item?.id)
    .filter((id) => typeof id === 'string' && id.length > 0);
}

async function apiFetch(backendUrl, path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  try {
    const response = await fetch(joinUrl(backendUrl, path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!response.ok) {
      throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload).slice(0, 300)}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    for (const key of ['items', 'results', 'data', 'rows', 'jobs']) {
      if (Array.isArray(payload[key])) return payload[key];
    }
  }
  return [];
}

async function assertInboundReceived(backendUrl, token, scenario, timeoutMs) {
  const warehouseCode = scenario?.warehouse?.code ?? 'MAIN';
  const asn = scenario?.inboundShipments?.[0]?.asn ?? 'ASN-TEST-1001';
  const payload = await apiFetch(backendUrl, `/warehouses/${warehouseCode}/inbound-shipments?search=${encodeURIComponent(asn)}`, { token, timeoutMs });
  const shipment = unwrapArray(payload).find((item) => valueIncludes(item, asn));
  const lines = Array.isArray(shipment?.lines) ? shipment.lines : [];
  const received = lines.reduce((sum, line) => sum + Number(line.receivedQuantity ?? line.received ?? 0), 0);
  return {
    name: 'inbound_received_backend_state',
    ok: Boolean(shipment) && received > 0,
    asn,
    received,
    failure: !shipment ? `ASN ${asn} not found after receive` : received <= 0 ? `ASN ${asn} has no received quantity` : undefined,
  };
}

async function assertInventoryMoved(backendUrl, token, scenario, timeoutMs) {
  const warehouseCode = scenario?.warehouse?.code ?? 'MAIN';
  const sku = scenario?.products?.[0]?.sku ?? 'USB-C-65W-BLK';
  const location = scenario?.products?.[0]?.defaultLocation ?? 'A-01-01';
  const payload = await apiFetch(backendUrl, `/warehouses/${warehouseCode}/inventory/quants?skuReference=${encodeURIComponent(sku)}&locationReference=${encodeURIComponent(location)}&includeZero=true`, { token, timeoutMs });
  const rows = unwrapArray(payload);
  const quantity = rows.reduce((sum, row) => sum + Number(row.quantity ?? row.availableQuantity ?? 0), 0);
  return {
    name: 'inventory_backend_state',
    ok: rows.length > 0 && quantity > 0,
    sku,
    location,
    quantity,
    failure: rows.length === 0 ? `No quant for ${sku} at ${location}` : quantity <= 0 ? `Quant for ${sku} at ${location} is not positive` : undefined,
  };
}

async function assertTaskTerminalState(backendUrl, token, timeoutMs) {
  const payload = await apiFetch(backendUrl, '/warehouses/MAIN/tasks?status=DONE&take=20', { token, timeoutMs });
  const rows = unwrapArray(payload);
  return {
    name: 'warehouse_task_terminal_state',
    ok: rows.length > 0,
    doneCount: rows.length,
    failure: rows.length === 0 ? 'No DONE warehouse task found after task flow' : undefined,
  };
}

async function assertOrderAllocated(backendUrl, token, scenario, timeoutMs) {
  const warehouseCode = scenario?.warehouse?.code ?? 'MAIN';
  const order = scenario?.outboundOrders?.[0]?.order ?? 'SO-TEST-2001';
  const payload = await apiFetch(backendUrl, `/warehouses/${warehouseCode}/outbound-orders?search=${encodeURIComponent(order)}`, { token, timeoutMs });
  const row = unwrapArray(payload).find((item) => valueIncludes(item, order));
  const status = String(row?.status ?? '');
  return {
    name: 'outbound_order_allocated_backend_state',
    ok: Boolean(row) && !['CREATED', 'DRAFT', 'Created', 'Draft'].includes(status),
    order,
    status,
    failure: !row ? `Order ${order} not found` : ['CREATED', 'DRAFT', 'Created', 'Draft'].includes(status) ? `Order ${order} still has status ${status}` : undefined,
  };
}

async function assertRuntimePrintJobExists(backendUrl, token, timeoutMs) {
  const payload = await apiFetch(backendUrl, '/warehouses/MAIN/print-jobs', { token, timeoutMs });
  const rows = unwrapArray(payload);
  const job = rows.find((row) => valueIncludes(row, 'MCP-PRINTER-E2E') || valueIncludes(row, 'AARD1:LOC:MAIN:A-01-01'));
  return {
    name: 'runtime_print_job_backend_state',
    ok: Boolean(job),
    status: job?.status,
    jobId: job?.id,
    failure: !job ? 'No MCP runtime print job found' : undefined,
  };
}

async function assertMcpUserExists(backendUrl, token, timeoutMs) {
  const payload = await apiFetch(backendUrl, '/users', { token, timeoutMs });
  const rows = unwrapArray(payload);
  const user = rows.find((row) => valueIncludes(row, 'mcp-e2e-worker'));
  return {
    name: 'settings_user_created_backend_state',
    ok: Boolean(user),
    userId: user?.id,
    email: user?.email,
    failure: !user ? 'MCP E2E user was not found in backend users list' : undefined,
  };
}

async function simulatePrintAgent(backendUrl, options) {
  try {
    const claim = await apiFetch(backendUrl, `/warehouses/${options.warehouseCode}/print-agent/jobs/claim`, {
      method: 'POST',
      timeoutMs: options.timeoutMs,
      body: {
        agentCode: options.agentCode,
        token: options.token,
        limit: 1,
        version: 'mcp-e2e',
        hostname: 'mcp-local',
      },
    });
    const jobs = unwrapArray(claim);
    const job = jobs[0];
    if (!job?.id) return { name: 'print_agent_claim_and_print', ok: false, failure: 'Print agent did not claim a job', claim };
    const result = await apiFetch(backendUrl, `/warehouses/${options.warehouseCode}/print-agent/jobs/${job.id}/result`, {
      method: 'POST',
      timeoutMs: options.timeoutMs,
      body: {
        agentCode: options.agentCode,
        token: options.token,
        status: 'PRINTED',
        metadata: { source: 'mcp-e2e' },
      },
    });
    return { name: 'print_agent_claim_and_print', ok: true, claimedJobId: job.id, claim, result };
  } catch (error) {
    return { name: 'print_agent_claim_and_print', ok: false, failure: error instanceof Error ? error.message : String(error) };
  }
}

function valueIncludes(value, needle) {
  return JSON.stringify(value ?? '').toLowerCase().includes(String(needle).toLowerCase());
}

function sumOverflow(routes) {
  return (routes ?? []).reduce((sum, route) => sum + Number(route.overflowCount ?? 0), 0);
}

function resolveCredentials(role, profile, args) {
  return {
    loginName: args.loginName ?? process.env[profile.envLogin] ?? defaultMcpLogin(role),
    password: args.password ?? (args.passwordEnv ? process.env[args.passwordEnv] : undefined) ?? process.env[profile.envPassword] ?? defaultMcpPassword(),
  };
}

function defaultMcpLogin(role) {
  return `mcp-${role}@aardvarkland.local`;
}

function defaultMcpPassword() {
  return 'Mcp-Local-42!';
}

function normalizeLanguage(value) {
  return ['cs', 'en', 'ua', 'fr', 'de', 'es'].includes(value) ? value : 'cs';
}

function languageSuffix(language) {
  return { cs: 'Cs', en: 'En', ua: 'Ua', fr: 'Fr', de: 'De', es: 'Es' }[language] ?? 'Cs';
}

function languageList(source, prefix, language) {
  const explicit = source[`${prefix}${languageSuffix(language)}`];
  if (explicit) return explicit;
  const english = source[`${prefix}En`];
  if (['fr', 'de', 'es'].includes(language) && english) {
    return english.map((value) => translateJourneyText(value, language));
  }
  return source[`${prefix}Cs`] ?? [];
}

function loginTitleForLanguage(language) {
  if (language === 'en') return 'Sign in';
  if (language === 'ua') return 'Вхід';
  if (['fr', 'de', 'es'].includes(language)) return translateJourneyText('Sign in', language);
  return 'Přihlášení';
}

async function applyUiLanguage(page, language, timeoutMs) {
  const currentUrl = await page.evaluate(() => window.location.href);
  await page.evaluate((nextLanguage) => {
    window.localStorage.setItem('aardvarkland-ui-language', nextLanguage);
  }, language);
  await page.navigate(currentUrl, timeoutMs);
  await page.waitForIdle(300);
  await waitForDocumentLanguage(page, language, Math.min(timeoutMs, 5000)).catch(() => null);
}

async function waitForDocumentLanguage(page, language, timeoutMs) {
  const expected = { cs: 'cs-CZ', en: 'en-GB', ua: 'uk-UA', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' }[language] ?? 'cs-CZ';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await page.evaluate(() => document.documentElement.lang);
    if (current === expected) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for UI language: ${expected}`);
}

function translateJourneyText(english, language) {
  const domainOverrides = {
    'Receiving': { fr: 'Réception', de: 'Wareneingang', es: 'Recepción' },
    'Inventory': { fr: 'Stock', de: 'Bestand', es: 'Inventario' },
    'Locations': { fr: 'Emplacements', de: 'Lagerplätze', es: 'Ubicaciones' },
    'Carriers': { fr: 'Transporteurs', de: 'Versanddienstleister', es: 'Transportistas' },
    'Cycle counts': { fr: 'Inventaires tournants', de: 'Zyklische Inventuren', es: 'Inventarios cíclicos' },
  };
  return domainOverrides[english]?.[language] ?? frontendTranslationCatalog[english]?.[language] ?? english;
}

function loadFrontendTranslationCatalog() {
  const path = join(mcpRoot, '..', 'frontend', 'src', 'core', 'i18n', 'translations.generated.ts');
  if (!existsSync(path)) return {};
  const source = readFileSync(path, 'utf8');
  const rows = {};
  const jsonString = '"(?:\\\\.|[^"\\\\])*"';
  const pattern = new RegExp(`^\\s*(${jsonString}):\\s*\\{\\s*fr:\\s*(${jsonString}),\\s*de:\\s*(${jsonString}),\\s*es:\\s*(${jsonString})\\s*\\},?\\s*$`, 'gm');
  for (const match of source.matchAll(pattern)) {
    rows[JSON.parse(match[1])] = {
      fr: JSON.parse(match[2]),
      de: JSON.parse(match[3]),
      es: JSON.parse(match[4]),
    };
  }
  return rows;
}

async function clearFrontendAuthSession(page) {
  await page.evaluate(() => {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      storage.removeItem('wms.console.accessToken');
      storage.removeItem('wms.console.refreshToken');
      storage.removeItem('wms.console.user');
    }
  }).catch(() => null);
}

async function loginToFrontend(page, options) {
  await page.navigate(options.frontendUrl, options.timeoutMs);
  await clearFrontendAuthSession(page);
  await page.navigate(options.frontendUrl, options.timeoutMs);
  await applyUiLanguage(page, normalizeLanguage(options.language), options.timeoutMs);
  const loginTitle = loginTitleForLanguage(normalizeLanguage(options.language));
  await page.waitForText(loginTitle, options.timeoutMs).catch(() => null);
  await page.waitForSelector('input[name="aardvarkland-login-name"]', options.timeoutMs);
  await page.type('input[name="aardvarkland-login-name"]', options.loginName);
  await page.type('input[name="aardvarkland-login-password"]', options.password);
  await page.waitForIdle(120);
  await page.click('button[type="submit"]');
  const loggedIn = await page.waitForNotText(loginTitle, options.timeoutMs).then(() => true, () => false);
  await page.waitForIdle(700);

  if (!loggedIn) {
    const loginText = await page.text();
    options.failures.push(`login failed or stayed on login page: ${loginText.slice(0, 240).replace(/\s+/g, ' ')}`);
  }
}

async function runInboundReceive(page, data, steps, timeoutMs) {
  await navigateHash(page, '/inbound');
  if (data.asnReference) {
    try {
      await clickTableRadioContainingWithWait(page, String(data.asnReference), 'inbound', timeoutMs);
    } catch (error) {
      if (data.allowAnyAsn === false) throw error;
      const selectedFallback = await page.clickFirstTableRadio('inbound').catch(() => false);
      if (!selectedFallback) {
        steps.push({
          action: 'inbound-idle',
          requestedAsn: String(data.asnReference),
          reason: 'no visible ASN ready for receiving',
        });
        return;
      }
      steps.push({
        action: 'inbound-fallback-visible-asn',
        requestedAsn: String(data.asnReference),
        reason: error instanceof Error ? error.message.slice(0, 160) : String(error).slice(0, 160),
      });
    }
  } else {
    await page.clickFirstTableRadio('inbound').catch(() => null);
  }
  const receiveState = await page.mcpActionState('inbound-receive');
  if (!receiveState.enabled) {
    steps.push({
      action: 'inbound-idle',
      reason: receiveState.exists ? 'no ASN selected for receiving' : 'receiving action unavailable',
      state: receiveState,
    });
    return;
  }
  await page.fillByTestId('inbound-line-reference', String(data.lineReference ?? '1'));
  await page.fillByTestId('inbound-quantity', String(data.quantity ?? 1));
  await clickActionAndRecord(page, 'inbound-receive', steps, timeoutMs);
}

async function runInventoryReceive(page, data, steps, timeoutMs) {
  await navigateHash(page, '/inventory');
  await selectInventoryRow(page, data);
  await page.fillByTestId('inventory-quantity', String(data.quantity ?? 1));
  await page.fillByTestId('inventory-target-location', String(data.targetLocation ?? data.receiveLocation ?? data.location ?? 'IN-01'));
  await clickActionAndRecord(page, 'inventory-receive', steps, timeoutMs);
}

async function runInventoryMove(page, data, steps, timeoutMs) {
  await navigateHash(page, '/inventory');
  const allowIdle = data.allowNoInventory === true || data.allowConflictAsIdle === true;
  try {
    await selectInventoryRow(page, data, { avoidLocation: data.targetLocation });
  } catch (error) {
    if (allowIdle && isInventoryIdleError(error)) {
      recordInventoryIdle(steps, 'inventory_move', data, error);
      return;
    }
    throw error;
  }
  const selectedRowText = await page.selectedTableRadioRowText('quant').catch(() => '');
  let targetLocation = String(data.targetLocation ?? 'TEST-LOC-01');
  if (selectedRowText && selectedRowText.toLowerCase().includes(targetLocation.toLowerCase())) {
    targetLocation = chooseAlternateInventoryLocation(targetLocation, selectedRowText);
    steps.push({
      action: 'inventory-move-target-adjusted',
      preferredTargetLocation: String(data.targetLocation ?? 'TEST-LOC-01'),
      targetLocation,
      reason: 'selected quant is already in preferred target location',
    });
  }
  await page.fillByTestId('inventory-quantity', String(data.quantity ?? 1));
  await page.fillByTestId('inventory-target-location', targetLocation);
  try {
    await clickActionAndRecord(page, 'inventory-move', steps, timeoutMs);
  } catch (error) {
    if (allowIdle && isInventoryIdleError(error)) {
      recordInventoryIdle(steps, 'inventory_move', data, error);
      return;
    }
    throw error;
  }
}

function chooseAlternateInventoryLocation(preferredLocation, selectedRowText) {
  const rowText = String(selectedRowText ?? '').toLowerCase();
  const preferred = String(preferredLocation ?? '').toLowerCase();
  const candidates = ['A-05-01', 'A-05-02', 'A-04-01', 'A-04-02', 'A-03-01', 'A-03-02', 'B-05-01', 'B-05-02', 'IN-01'];
  return candidates.find((candidate) => {
    const normalized = candidate.toLowerCase();
    return normalized !== preferred && !rowText.includes(normalized);
  }) ?? 'TEST-LOC-02';
}

async function runInventoryAdjust(page, data, steps, timeoutMs) {
  await navigateHash(page, '/inventory');
  const allowIdle = data.allowNoInventory === true || data.allowConflictAsIdle === true;
  try {
    await selectInventoryRow(page, data);
  } catch (error) {
    if (allowIdle && isInventoryIdleError(error)) {
      recordInventoryIdle(steps, 'inventory_adjust', data, error);
      return;
    }
    throw error;
  }
  await page.fillByTestId('inventory-quantity', String(data.quantity ?? 1));
  try {
    await clickActionAndRecord(page, 'inventory-adjust', steps, timeoutMs);
  } catch (error) {
    if (allowIdle && isInventoryIdleError(error)) {
      recordInventoryIdle(steps, 'inventory_adjust', data, error);
      return;
    }
    throw error;
  }
}

function isInventoryIdleError(error) {
  const text = (error instanceof Error ? error.message : String(error)).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return [
    'missing table row',
    'konflikt',
    'akce uz probehla',
    'not found',
    'no visible inventory',
  ].some((marker) => text.includes(marker));
}

function recordInventoryIdle(steps, process, data, error) {
  steps.push({
    action: 'inventory-idle',
    process,
    sku: data.sku ?? null,
    quantity: data.quantity ?? null,
    targetLocation: data.targetLocation ?? null,
    reason: error instanceof Error ? error.message.slice(0, 220) : String(error).slice(0, 220),
  });
}

async function runTaskClaimStartConfirm(page, data, steps, timeoutMs) {
  await navigateHash(page, '/tasks');
  if (data.taskReference) await clickTableRadioContainingWithWait(page, String(data.taskReference), 'task', timeoutMs);
  const ownedRowCandidates = [
    data.operatorDisplayName,
    data.operatorLoginName,
  ].filter(Boolean).map(String);

  const repeat = Math.max(1, Math.min(20, Number(data.repeat ?? 1)));
  for (let index = 0; index < repeat; index += 1) {
    const maxAttempts = data.claim === false ? 1 : 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (index > 0 || attempt > 1) await navigateHash(page, '/tasks');
        if (data.claim !== false) {
          await clickActionAndRecord(page, 'task-claim-next', steps, timeoutMs);
          await selectAnyTaskRow(page, ownedRowCandidates, timeoutMs).catch(() => null);
        }
        if (data.start !== false) {
          await selectAnyTaskRow(page, ownedRowCandidates, 3000).catch(() => null);
          await clickActionAndRecord(page, 'task-start-selected', steps, timeoutMs);
          await selectAnyTaskRow(page, ownedRowCandidates, 3000).catch(() => null);
        }
        if (data.confirm !== false) {
          await selectAnyTaskRow(page, ownedRowCandidates, 3000).catch(() => null);
          await clickActionAndRecord(page, 'task-confirm-selected', steps, timeoutMs);
        }
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (data.allowNoTask === true && isNoTaskAvailable(message)) {
          steps.push({ action: 'task-no-work-available', statusText: message.slice(0, 220) });
          return;
        }
        if (attempt >= maxAttempts || !isRetryableProcessError(message)) throw error;
        steps.push({ action: 'task-retry-after-conflict', statusText: message.slice(0, 220) });
        await navigateHash(page, '/tasks');
      }
    }
  }
}

async function runRfExpectedSteps(page, data, steps, timeoutMs) {
  await navigateHash(page, '/rf');
  if (data.taskReference) await page.clickButtonContaining(String(data.taskReference)).catch(() => null);
  try {
    await startRfWithAvailableTask(page, steps, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (data.allowNoTask === true && isRetryableProcessError(message)) {
      steps.push({ action: 'rf-idle', reason: 'no startable RF task was available', statusText: message.slice(0, 220) });
      return;
    }
    throw error;
  }

  const count = Math.max(1, Math.min(12, Number(data.steps ?? 5)));
  const useHardwareScanner = data.hardwareScanner === true || data.scanMode === 'keyboard-wedge';
  const terminator = normalizeScannerTerminator(data.terminator ?? 'enter');
  for (let index = 0; index < count; index += 1) {
    const expected = await page.readRfExpectedScanValue();
    if (!expected) {
      const taskRowCount = await visibleMcpRowCount(page, 'rf-task').catch(() => 0);
      steps.push({
        action: 'rf-idle',
        reason: taskRowCount > 0 ? 'RF task is visible but has no expected scan value yet' : 'RF queue is empty',
        taskRowCount,
      });
      return;
    }

    if (useHardwareScanner) {
      await page.keyboardWedgeScanByTestId('rf-scan-input', expected, terminator);
      await waitForUiSettle(page, 500).catch(() => null);
      const remainingInputValue = await page.readControlValueByTestId('rf-scan-input').catch(() => null);
      steps.push({
        action: 'rf-keyboard-wedge-scan',
        value: expected,
        terminator,
        remainingInputValue,
        statusText: await actionStatus(page).catch(() => ''),
      });
      if (remainingInputValue === expected) {
        await clickActionAndRecord(page, 'rf-confirm-scan', steps, timeoutMs);
      }
    } else {
      const filledByAssist = await page.clickMcpAction('rf-fill-expected', 1200).then(() => true, () => false);
      if (!filledByAssist) await page.fillByTestId('rf-scan-input', expected);
      await clickActionAndRecord(page, 'rf-confirm-scan', steps, timeoutMs);
    }
  }
}

async function runPackingScanAndShip(page, data, steps, timeoutMs) {
  await navigateHash(page, '/packing');
  const scanValues = Array.isArray(data.scanValues) && data.scanValues.length
    ? data.scanValues.map(String)
    : await page.readPackingRequiredScanValues();

  if (!scanValues.length) {
    const packageState = await page.mcpActionState('packing-create-package');
    if (!packageState.enabled) {
      steps.push({
        action: 'packing-idle',
        reason: packageState.exists ? 'no order ready for packing yet' : 'packing action unavailable',
        state: packageState,
      });
      return;
    }
  }

  for (const value of scanValues) {
    await page.fillByTestId('packing-scan-input', value);
    await page.clickMcpAction('packing-confirm-scan');
    steps.push({ action: 'packing-confirm-scan', value, statusText: await actionStatus(page) });
    await page.waitForIdle(300);
  }

  if (data.createPackage !== false) {
    const packageReady = await waitForMcpActionEnabled(page, 'packing-create-package', Math.min(timeoutMs, 15000));
    if (!packageReady) {
      const remainingScanValues = await page.readPackingRequiredScanValues();
      steps.push({
        action: 'packing-idle',
        reason: remainingScanValues.length > 0 ? 'packing package action stayed disabled after scans' : 'packing workbench refreshed before package creation',
        remainingScanValues: remainingScanValues.slice(0, 6),
        state: await page.mcpActionState('packing-create-package'),
      });
      return;
    }
    try {
      await clickActionAndRecord(page, 'packing-create-package', steps, timeoutMs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (data.allowConflictAsIdle === true && isRetryableProcessError(message)) {
        steps.push({ action: 'packing-idle', reason: 'another worker completed the package first', statusText: message.slice(0, 220) });
        return;
      }
      throw error;
    }
  }
  try {
    if (data.generateLabel !== false) await clickActionAndRecord(page, 'packing-generate-label', steps, timeoutMs);
    if (data.ship === true) await clickActionAndRecord(page, 'packing-ship-shipment', steps, timeoutMs);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (data.allowConflictAsIdle === true && isRetryableProcessError(message)) {
      steps.push({ action: 'packing-idle', reason: 'packing state changed concurrently', statusText: message.slice(0, 220) });
      return;
    }
    throw error;
  }
}

async function waitForMcpActionEnabled(page, action, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await page.mcpActionState(action);
    if (state.enabled) return true;
    await page.waitForIdle(150);
    await delay(250);
  }
  return false;
}

async function runLabelPreviewAndQueue(page, data, steps, timeoutMs) {
  if (!data.printerCode) {
    throw new Error('label_preview_and_queue requires data.printerCode.');
  }
  if (!data.labelCode) {
    throw new Error('label_preview_and_queue requires data.labelCode.');
  }

  await navigateHash(page, '/print-stations');
  await page.fillByTestId('print-label-template', String(data.templateReference ?? '')).catch(() => null);
  await selectPrintLabelPrinter(page, String(data.printerCode), steps, timeoutMs);
  await page.fillByTestId('print-label-code', String(data.labelCode));
  if (data.title) await page.fillByTestId('print-label-title', String(data.title));
  if (data.subtitle) await page.fillByTestId('print-label-subtitle', String(data.subtitle));
  await clickActionAndRecord(page, 'print-label-preview', steps, timeoutMs);
  if (data.enqueue !== false) await clickActionAndRecord(page, 'print-label-enqueue', steps, timeoutMs);
}

async function selectPrintLabelPrinter(page, printerCode, steps, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 45000);
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await page.selectByTestId('print-label-printer', printerCode);
      return;
    } catch (error) {
      lastError = error;
      const selected = await page.selectFirstOptionByTestId('print-label-printer').catch(() => null);
      if (selected) {
        steps.push({
          action: 'print-label-printer-fallback',
          requestedPrinter: printerCode,
          selectedPrinter: selected,
        });
        return;
      }
      await page.clickMcpAction('print-refresh', 2500).catch(() => null);
      await page.waitForText(printerCode, 2500).catch(() => null);
      await waitForUiSettle(page, 1200).catch(() => null);
      await delay(300);
    }
  }
  throw lastError ?? new Error(`No printer option was available for ${printerCode}`);
}

async function runPrintSetupAndLabelQueue(page, data, steps, timeoutMs) {
  const printerCode = String(data.printerCode ?? data.printer?.code ?? 'MCP-TISKARNA').trim().toUpperCase();
  const printerName = String(data.printerName ?? data.printer?.name ?? 'MCP test tiskárna').trim();
  const protocol = String(data.protocol ?? data.printer?.protocol ?? 'TCP_9100').trim();
  const host = String(data.host ?? data.printer?.host ?? '127.0.0.1').trim();
  const port = String(data.port ?? data.printer?.port ?? '9100').trim();
  const windowsPrinterName = String(data.windowsPrinterName ?? data.printer?.windowsPrinterName ?? '').trim();
  const agentCode = String(data.agentCode ?? data.agent?.code ?? 'MCP-AGENT').trim().toUpperCase();
  const agentName = String(data.agentName ?? data.agent?.name ?? 'MCP test agent').trim();
  const agentToken = String(data.agentToken ?? data.agent?.token ?? 'mcp-agent-token-2026-local-secret');
  const labelCode = String(data.labelCode ?? 'AARD1:LOC:MAIN:A-01-01').trim();

  if (!printerCode || !printerName) throw new Error('print_setup_and_label_queue requires printerCode and printerName.');
  if (agentToken.length < 32) throw new Error('print_setup_and_label_queue requires agentToken with at least 32 characters.');
  if (!labelCode) throw new Error('print_setup_and_label_queue requires labelCode.');

  await navigateHash(page, '/print-stations');
  await savePrinterViaUi(page, {
    printerCode,
    printerName,
    protocol,
    host,
    port,
    windowsPrinterName,
  }, steps, timeoutMs);

  if (data.skipAgent !== true) {
    await page.fillByTestId('print-agent-code', agentCode);
    await page.fillByTestId('print-agent-name', agentName);
    await page.fillByTestId('print-agent-token', agentToken);
    await clickActionAndRecord(page, 'print-save-agent', steps, timeoutMs);
  }

  await page.fillByTestId('print-label-template', String(data.templateReference ?? 'CUSTOM'));
  await page.selectByTestId('print-label-printer', printerCode);
  await page.fillByTestId('print-label-code', labelCode);
  if (data.title) await page.fillByTestId('print-label-title', String(data.title));
  if (data.subtitle) await page.fillByTestId('print-label-subtitle', String(data.subtitle));
  await clickActionAndRecord(page, 'print-label-preview', steps, timeoutMs);
  if (data.enqueue !== false) await clickActionAndRecord(page, 'print-label-enqueue', steps, timeoutMs);
}

async function savePrinterViaUi(page, data, steps, timeoutMs) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.fillByTestId('print-printer-code', data.printerCode);
    await page.fillByTestId('print-printer-name', data.printerName);
    await page.selectByTestId('print-printer-protocol', data.protocol);
    await page.fillByTestId('print-printer-host', data.host);
    await page.fillByTestId('print-printer-port', data.port);
    await page.fillByTestId('print-printer-windows-name', data.windowsPrinterName);
    await clickActionAndRecord(page, 'print-save-printer', steps, timeoutMs);

    try {
      await page.waitForText(data.printerCode, Math.min(timeoutMs, 8000));
      return;
    } catch (error) {
      lastError = error;
      steps.push({
        action: 'print-save-printer-retry',
        attempt,
        printerCode: data.printerCode,
        reason: error instanceof Error ? error.message : String(error),
      });
      await page.clickMcpAction('print-refresh', 2500).catch(() => null);
      await waitForUiSettle(page, 1200).catch(() => null);
    }
  }
  throw lastError ?? new Error(`Printer ${data.printerCode} was not visible after saving.`);
}

async function runOutboundAllocate(page, data, steps, timeoutMs) {
  await navigateHash(page, '/outbound');
  if (data.orderReference) await clickTableRadioContainingWithWait(page, String(data.orderReference), 'order', timeoutMs);
  await clickActionAndRecord(page, 'outbound-allocate-selected', steps, timeoutMs);
}

async function runOutboundReleasePicking(page, data, steps, timeoutMs) {
  await navigateHash(page, '/outbound');
  if (data.orderReference) await clickTableRadioContainingWithWait(page, String(data.orderReference), 'order', timeoutMs);
  await clickActionAndRecord(page, 'outbound-release-picking', steps, timeoutMs);
}

async function runWaveRelease(page, data, steps, timeoutMs) {
  await navigateHash(page, '/waves');
  if (data.waveReference) await clickTableRadioContainingWithWait(page, String(data.waveReference), 'wave', timeoutMs);
  await clickActionAndRecord(page, data.releaseAndCreate === true ? 'wave-release-and-create' : 'wave-release-selected', steps, timeoutMs);
}

async function runSettingsCreateUser(page, data, steps, timeoutMs) {
  const stamp = Date.now();
  const loginName = String(data.loginName ?? `mcp-e2e-${stamp}@aardvarkland.local`);
  const displayName = String(data.displayName ?? `MCP E2E ${stamp}`);
  const password = String(data.password ?? 'Mcp-Local-42!');
  const roleCode = String(data.roleCode ?? 'WAREHOUSE_WORKER');

  await navigateHash(page, '/settings');
  await page.fillByTestId('settings-user-name', displayName);
  await page.fillByTestId('settings-user-login', loginName);
  await page.fillByTestId('settings-user-password', password);
  await page.selectByTestId('settings-user-role', roleCode);
  await clickActionAndRecord(page, 'settings-create-user', steps, timeoutMs);
}

async function selectInventoryRow(page, data, options = {}) {
  if (data.sku) {
    await page.fillFirstInput('.search-input', String(data.sku)).catch(() => null);
    await waitForUiSettle(page, 5000);
    if (options.avoidLocation) {
      const selected = await page.clickTableRadioContainingAvoiding(String(data.sku), 'quant', String(options.avoidLocation)).catch(() => false);
      if (selected) return;
    }
    await clickTableRadioContainingWithWait(page, String(data.sku), 'quant', 5000);
  }
}

async function clickTableRadioContainingWithWait(page, text, radioName, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 12000);
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      await page.clickTableRadioContaining(text, radioName);
      await page.waitForIdle(120);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await waitForUiSettle(page, 1200).catch(() => null);
      await delay(250);
    }
  }
  throw new Error(lastError || `Missing table row containing: ${text}`);
}

async function selectAnyTaskRow(page, candidates, timeoutMs) {
  for (const candidate of candidates) {
    try {
      await clickTableRadioContainingWithWait(page, candidate, 'task', timeoutMs);
      return true;
    } catch {
      // Try the next stable identifier for this worker.
    }
  }
  return false;
}

async function startRfWithAvailableTask(page, steps, timeoutMs) {
  const maxAttempts = 5;
  let lastError;
  for (let index = 0; index < maxAttempts; index += 1) {
    if (index > 0) await clickRfTaskByIndex(page, index).catch(() => null);
    try {
      await clickActionAndRecord(page, 'rf-start-resume', steps, timeoutMs);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!isRetryableProcessError(message)) throw error;
      await waitForUiSettle(page, 1500).catch(() => null);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? 'RF start failed'));
}

async function clickRfTaskByIndex(page, index) {
  const clicked = await page.evaluate((rowIndex) => {
    const rows = [...document.querySelectorAll('[data-mcp-row="rf-task"]')].filter((item) => {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const row = rows[rowIndex];
    if (!row) return false;
    row.click();
    return true;
  }, index);
  if (!clicked) throw new Error(`Missing RF task row at index ${index}`);
  await page.waitForIdle(200);
}

async function visibleMcpRowCount(page, rowName) {
  return page.evaluate((name) => {
    return [...document.querySelectorAll(`[data-mcp-row="${name}"]`)].filter((item) => {
      const rect = item.getBoundingClientRect();
      const style = getComputedStyle(item);
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
    }).length;
  }, rowName);
}

function isRetryableProcessError(message) {
  const normalized = String(message).toLowerCase();
  return [
    'konflikt',
    'conflict',
    'akce už proběhla',
    'already',
    'missing table row',
    'cdp timeout',
  ].some((marker) => normalized.includes(marker));
}

function isNoTaskAvailable(message) {
  const normalized = String(message).toLowerCase();
  return normalized.includes('no open warehouse task is available to claim');
}

function displayNameFromMcpLogin(loginName) {
  const value = String(loginName ?? '').trim().toLowerCase();
  const worker = value.match(/^mcp-skladnik-(\d{2})@/);
  if (worker) return `MCP Skladník ${worker[1]}`;
  if (value.startsWith('mcp-skladnik@')) return 'MCP Skladník';
  if (value.startsWith('mcp-vedouci-shift@')) return 'MCP Vedoucí směny';
  if (value.startsWith('mcp-vedouci@')) return 'MCP Vedoucí';
  if (value.startsWith('mcp-spravce@')) return 'MCP Správce';
  return loginName;
}

async function navigateHash(page, hash) {
  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, hash);
  await page.waitForIdle(900);
  await waitForUiSettle(page, 5000).catch(() => null);
}

async function clickAndRecord(page, text, steps, timeoutMs) {
  await page.clickByText(text, 'button');
  await waitForApiSettle(page, timeoutMs);
  steps.push({ action: text, statusText: await actionStatus(page) });
  await page.waitForIdle(500);
}

async function clickActionAndRecord(page, action, steps, timeoutMs) {
  await page.clickMcpAction(action);
  await waitForApiSettle(page, timeoutMs);
  const statusText = await actionStatus(page);
  steps.push({ action, statusText });
  await page.waitForIdle(500);
  const errors = extractApiErrors(statusText);
  if (errors.length > 0) {
    throw new Error(`${action} failed: ${errors.join('; ')}`);
  }
}

async function clickInCardAndRecord(page, cardTitle, text, steps, timeoutMs) {
  await page.clickButtonInCard(cardTitle, text);
  await waitForApiSettle(page, timeoutMs);
  steps.push({ action: `${cardTitle} / ${text}`, statusText: await actionStatus(page) });
  await page.waitForIdle(500);
}

async function waitForApiSettle(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const running = await page.evaluate(() => {
      const texts = [...document.querySelectorAll('.action-status, .inline-banner')]
        .map((element) => (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' '));
      return texts.some((text) =>
        text.includes('Volání API') ||
        text.includes('API call') ||
        text.includes('Виклик API') ||
        text.includes('probíhá') ||
        text.includes('is running') ||
        text.includes('виконується')
      );
    });
    if (!running) return;
    await delay(250);
  }
}

async function waitForUiSettle(page, timeoutMs) {
  const deadline = Date.now() + Math.min(timeoutMs, 12000);
  while (Date.now() < deadline) {
    await waitForApiSettle(page, Math.min(timeoutMs, 3000));
    const busy = await page.evaluate(() => {
      const busyNodes = [...document.querySelectorAll('[aria-busy="true"], [data-loading="true"]')];
      if (busyNodes.some((node) => {
        const style = getComputedStyle(node);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })) return true;

      const buttonTexts = [...document.querySelectorAll('button')]
        .map((button) => (button.innerText || button.textContent || '').trim().replace(/\s+/g, ' '));
      return buttonTexts.some((text) =>
        /loading|saving|running|načít|uklád|probíhá|завантаж|збереж|викону/i.test(text)
      );
    });
    if (!busy) return;
    await delay(250);
  }
}

async function actionStatus(page) {
  return page.evaluate(() => {
    const actionBanners = [...document.querySelectorAll('.action-status')];
    const fallbackBanners = [...document.querySelectorAll('.inline-banner')];
    const banner = actionBanners.at(-1) ?? fallbackBanners.at(-1);
    return banner?.innerText?.trim().replace(/\s+/g, ' ') ?? '';
  });
}

function extractApiErrors(text) {
  const normalized = text.replace(/\s+/g, ' ');
  const failures = [];
  const markers = [
    'API chyba',
    'API error',
    'API помилка',
    'selhalo:',
    'failed:',
    'не вдалося:',
  ];
  for (const marker of markers) {
    const index = normalized.toLowerCase().indexOf(marker.toLowerCase());
    if (index >= 0) failures.push(normalized.slice(index, index + 300));
  }
  return failures;
}

async function httpCheckWithRetry(name, url, timeoutMs, attempts = 5) {
  const samples = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const check = await httpCheck(name, url, Math.min(timeoutMs, 15000));
    samples.push(check);
    if (check.ok) {
      return {
        ...check,
        attempts: attempt,
        previousErrors: samples.slice(0, -1).filter((sample) => !sample.ok).map((sample) => sample.error ?? sample.status),
      };
    }
    if (attempt < attempts) await delay(1000);
  }
  const last = samples[samples.length - 1];
  return {
    ...last,
    attempts,
    previousErrors: samples.slice(0, -1).filter((sample) => !sample.ok).map((sample) => sample.error ?? sample.status),
  };
}

async function httpCheck(name, url, timeoutMs) {
  const started = Date.now();
  try {
    const response = await fetchWithTimeout(url, timeoutMs);
    const text = await response.text();
    return {
      name,
      url,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      sample: text.slice(0, 180),
    };
  } catch (error) {
    return {
      name,
      url,
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      optional: name === 'localPanel',
    };
  }
}

function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

function joinUrl(base, path) {
  const normalizedBase = String(base).replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function normalizeViewport(viewport) {
  return {
    width: Math.max(320, Number(viewport?.width ?? 1440)),
    height: Math.max(320, Number(viewport?.height ?? 960)),
  };
}

function normalizeViewportList(viewports) {
  if (Array.isArray(viewports) && viewports.length > 0) {
    return viewports.map(normalizeViewport);
  }
  return [normalizeViewport()];
}

function normalizeRoleList(roles) {
  const allowed = new Set(Object.keys(roleProfiles));
  if (Array.isArray(roles) && roles.length > 0) {
    const selected = [...new Set(roles.filter((role) => allowed.has(role)))];
    return selected.length > 0 ? selected : ['skladnik', 'vedouci', 'spravce'];
  }
  return ['skladnik', 'vedouci', 'spravce'];
}

function normalizeLanguageList(languages) {
  if (Array.isArray(languages) && languages.length > 0) {
    return [...new Set(languages.map(normalizeLanguage).filter(Boolean))];
  }
  return ['cs'];
}

function createReport(kind, label) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(defaultReportsDir, `${stamp}-${kind}-${label}`);
  return { dir, file: join(dir, 'report.json') };
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function expectIncludes(text, expected, failures, label) {
  for (const value of expected) {
    if (!text.includes(value)) failures.push(`${label}: missing "${value}"`);
  }
}

function expectExcludes(text, forbidden, failures, label) {
  for (const value of forbidden) {
    if (text.includes(value)) failures.push(`${label}: visible "${value}"`);
  }
}

function safeFile(value) {
  return value.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'route';
}

async function launchBrowser({ viewport }) {
  const executable = findBrowserExecutable();
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const userDataDir = await mkdtemp(join(tmpdir(), 'aardvark-mcp-browser-'));
    const port = 9300 + Math.floor(Math.random() * 1200);
    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-gpu',
      '--disable-popup-blocking',
      `--window-size=${viewport.width},${viewport.height}`,
      'about:blank',
    ];
    const child = spawn(executable, args, { stdio: ['ignore', 'ignore', 'ignore'] });
    const endpoint = `http://127.0.0.1:${port}`;

    try {
      await waitForDebugger(endpoint, attempt === 1 ? 30000 : 45000);
    } catch (error) {
      lastError = error;
      killBrowserProcessTree(child);
      await rm(userDataDir, { recursive: true, force: true }).catch(() => null);
      await delay(750 * attempt);
      continue;
    }

    return {
      async newPage() {
        const target = await fetchJson(`${endpoint}/json/new?about:blank`, { method: 'PUT' }).catch(() =>
          fetchJson(`${endpoint}/json/new`),
        );
        const wsUrl = target.webSocketDebuggerUrl;
        const page = new CdpPage(wsUrl, viewport);
        await page.connect();
        return page;
      },
      async close() {
        killBrowserProcessTree(child);
        await rm(userDataDir, { recursive: true, force: true }).catch(() => null);
      },
    };
  }

  throw new Error(`Browser debugger did not start after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function killBrowserProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 5000 });
    return;
  }
  child.kill();
}

function findBrowserExecutable() {
  const candidates = [
    process.env.AARDVARK_MCP_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error('Chrome or Edge was not found. Set AARDVARK_MCP_BROWSER to a Chromium executable.');
  }

  return found;
}

async function waitForDebugger(endpoint, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetchJson(`${endpoint}/json/version`);
      return;
    } catch {
      await delay(200);
    }
  }
  throw new Error(`Browser debugger did not start at ${endpoint}`);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class CdpPage {
  constructor(wsUrl, viewport) {
    this.wsUrl = wsUrl;
    this.viewport = viewport;
    this.nextId = 1;
    this.pending = new Map();
    this.consoleListeners = [];
    this.pageErrorListeners = [];
    this.networkResponseListeners = [];
  }

  async connect() {
    this.socket = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('CDP websocket timeout')), 8000);
      this.socket.addEventListener('open', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('CDP websocket error'));
      }, { once: true });
    });

    this.socket.addEventListener('message', (event) => this.handleMessage(event.data));
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
      return;
    }

    if (message.method === 'Runtime.consoleAPICalled') {
      const args = message.params.args ?? [];
      this.consoleListeners.forEach((listener) => listener({
        type: message.params.type,
        text: args.map((arg) => arg.value ?? arg.description ?? '').join(' '),
      }));
    }

    if (message.method === 'Runtime.exceptionThrown') {
      this.pageErrorListeners.forEach((listener) => listener({
        text: message.params.exceptionDetails?.text ?? 'Runtime exception',
        detail: message.params.exceptionDetails?.exception?.description,
      }));
    }

    if (message.method === 'Network.responseReceived') {
      const response = message.params.response ?? {};
      this.networkResponseListeners.forEach((listener) => listener({
        url: response.url ?? '',
        status: response.status ?? 0,
        mimeType: response.mimeType ?? '',
      }));
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, Number(process.env.AARDVARK_MCP_CDP_TIMEOUT_MS ?? 60000));
    });
  }

  async enable() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.send('Network.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.viewport.width,
      height: this.viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  onConsole(listener) {
    this.consoleListeners.push(listener);
  }

  onPageError(listener) {
    this.pageErrorListeners.push(listener);
  }

  onNetworkResponse(listener) {
    this.networkResponseListeners.push(listener);
  }

  async navigate(url, timeoutMs) {
    await this.send('Page.navigate', { url });
    await this.waitForLoad(timeoutMs);
  }

  async waitForLoad(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ready = await this.evaluate(() => document.readyState);
      if (ready === 'complete') return;
      await delay(100);
    }
    throw new Error('Page load timed out');
  }

  async waitForIdle(ms) {
    await delay(ms);
  }

  async waitForText(text, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const bodyText = await this.text();
      if (bodyText.includes(text)) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for text: ${text}`);
  }

  async waitForSelector(selector, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = await this.evaluate((sel) => Boolean(document.querySelector(sel)), selector);
      if (found) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for selector: ${selector}`);
  }

  async waitForNotText(text, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const bodyText = await this.text();
      if (!bodyText.includes(text)) return;
      await delay(100);
    }
    throw new Error(`Timed out waiting for text to disappear: ${text}`);
  }

  async text() {
    return this.evaluate(() => document.body?.innerText ?? '');
  }

  async type(selector, value) {
    await this.evaluate((sel, nextValue) => {
      const element = document.querySelector(sel);
      if (!element) throw new Error(`Missing selector: ${sel}`);
      const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
      descriptor?.set?.call(element, nextValue);
      if (element.value !== nextValue) element.value = nextValue;
      element.focus();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
  }

  async click(selector) {
    await this.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) throw new Error(`Missing selector: ${sel}`);
      if (element.disabled) throw new Error(`Selector is disabled: ${sel}`);
      element.click();
    }, selector);
  }

  async clickByText(text, selector = 'button') {
    await this.evaluate((wanted, sel) => {
      const normalizedWanted = String(wanted).trim().toLowerCase();
      const elements = [...document.querySelectorAll(sel)];
      const element = elements.find((item) => (item.innerText || item.textContent || '').trim().toLowerCase().includes(normalizedWanted));
      if (!element) throw new Error(`Missing clickable text: ${wanted}`);
      if (element.disabled) throw new Error(`Clickable text is disabled: ${wanted}`);
      if (element instanceof HTMLButtonElement && element.type === 'submit' && element.form) {
        element.form.requestSubmit(element);
      } else {
        element.click();
      }
    }, text, selector);
  }

  async clickButtonContaining(text) {
    await this.clickByText(text, 'button');
  }

  async fillFirstInput(selector, value) {
    await this.evaluate((sel, nextValue) => {
      const element = document.querySelector(sel);
      if (!element) throw new Error(`Missing input selector: ${sel}`);
      const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
      descriptor?.set?.call(element, nextValue);
      if (element.value !== nextValue) element.value = nextValue;
      element.focus();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector, value);
  }

  async fillByTestId(testId, value) {
    await this.evaluate((wantedTestId, nextValue) => {
      const element = findVisibleByAttribute('data-testid', wantedTestId, 'input, textarea, select');
      if (!element) throw new Error(`Missing data-testid: ${wantedTestId}`);
      setControlValue(element, nextValue);

      function findVisibleByAttribute(attribute, value, selector) {
        return [...document.querySelectorAll(selector)]
          .filter((item) => item.getAttribute(attribute) === String(value))
          .find(isVisible);
      }

      function isVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
      }

      function setControlValue(element, value) {
        if (element.readOnly) throw new Error(`data-testid is readonly: ${wantedTestId}`);
        if (element.disabled) throw new Error(`data-testid is disabled: ${wantedTestId}`);
        if (element.tagName.toLowerCase() === 'select') {
          element.value = String(value);
        } else {
          const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
          descriptor?.set?.call(element, String(value));
          if (element.value !== String(value)) element.value = String(value);
        }
        element.focus();
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, testId, value);
  }

  async keyboardWedgeScanByTestId(testId, value, terminator = 'enter') {
    await this.evaluate((wantedTestId) => {
      const element = [...document.querySelectorAll('input, textarea')]
        .filter((item) => item.getAttribute('data-testid') === String(wantedTestId))
        .find((item) => {
          const rect = item.getBoundingClientRect();
          const style = getComputedStyle(item);
          return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      if (!element) throw new Error(`Missing scanner input data-testid: ${wantedTestId}`);
      if (element.disabled) throw new Error(`Scanner input is disabled: ${wantedTestId}`);
      if (element.readOnly) throw new Error(`Scanner input is readonly: ${wantedTestId}`);
      const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
      descriptor?.set?.call(element, '');
      if (element.value !== '') element.value = '';
      element.focus();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, testId);

    await this.send('Input.insertText', { text: String(value) });
    await this.waitForIdle(60);

    if (terminator === 'none') return;
    const key = terminator === 'tab' ? 'Tab' : 'Enter';
    const code = terminator === 'tab' ? 'Tab' : 'Enter';
    const keyCode = terminator === 'tab' ? 9 : 13;
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key,
      code,
      windowsVirtualKeyCode: keyCode,
      nativeVirtualKeyCode: keyCode,
    });
    await this.waitForIdle(250);
  }

  async readControlValueByTestId(testId) {
    return this.evaluate((wantedTestId) => {
      const element = [...document.querySelectorAll('input, textarea, select')]
        .filter((item) => item.getAttribute('data-testid') === String(wantedTestId))
        .find((item) => {
          const rect = item.getBoundingClientRect();
          const style = getComputedStyle(item);
          return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      return element ? element.value : null;
    }, testId);
  }

  async selectByTestId(testId, value) {
    await this.evaluate((wantedTestId, nextValue) => {
      const element = [...document.querySelectorAll('select')]
        .filter((item) => item.getAttribute('data-testid') === String(wantedTestId))
        .find((item) => {
          const rect = item.getBoundingClientRect();
          const style = getComputedStyle(item);
          return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      if (!element) throw new Error(`Missing select data-testid: ${wantedTestId}`);
      if (element.disabled) throw new Error(`Select is disabled: ${wantedTestId}`);
      const exact = [...element.options].find((option) => option.value === String(nextValue));
      const fuzzy = exact ?? [...element.options].find((option) => (option.textContent || '').trim().toLowerCase().includes(String(nextValue).trim().toLowerCase()));
      if (!fuzzy) throw new Error(`Select ${wantedTestId} has no option: ${nextValue}`);
      element.value = fuzzy.value;
      element.focus();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, testId, value);
  }

  async selectFirstOptionByTestId(testId) {
    return this.evaluate((wantedTestId) => {
      const element = [...document.querySelectorAll('select')]
        .filter((item) => item.getAttribute('data-testid') === String(wantedTestId))
        .find((item) => {
          const rect = item.getBoundingClientRect();
          const style = getComputedStyle(item);
          return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
        });
      if (!element || element.disabled) return null;
      const option = [...element.options].find((item) => !item.disabled && item.value !== '');
      if (!option) return null;
      element.value = option.value;
      element.focus();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { value: option.value, text: (option.textContent || '').trim() };
    }, testId);
  }

  async clickMcpAction(action, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    let lastError = '';
    while (Date.now() < deadline) {
      const clicked = await this.evaluate((wantedAction) => {
        const elements = [...document.querySelectorAll('[data-mcp-action]')]
          .filter((item) => item.getAttribute('data-mcp-action') === String(wantedAction))
          .filter(isVisible);
        const element = elements.find((item) => !isDisabled(item));
        if (!elements.length) return { ok: false, error: `Missing data-mcp-action: ${wantedAction}` };
        if (!element) return { ok: false, error: `data-mcp-action is disabled: ${wantedAction}` };
        if (element instanceof HTMLButtonElement && element.type === 'submit' && element.form) {
          element.form.requestSubmit(element);
        } else {
          element.click();
        }
        return { ok: true };

        function isVisible(element) {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
        }

        function isDisabled(element) {
          return Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true');
        }
      }, action);

      if (clicked?.ok) {
        await this.waitForIdle(120);
        return;
      }
      lastError = clicked?.error ?? `Could not click ${action}`;
      await delay(200);
    }
    throw new Error(lastError || `Timed out clicking data-mcp-action: ${action}`);
  }

  async mcpActionState(action) {
    return this.evaluate((wantedAction) => {
      const elements = [...document.querySelectorAll('[data-mcp-action]')]
        .filter((item) => item.getAttribute('data-mcp-action') === String(wantedAction))
        .filter(isVisible);
      const enabled = elements.find((item) => !isDisabled(item));
      return {
        exists: elements.length > 0,
        enabled: Boolean(enabled),
        disabledCount: elements.filter(isDisabled).length,
      };

      function isVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden';
      }

      function isDisabled(element) {
        return Boolean(element.disabled || element.getAttribute('aria-disabled') === 'true');
      }
    }, action);
  }

  async fillInputByLabel(labelText, value) {
    await this.evaluate((wantedLabel, nextValue) => {
      const normalizedWanted = String(wantedLabel).trim().toLowerCase();
      const labels = [...document.querySelectorAll('label')];
      const label = labels.find((item) => (item.innerText || item.textContent || '').trim().toLowerCase().includes(normalizedWanted));
      if (!label) throw new Error(`Missing label: ${wantedLabel}`);
      const element = label.querySelector('input, textarea, select');
      if (!element) throw new Error(`Label has no editable field: ${wantedLabel}`);
      if (element.readOnly) throw new Error(`Field is readonly: ${wantedLabel}`);
      const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
      descriptor?.set?.call(element, nextValue);
      if (element.value !== nextValue) element.value = nextValue;
      element.focus();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, labelText, value);
  }

  async fillInputInCard(cardTitle, labelText, value) {
    await this.evaluate((wantedCard, wantedLabel, nextValue) => {
      const normalizedCard = String(wantedCard).trim().toLowerCase();
      const normalizedLabel = String(wantedLabel).trim().toLowerCase();
      const cards = [...document.querySelectorAll('section.card')];
      const card = cards.find((item) => {
        const heading = item.querySelector('h2, h3');
        return (heading?.innerText || heading?.textContent || '').trim().toLowerCase().includes(normalizedCard);
      });
      if (!card) throw new Error(`Missing card: ${wantedCard}`);
      const labels = [...card.querySelectorAll('label')];
      const label = labels.find((item) => (item.innerText || item.textContent || '').trim().toLowerCase().includes(normalizedLabel));
      if (!label) throw new Error(`Missing label in ${wantedCard}: ${wantedLabel}`);
      const element = label.querySelector('input, textarea, select');
      if (!element) throw new Error(`Label has no editable field in ${wantedCard}: ${wantedLabel}`);
      if (element.readOnly) throw new Error(`Field is readonly in ${wantedCard}: ${wantedLabel}`);
      const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
      descriptor?.set?.call(element, nextValue);
      if (element.value !== nextValue) element.value = nextValue;
      element.focus();
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, cardTitle, labelText, value);
  }

  async clickButtonInCard(cardTitle, text) {
    await this.evaluate((wantedCard, wantedText) => {
      const normalizedCard = String(wantedCard).trim().toLowerCase();
      const normalizedText = String(wantedText).trim().toLowerCase();
      const cards = [...document.querySelectorAll('section.card')];
      const card = cards.find((item) => {
        const heading = item.querySelector('h2, h3');
        return (heading?.innerText || heading?.textContent || '').trim().toLowerCase().includes(normalizedCard);
      });
      if (!card) throw new Error(`Missing card: ${wantedCard}`);
      const buttons = [...card.querySelectorAll('button')];
      const button = buttons.find((item) => (item.innerText || item.textContent || '').trim().toLowerCase().includes(normalizedText));
      if (!button) throw new Error(`Missing button in ${wantedCard}: ${wantedText}`);
      if (button.disabled) throw new Error(`Button is disabled in ${wantedCard}: ${wantedText}`);
      if (button instanceof HTMLButtonElement && button.type === 'submit' && button.form) {
        button.form.requestSubmit(button);
      } else {
        button.click();
      }
    }, cardTitle, text);
  }

  async clickTableRadioContaining(text, radioName) {
    await this.evaluate((wanted, name) => {
      const normalizedWanted = String(wanted).trim().toLowerCase();
      const rows = [...document.querySelectorAll('tr')];
      const row = rows.find((item) => (item.innerText || item.textContent || '').trim().toLowerCase().includes(normalizedWanted));
      if (!row) throw new Error(`Missing table row containing: ${wanted}`);
      const selector = name ? `input[type="radio"][name="${name}"]` : 'input[type="radio"]';
      const radio = row.querySelector(selector);
      if (!radio) throw new Error(`Row has no radio input: ${wanted}`);
      if (radio.disabled) throw new Error(`Radio input is disabled: ${wanted}`);
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
    }, text, radioName ?? '');
  }

  async clickTableRadioContainingAvoiding(text, radioName, avoidText) {
    return this.evaluate((wanted, name, avoided) => {
      const normalizedWanted = String(wanted).trim().toLowerCase();
      const normalizedAvoided = String(avoided).trim().toLowerCase();
      const rows = [...document.querySelectorAll('tr')];
      const row = rows.find((item) => {
        const text = (item.innerText || item.textContent || '').trim().toLowerCase();
        return text.includes(normalizedWanted) && !text.includes(normalizedAvoided);
      });
      if (!row) return false;
      const selector = name ? `input[type="radio"][name="${name}"]` : 'input[type="radio"]';
      const radio = row.querySelector(selector);
      if (!radio || radio.disabled) return false;
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, text, radioName ?? '', avoidText);
  }

  async selectedTableRadioRowText(radioName) {
    return this.evaluate((name) => {
      const selector = name ? `input[type="radio"][name="${name}"]:checked` : 'input[type="radio"]:checked';
      const radio = document.querySelector(selector);
      const row = radio?.closest('tr');
      return (row?.innerText || row?.textContent || '').trim();
    }, radioName ?? '');
  }

  async clickFirstTableRadio(radioName) {
    return this.evaluate((name) => {
      const selector = name ? `input[type="radio"][name="${name}"]` : 'input[type="radio"]';
      const radios = [...document.querySelectorAll(selector)].filter((radio) => {
        const rect = radio.getBoundingClientRect();
        const style = getComputedStyle(radio);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && !radio.disabled;
      });
      const radio = radios[0];
      if (!radio) return false;
      radio.click();
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, radioName ?? '');
  }

  async readFastActionButtonTexts(selector) {
    return this.evaluate((sel) => {
      return [...document.querySelectorAll(sel)]
        .map((button) => (button.innerText || button.textContent || '').trim())
        .filter(Boolean);
    }, selector);
  }

  async readPackingRequiredScanValues() {
    return this.evaluate(() => {
      const rows = [...document.querySelectorAll('.packing-lines article')];
      return rows.flatMap((row) => {
        const strongs = [...row.querySelectorAll('strong')]
          .map((item) => (item.innerText || item.textContent || '').trim())
          .filter(Boolean);
        const sku = strongs[0];
        const count = strongs.find((value) => /^\d+\s*\/\s*\d+$/.test(value));
        if (!sku || !count) return [];
        const [scannedText, expectedText] = count.split('/').map((part) => part.trim());
        const scanned = Number.parseInt(scannedText, 10);
        const expected = Number.parseInt(expectedText, 10);
        const remaining = Math.max(0, (Number.isFinite(expected) ? expected : 1) - (Number.isFinite(scanned) ? scanned : 0));
        return Array.from({ length: remaining }, () => sku);
      });
    });
  }

  async readRfExpectedScanValue() {
    return this.evaluate(() => {
      const candidates = [
        ...document.querySelectorAll('.scanner-target strong, [data-testid="rf-expected-scan"], .rf-step strong'),
      ]
        .map((item) => (item.innerText || item.textContent || '').trim())
        .filter(Boolean);
      return candidates.find((value) => !/^\d+\s*\/\s*\d+$/.test(value)) ?? '';
    });
  }

  async auditAndFillControls(seed) {
    return this.evaluate((runSeed) => {
      const fields = [];
      const failures = [];

      function isVisible(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }

      function labelFor(element) {
        const labels = [];
        const id = element.getAttribute('id');
        if (id) {
          const explicit = document.querySelector(`label[for="${CSS.escape(id)}"]`);
          if (explicit) labels.push(explicit.innerText || explicit.textContent || '');
        }
        const wrappingLabel = element.closest('label');
        if (wrappingLabel) labels.push(wrappingLabel.innerText || wrappingLabel.textContent || '');
        labels.push(element.getAttribute('aria-label') || '');
        labels.push(element.getAttribute('placeholder') || '');
        labels.push(element.getAttribute('name') || '');
        return labels
          .map((value) => String(value).replace(/\s+/g, ' ').trim())
          .filter(Boolean)
          .join(' | ')
          .slice(0, 160);
      }

      function cardTitleFor(element) {
        const card = element.closest('section.card');
        const heading = card?.querySelector('h1, h2, h3, h4');
        return (heading?.innerText || heading?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      }

      function isSecret(label) {
        return /token|secret|password|heslo|ключ|парол/i.test(label);
      }

      function testValueFor(element, label) {
        const tag = element.tagName.toLowerCase();
        const type = String(element.getAttribute('type') || '').toLowerCase();
        const source = `${label} ${element.getAttribute('name') || ''} ${element.getAttribute('placeholder') || ''}`.toLowerCase();

        if (tag === 'select') {
          const option = [...element.options].find((item) => !item.disabled && item.value !== '');
          return option?.value ?? element.value;
        }
        if (type === 'number' || /množ|quantity|počet|qty|count|кільк/i.test(source)) return '1';
        if (type === 'email' || /email|e-mail/i.test(source)) return `mcp-${runSeed}@aardvarkland.local`;
        if (type === 'url') return 'https://example.invalid/mcp-test';
        if (type === 'tel') return '+420000000000';
        if (type === 'date') return '2026-05-20';
        if (type === 'time') return '10:00';
        if (type === 'datetime-local') return '2026-05-20T10:00';
        if (/ip|host|адрес/i.test(source)) return '127.0.0.1';
        if (/port/i.test(source)) return '9100';
        if (/token|secret|ключ/i.test(source)) return `mcp-token-${runSeed}-local-test`;
        if (/sku|ean|sken|scan|скан/i.test(source)) return 'ABC-123';
        if (/lokac|location|місц|локац/i.test(source)) return 'A-01-01';
        if (/tisk|printer|принтер/i.test(source)) return `MCP-${runSeed}`.slice(0, 40).toUpperCase();
        if (/code|kód|kod|код/i.test(source)) return `MCP-${runSeed}`.slice(0, 40).toUpperCase();
        if (/název|name|jméno|title|назва|ім/i.test(source)) return `MCP test ${runSeed}`.slice(0, 80);
        if (/text|detail|description|pozn|опис/i.test(source)) return `MCP practical UI check ${runSeed}`.slice(0, 120);
        return `MCP-${runSeed}`.slice(0, 80);
      }

      function setControlValue(element, nextValue) {
        if (element.tagName.toLowerCase() === 'select') {
          element.value = nextValue;
        } else {
          const descriptor = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value');
          descriptor?.set?.call(element, nextValue);
          if (element.value !== nextValue) element.value = nextValue;
        }
        element.focus();
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }

      const controls = [...document.querySelectorAll('input, textarea, select')];
      for (const element of controls) {
        const tag = element.tagName.toLowerCase();
        const type = String(element.getAttribute('type') || '').toLowerCase();
        const label = labelFor(element);
        const base = {
          tag,
          type: type || tag,
          label,
          name: element.getAttribute('name') || '',
          card: cardTitleFor(element),
        };

        if (!isVisible(element)) {
          fields.push({ ...base, status: 'skipped', reason: 'not visible' });
          continue;
        }
        if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(type)) {
          fields.push({ ...base, status: 'skipped', reason: `type ${type}` });
          continue;
        }
        if (['checkbox', 'radio'].includes(type)) {
          fields.push({ ...base, status: 'skipped', reason: `choice ${type}` });
          continue;
        }
        if (element.disabled) {
          fields.push({ ...base, status: 'skipped', reason: 'disabled' });
          continue;
        }
        if (element.readOnly) {
          fields.push({ ...base, status: 'skipped', reason: 'readonly' });
          continue;
        }

        try {
          const nextValue = testValueFor(element, label);
          element.scrollIntoView({ block: 'center', inline: 'nearest' });
          setControlValue(element, nextValue);
          fields.push({
            ...base,
            status: 'filled',
            value: isSecret(label) ? '<generated-test-secret>' : String(nextValue).slice(0, 120),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          fields.push({ ...base, status: 'failed', reason: message });
          failures.push(`${base.card ? `${base.card}: ` : ''}${label || base.name || tag}: ${message}`);
        }
      }

      const editable = fields.filter((field) => !['not visible', 'type hidden', 'type submit', 'type button', 'type reset', 'type image', 'type file', 'choice checkbox', 'choice radio', 'disabled', 'readonly'].includes(field.reason));
      return {
        editableCount: editable.length,
        filledCount: fields.filter((field) => field.status === 'filled').length,
        skippedCount: fields.filter((field) => field.status === 'skipped').length,
        fields,
        failures,
      };
    }, seed);
  }

  async readButtonAudit() {
    return this.evaluate(() => {
      function isVisible(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return false;
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }

      function cardTitleFor(element) {
        const card = element.closest('section.card');
        const heading = card?.querySelector('h1, h2, h3, h4');
        return (heading?.innerText || heading?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      }

      const buttons = [...document.querySelectorAll('button')]
        .filter(isVisible)
        .map((button) => {
          const text = (button.innerText || button.textContent || button.getAttribute('aria-label') || button.title || '')
            .replace(/\s+/g, ' ')
            .trim();
          const busy = Boolean(button.getAttribute('aria-busy') === 'true') ||
            /loading|saving|running|načít|uklád|probíhá|завантаж|збереж|викону/i.test(text);
          return {
            text: text.slice(0, 120),
            disabled: Boolean(button.disabled),
            type: button.type || 'button',
            card: cardTitleFor(button),
            busy,
          };
        });

      return {
        total: buttons.length,
        enabled: buttons.filter((button) => !button.disabled).length,
        disabled: buttons.filter((button) => button.disabled).length,
        buttons,
      };
    });
  }

  async screenshot(path) {
    const data = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(data.data, 'base64'));
  }

  async detectOverflow(limit) {
    return this.evaluate((maxItems) => {
      const nodes = [...document.querySelectorAll('body *')];
      const result = [];

      for (const node of nodes) {
        const element = node;
        if (element.closest('[aria-hidden="true"], [hidden]')) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const overflowX = element.scrollWidth - element.clientWidth;
        const overflowY = element.scrollHeight - element.clientHeight;
        if (overflowX <= 2 && overflowY <= 10) continue;

        const text = (element.innerText || element.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 140);
        if (!text) continue;

        result.push({
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
          text,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        });

        if (result.length >= maxItems) break;
      }

      return result;
    }, limit);
  }

  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? 'Evaluation failed');
    }

    return result.result?.value;
  }

  async close() {
    this.socket?.close();
  }
}

if (directShiftStress) {
  await runDirectShiftStress();
}
