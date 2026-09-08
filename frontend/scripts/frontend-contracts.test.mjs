import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

function read(relativePath) {
  return readFileSync(join(cwd(), relativePath), 'utf8');
}

test('warehouse manager role cannot administer users in frontend fallback profile', () => {
  const workspace = read('src/core/workspace/workspace.tsx');
  const managerBlock = workspace.match(/id: 'WAREHOUSE_MANAGER',[\s\S]*?focus:/)?.[0] ?? '';
  assert.doesNotMatch(managerBlock, /'user\.manage'/);
  assert.doesNotMatch(managerBlock, /'user\.read'/);
  assert.match(managerBlock, /'scanner\.manage'/);
});

test('manager navigation does not expose settings route', () => {
  const navigation = read('src/app/navigation.ts');
  const adminBlock = navigation.match(/ADMIN:\s*\[[\s\S]*?\],\s*SPRAVCE:/)?.[0] ?? '';
  assert.doesNotMatch(adminBlock, /'\/settings'/);
  assert.match(adminBlock, /'\/print-stations'/);
});

test('manager dashboard copy stays operational, not user-administrative', () => {
  const dashboard = read('src/features/dashboard/DashboardPage.tsx');
  assert.doesNotMatch(dashboard, /Managers see[^']*worker creation/);
  assert.doesNotMatch(dashboard, /Vedoucí skladu vidí[^']*vytvoření skladníka/);
  assert.doesNotMatch(dashboard, /Керівник бачить[^']*створення працівника/);
});

test('API resources expose production-safe states', () => {
  const resource = read('src/core/api/useApiResource.ts');
  assert.match(resource, /'disabled' \| 'loading' \| 'live' \| 'error'/);
  assert.doesNotMatch(resource, /\bmock\b/);
  assert.doesNotMatch(resource, /\bfallback'\s*\|/);
});

test('scanner administration is wired to print stations page', () => {
  const page = read('src/features/system/PrintStationsPage.tsx');
  assert.match(page, /listScanners/);
  assert.match(page, /createScanner/);
  assert.match(page, /scannerResource/);
});

test('concurrent API failures share one refresh operation', () => {
  const http = read('src/core/api/http.ts');
  assert.match(http, /let refreshPromise: Promise<boolean> \| null = null/);
  assert.match(http, /refreshPromise \?\?= performAccessTokenRefresh\(\)\.finally/);
});

test('PWA runtime config is never stored in the service worker cache', () => {
  const serviceWorker = read('public/sw.js');
  const shellBlock = serviceWorker.match(/const APP_SHELL = \[[\s\S]*?\];/)?.[0] ?? '';
  assert.doesNotMatch(shellBlock, /config\.js/);
  assert.match(serviceWorker, /url\.pathname\.endsWith\('\/config\.js'\)/);
  assert.match(serviceWorker, /cache: 'no-store'/);
});

test('API resource keeps the last successful data when refresh fails', () => {
  const resource = read('src/core/api/useApiResource.ts');
  const catchBlock = resource.match(/\.catch\(\(err: unknown\) => \{[\s\S]*?\n\s*\}\);/)?.[0] ?? '';
  assert.doesNotMatch(catchBlock, /setData\(emptyData\)/);
  assert.match(catchBlock, /setStatus\('error'\)/);
});

test('RF offline queue uses IndexedDB with a bounded local fallback', () => {
  const queue = read('src/core/scanning/rfOfflineQueue.ts');
  const page = read('src/features/rf/RfPage.tsx');
  assert.match(queue, /indexedDB\.open/);
  assert.match(queue, /createObjectStore/);
  assert.match(queue, /slice\(0, 500\)/);
  assert.match(page, /loadRfOfflineQueue/);
  assert.match(page, /saveRfOfflineQueue/);
  assert.doesNotMatch(page, /wms-rf-offline-queue-v2/);
});

test('realtime invalidation refreshes resources while polling remains available', () => {
  const realtime = read('src/core/api/realtime.ts');
  const resource = read('src/core/api/useApiResource.ts');
  const printPage = read('src/features/system/PrintStationsPage.tsx');
  assert.match(realtime, /text\/event-stream/);
  assert.match(realtime, /refreshAccessTokenForSession/);
  assert.match(resource, /refreshOnRealtime/);
  assert.match(printPage, /refreshOnRealtime: true/);
  assert.match(printPage, /refreshIntervalMs: 20000/);
});

test('barcode and MFA previews do not inject SVG markup into the application DOM', () => {
  const barcode = read('src/components/scanning/BarcodePreview.tsx');
  const account = read('src/components/layout/AccountMenu.tsx');
  assert.doesNotMatch(barcode, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(account, /dangerouslySetInnerHTML/);
  assert.match(barcode, /svgPreviewDataUri/);
  assert.match(account, /svgPreviewDataUri/);
});

test('warehouse manager overview exposes the compact operational system status', () => {
  const dashboard = read('src/features/dashboard/DashboardPage.tsx');
  const workspace = read('src/core/workspace/workspace.tsx');
  assert.match(dashboard, /workspaceMode === 'SPRAVCE' \|\| workspaceMode === 'ADMIN'/);
  assert.match(dashboard, /<SystemStatusPanel \/>/);
  assert.match(workspace, /'cycle-count\.manage',\s*'integrity\.read',\s*'realtime\.read'/);
});
