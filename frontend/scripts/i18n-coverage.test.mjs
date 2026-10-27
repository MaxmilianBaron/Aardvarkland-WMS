import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { auditI18nSources } from './i18n-source-audit.mjs';

const generatedPath = new URL('../src/core/i18n/translations.generated.ts', import.meta.url);
const helperPath = new URL('../src/core/i18n/i18n.ts', import.meta.url);

test('French, German, and Spanish catalog covers active fixed English UI copy', async () => {
  const [audit, generatedSource, helperSource] = await Promise.all([
    auditI18nSources(),
    readFile(generatedPath, 'utf8'),
    readFile(helperPath, 'utf8'),
  ]);
  const catalog = objectPropertyNames(generatedSource, 'generatedTranslations');
  const overrides = objectPropertyNames(helperSource, 'manualOverrides');
  const candidates = audit.englishValues
    .map((entry) => entry.value)
    .filter((value) => !value.startsWith('`'));
  const missing = candidates.filter((value) => !catalog.has(value) && !overrides.has(value));

  assert.deepEqual(missing, [], `Missing added-language translations: ${missing.join(' | ')}`);
});

test('generated translations contain three non-empty, marker-free values per row', async () => {
  const sourceText = await readFile(generatedPath, 'utf8');
  const source = ts.createSourceFile('translations.generated.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const object = findObject(source, 'generatedTranslations');
  assert.ok(object, 'generatedTranslations object was not found');
  assert.ok(object.properties.length >= 900, `Expected a broad catalog, received ${object.properties.length} rows`);

  for (const property of object.properties) {
    assert.ok(ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer));
    const languages = new Map(property.initializer.properties
      .filter(ts.isPropertyAssignment)
      .map((entry) => [propertyName(entry.name), ts.isStringLiteralLike(entry.initializer) ? entry.initializer.text.trim() : '']));
    assert.deepEqual([...languages.keys()].sort(), ['de', 'es', 'fr']);
    for (const value of languages.values()) {
      assert.ok(value.length > 0);
      assert.doesNotMatch(value, /\[WMS\d{4}\]/);
    }
  }
});

test('remaining language branches are limited to explicit base-language recursion', async () => {
  const audit = await auditI18nSources();
  assert.equal(audit.legacySelectors.length, 2);
  assert.ok(audit.legacySelectors.every((location) => location.startsWith('features/dashboard/') || location.startsWith('features/outbound/')));
});

function objectPropertyNames(sourceText, variableName) {
  const source = ts.createSourceFile(`${variableName}.ts`, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const object = findObject(source, variableName);
  assert.ok(object, `${variableName} object was not found`);
  return new Set(object.properties
    .filter(ts.isPropertyAssignment)
    .map((property) => propertyName(property.name))
    .filter(Boolean));
}

function findObject(source, variableName) {
  let result;
  visit(source);
  return result;

  function visit(node) {
    if (ts.isVariableDeclaration(node)
      && ts.isIdentifier(node.name)
      && node.name.text === variableName
      && node.initializer) {
      const initializer = unwrapExpression(node.initializer);
      if (!ts.isObjectLiteralExpression(initializer)) return;
      result = initializer;
      return;
    }
    ts.forEachChild(node, visit);
  }
}

function unwrapExpression(node) {
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node)) {
    return unwrapExpression(node.expression);
  }
  return node;
}

function propertyName(node) {
  return ts.isIdentifier(node) || ts.isStringLiteralLike(node) ? node.text : '';
}
