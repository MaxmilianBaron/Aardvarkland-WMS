import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cwd, exit } from 'node:process';

const root = cwd();
const sourceRoot = join(root, 'src');
const findings = [];

for (const filePath of listSourceFiles(sourceRoot)) {
  const text = readFileSync(filePath, 'utf8');
  const display = relative(root, filePath);

  if (/\bAardvarkland WMS\b/.test(text)) {
    findings.push(`${display}: visible UI copy must use Aardvarkland, not Aardvarkland WMS`);
  }

  const resourceStatusLine = text.split(/\r?\n/).find((line) => line.includes('ApiResourceStatus')) ?? '';
  if (/\bmock\b/.test(resourceStatusLine) || /\bfallback\b/.test(resourceStatusLine)) {
    findings.push(`${display}: ApiResourceStatus must not expose mock/fallback production states`);
  }

  if (/setStatus\(['"]mock['"]\)/.test(text) || /setStatus\(['"]fallback['"]\)/.test(text)) {
    findings.push(`${display}: resource state must use disabled/loading/live/error only`);
  }

  if (/console\.log\(/.test(text)) {
    findings.push(`${display}: remove console.log from frontend source`);
  }
}

if (findings.length) {
  console.error(findings.join('\n'));
  exit(1);
}

function listSourceFiles(dir) {
  const result = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      result.push(...listSourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      result.push(path);
    }
  }
  return result;
}
