const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const storage = new Map();
function loadFrontend(file, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const parsed = ts.createSourceFile(file, source, 99, true);
  assert.equal(parsed.parseDiagnostics.length, 0, 'Invalid TypeScript in ' + file);
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require: name => dependencies[name], Map, Object,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { documentElement: {} }, window: { dispatchEvent() {} }, Event: class {},
  }, { filename: file });
  return exports;
}
const { translations } = loadFrontend('frontend/src/translations.ts');
const i18n = loadFrontend('frontend/src/i18n.ts', { './translations': { translations }, react: {} });
const placeholders = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('every translation has Polish and English text with unchanged placeholders and valid encoding', () => {
  for (const [key, values] of Object.entries(translations)) {
    assert.equal(values.length, 2, key);
    assert.doesNotMatch(key, /\uFFFD|[ыэёъЫЭЁЪ]|польский|Лимит|Заміна масла/);
    for (const value of values) {
      assert.ok(value.trim(), key);
      assert.doesNotMatch(value, /\uFFFD/, key);
      assert.deepEqual(placeholders(value), placeholders(key), key);
      if (key !== 'Українська') assert.doesNotMatch(value, /[А-Яа-яІіЇїЄєҐґ]/, key);
    }
  }
});

test('all static Ukrainian UI strings have complete translations', () => {
  const missing = new Set();
  function scan(dir) {
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      if (fs.statSync(full).isDirectory()) { scan(full); continue; }
      if (!/\.tsx?$/.test(file) || file === 'translations.ts') continue;
      const ast = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), 99, true);
      function visit(node) {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[А-Яа-яІіЇїЄєҐґ]/.test(node.text)) {
          if (!i18n.hasTranslation(node.text)) missing.add(`${full}: ${node.text}`);
        }
        if (ts.isJsxText(node) && /[А-Яа-яІіЇїЄєҐґ]/.test(node.text) && node.text.trim() !== 'Українська') missing.add(`${full}: untranslated JSX ${node.text.trim()}`);
        if (ts.isTemplateExpression(node) && /[А-Яа-яІіЇїЄєҐґ]/.test(node.head.text + node.templateSpans.map(span => span.literal.text).join(''))) missing.add(`${full}: untranslated template ${node.getText(ast)}`);
        ts.forEachChild(node, visit);
      }
      visit(ast);
    }
  }
  scan('frontend/src');
  assert.deepEqual([...missing], []);
});

test('language defaults to Ukrainian and only Ukrainian, Polish and English can be selected', () => {
  storage.clear();
  assert.equal(i18n.getUiLanguage(), 'uk');
  i18n.setUiLanguage('pl');
  assert.equal(i18n.t('Гараж'), 'Garaż');
  assert.equal(i18n.t('ПРОБІГ'), 'PRZEBIEG');
  assert.equal(i18n.t('{0} км', { 0: 123456 }), '123456 km');
  i18n.setUiLanguage('en');
  assert.equal(i18n.t('Гараж'), 'Garage');
  i18n.setUiLanguage('ru');
  assert.equal(i18n.getUiLanguage(), 'uk');
});
