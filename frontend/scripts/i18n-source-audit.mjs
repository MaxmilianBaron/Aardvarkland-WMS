import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceRoot = new URL('../src/', import.meta.url);
const sourceRootPath = fileURLToPath(sourceRoot);

export async function auditI18nSources() {
  const files = await walk(sourceRootPath);
  const englishValues = new Map();
  const legacySelectors = [];

  for (const file of files) {
    const sourceText = await readFile(file, 'utf8');
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

    visit(source);

    function visit(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /english/i.test(node.name.text) && node.initializer) {
        collectValues(node.initializer, file, source, englishValues);
      }

      if (ts.isPropertyAssignment(node) && propertyName(node.name) === 'en') {
        collectValues(node.initializer, file, source, englishValues);
      }

      if (ts.isConditionalExpression(node) && isEnglishCondition(node.condition)) {
        collectValues(node.whenTrue, file, source, englishValues);
        legacySelectors.push(locationOf(node, file, source));
      }

      if (ts.isIfStatement(node) && isEnglishCondition(node.expression)) {
        collectValues(node.thenStatement, file, source, englishValues);
        legacySelectors.push(locationOf(node, file, source));
      }

      ts.forEachChild(node, visit);
    }
  }

  return {
    englishValues: [...englishValues.entries()]
      .map(([value, locations]) => ({ value, locations: [...locations] }))
      .sort((left, right) => left.value.localeCompare(right.value)),
    legacySelectors: [...new Set(legacySelectors)].sort(),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await auditI18nSources();
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`English UI candidates: ${result.englishValues.length}\n`);
    process.stdout.write(`Legacy language selectors: ${result.legacySelectors.length}\n`);
    for (const item of result.englishValues) process.stdout.write(`${JSON.stringify(item.value)}\n`);
  }
}

function collectValues(node, file, source, englishValues) {
  if (ts.isStringLiteralLike(node)) {
    const value = node.text.trim();
    if (value && looksLikeUiCopy(value)) {
      const locations = englishValues.get(value) ?? new Set();
      locations.add(locationOf(node, file, source));
      englishValues.set(value, locations);
    }
    return;
  }

  if (ts.isTemplateExpression(node)) {
    const value = node.getText(source).trim();
    if (value && looksLikeUiCopy(value)) {
      const locations = englishValues.get(value) ?? new Set();
      locations.add(locationOf(node, file, source));
      englishValues.set(value, locations);
    }
    return;
  }

  ts.forEachChild(node, (child) => collectValues(child, file, source, englishValues));
}

function isEnglishCondition(node) {
  const text = node.getText().replaceAll(/\s/g, '');
  return text === "language==='en'"
    || text === 'language==="en"'
    || text === "'en'===language"
    || text === '"en"===language';
}

function looksLikeUiCopy(value) {
  if (/^(?:[A-Z][A-Z0-9_]*|[a-z][a-zA-Z0-9]*|[a-z]+(?:\.[a-z]+)+)$/.test(value)) return false;
  if (/^(?:\/|#|\.|https?:|[0-9]+$)/.test(value)) return false;
  return /[A-Za-z]/.test(value);
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return '';
}

function locationOf(node, file, source) {
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return `${relative(sourceRootPath, file).replaceAll('\\', '/')}:${position.line + 1}`;
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}
