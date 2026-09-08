import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cwd } from 'node:process';
import test from 'node:test';

const HTTP_DECORATOR_PATTERN = /^\s*@(Get|Post|Put|Patch|Delete)\b/;
const STRICT_ACCESS_PATTERN = /@(Public|RequirePermissions|RequireWarehousePermissions|RequireAnyFulfillmentPermission)\s*\(/;

test('controller routes are explicitly public, permission-protected, or authenticated self routes', () => {
  const missing: string[] = [];

  for (const filePath of listControllerFiles(join(cwd(), 'src'))) {
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);
    const classContext = text.slice(0, Math.max(0, text.indexOf('export class')));
    const classIsPublic = STRICT_ACCESS_PATTERN.test(classContext) && /@Public\s*\(/.test(classContext);

    for (let index = 0; index < lines.length; index += 1) {
      if (!HTTP_DECORATOR_PATTERN.test(lines[index] ?? '')) {
        continue;
      }

      const context = lines.slice(Math.max(0, index - 10), Math.min(lines.length, index + 6)).join('\n');
      const strictAccess = classIsPublic || STRICT_ACCESS_PATTERN.test(context);
      const authenticatedSelfRoute = isAuthenticatedSelfRoute(filePath, context);

      if (!strictAccess && !authenticatedSelfRoute) {
        missing.push(`${relative(cwd(), filePath)}:${index + 1} ${lines[index]?.trim()}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

function isAuthenticatedSelfRoute(filePath: string, context: string): boolean {
  return filePath.endsWith(join('src', 'auth', 'auth.controller.ts')) && /@ApiBearerAuth\s*\(/.test(context);
}

function listControllerFiles(root: string): string[] {
  const result: string[] = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === 'generated' || entry === 'node_modules') {
        continue;
      }
      result.push(...listControllerFiles(path));
      continue;
    }

    if (entry.endsWith('.controller.ts')) {
      result.push(path);
    }
  }

  return result.sort();
}
