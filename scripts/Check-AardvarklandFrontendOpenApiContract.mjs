import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const openApiPath = join(root, 'backend', 'openapi.json');
const frontendApiFiles = [
  join(root, 'frontend', 'src', 'core', 'api', 'wms.ts'),
  join(root, 'frontend', 'src', 'core', 'api', 'auth.ts'),
  join(root, 'frontend', 'src', 'core', 'api', 'http.ts'),
  join(root, 'frontend', 'src', 'core', 'observability', 'frontendObservability.ts'),
];

const openApi = JSON.parse(readFileSync(openApiPath, 'utf8'));
const openApiPaths = Object.keys(openApi.paths ?? {});
const frontendPaths = [...new Set(frontendApiFiles.flatMap((file) => extractEndpointPaths(readFileSync(file, 'utf8'))))].sort();

const missing = [];
for (const path of frontendPaths) {
  const fullPath = path.startsWith('/api/') ? path : `/api${path}`;
  const matcher = templatePathMatcher(fullPath);
  if (!openApiPaths.some((openApiPath) => matcher.test(openApiPath))) {
    missing.push(path);
  }
}

if (missing.length > 0) {
  console.error('Frontend API paths missing from backend/openapi.json:');
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  console.error('');
  console.error('Run backend openapi export after API changes and keep frontend/src/core/api/wms.ts aligned with real backend routes.');
  process.exit(1);
}

console.log(`OpenAPI/frontend contract check passed for ${frontendPaths.length} frontend endpoint templates.`);

function extractEndpointPaths(source) {
  const matches = [];
  const endpointPattern = /:\s*\([^)]*\)\s*=>\s*(["'`])([^"'`]+)\1/g;
  let match;
  while ((match = endpointPattern.exec(source)) !== null) {
    const candidate = match[2];
    if (candidate?.startsWith('/')) {
      matches.push(candidate);
    }
  }

  const apiRequestPattern = /\b(?:apiRequest|joinApiPath)(?:<[^;\n]*?>)?\s*\(\s*(["'`])([^"'`]+)\1/g;
  while ((match = apiRequestPattern.exec(source)) !== null) {
    const candidate = match[2];
    if (candidate?.startsWith('/')) {
      matches.push(candidate);
    }
  }

  const apiBaseUrlPattern = /\$\{config\.apiBaseUrl\}([^"'`]+)/g;
  while ((match = apiBaseUrlPattern.exec(source)) !== null) {
    const candidate = match[1];
    if (candidate?.startsWith('/')) {
      matches.push(candidate);
    }
  }

  return [...new Set(matches)].sort();
}

function templatePathMatcher(path) {
  const escaped = path
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\$\\\{[^}]+\\\}/g, '[^/]+');
  const openApiPattern = escaped.replace(/\\\{[^}]+\\\}/g, '[^/]+');
  return new RegExp(`^${openApiPattern}$`);
}
