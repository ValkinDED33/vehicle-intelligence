const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const frontendRequire = createRequire(resolve('frontend/package.json'));
const React = frontendRequire('react');
const { renderToStaticMarkup } = frontendRequire('react-dom/server');
const ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    transformers: { before: [context => root => ts.visitNode(root, function visit(node) {
      if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) return ts.factory.createIdentifier('fixtureMeta');
      return ts.visitEachChild(node, visit, context);
    })] },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => dependencies[name], ...globals }, { filename: file });
  return exports;
}

function client(fetch, globals = {}) {
  return load('frontend/src/api.ts', { './i18n': { t: value => value, hasTranslation: () => false } }, {
    fixtureMeta: { env: {} }, URLSearchParams, fetch,
    localStorage: { getItem: () => 'fixture-token', removeItem: () => {} },
    window: { location: { hostname: 'localhost' }, dispatchEvent: () => {} }, ...globals,
  });
}

test('support browser client uses exact authenticated user/admin contracts and preserves server detail', async () => {
  const requests = [];
  const expected = { ticket: { id: ID, status: 'open' }, messages: [] };
  const { supportApi } = client(async (path, init) => {
    requests.push({ path, ...init });
    return new Response(JSON.stringify(expected), { status: 200 });
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await supportApi.create({ subject: 'Fuel discrepancy', category: 'report', message: 'Owner diesel; report petrol' }))), expected);
  await supportApi.reply(false, ID, 'User follow-up');
  await supportApi.reply(true, ID, 'Support response');
  await supportApi.status(ID, 'resolved');
  await supportApi.detail(false, ID);
  await supportApi.detail(true, ID);
  await supportApi.access();
  assert.deepEqual(requests.map(request => request.path), [
    '/support/tickets', `/support/tickets/${ID}/messages`, `/admin/support/tickets/${ID}/messages`,
    `/admin/support/tickets/${ID}/status`, `/support/tickets/${ID}`, `/admin/support/tickets/${ID}`, '/support/access',
  ]);
  assert.deepEqual(JSON.parse(requests[1].body), { message: 'User follow-up' });
  assert.deepEqual(JSON.parse(requests[2].body), { message: 'Support response' });
  assert.deepEqual(JSON.parse(requests[3].body), { status: 'resolved' });
  assert.ok(requests.every(request => request.headers.Authorization === 'Bearer fixture-token'));
});

test('support search encodes literal user input and sends pagination/status to the correct list', async () => {
  const requests = [];
  const { supportApi } = client(async path => { requests.push(path); return new Response('{}'); });
  await supportApi.list(true, { q: 'VIN & fuel?', status: 'open', page: 3 });
  const url = new URL(requests[0], 'http://localhost');
  assert.equal(url.pathname, '/admin/support/tickets');
  assert.equal(url.searchParams.get('q'), 'VIN & fuel?');
  assert.equal(url.searchParams.get('page'), '3');
  assert.equal(url.searchParams.get('pageSize'), '20');
  assert.equal(url.searchParams.get('status'), 'open');
  await supportApi.list(false, {});
  assert.equal(new URL(requests[1], 'http://localhost').pathname, '/support/tickets');
});

test('denying support admin access does not log the user out or discard their session', async () => {
  let removals = 0;
  const { supportApi } = client(async () => new Response('{}', { status: 403 }), {
    localStorage: { getItem: () => 'fixture-token', removeItem: () => { removals++; } },
  });
  await assert.rejects(supportApi.list(true, {}), error => error.status === 403);
  assert.equal(removals, 0);
});

function ui(language = 'uk', search = '') {
  const translations = load('frontend/src/translations.ts');
  const i18n = load('frontend/src/i18n.ts', { './translations': translations, react: React }, { localStorage: { getItem: () => language } });
  return load('frontend/src/pages/SupportPage.tsx', {
    react: React, 'react/jsx-runtime': frontendRequire('react/jsx-runtime'), 'lucide-react': frontendRequire('lucide-react'),
    '../api': {}, '../i18n': i18n, '../utils/formatters': {},
    '../components/CommonComponents': { Spinner: () => React.createElement('span', null, 'Loading fixture') },
  }, { window: { location: { search } }, URLSearchParams });
}

test('support deep links accept only ticket UUIDs and never use raw URL content as an API path', () => {
  assert.equal(ui('uk', '?supportTicket=' + ID).supportTicketFromUrl(), ID);
  for (const value of ['../../admin', 'javascript:alert(1)', 'not-an-id', '']) {
    assert.equal(ui('uk', '?supportTicket=' + encodeURIComponent(value)).supportTicketFromUrl(), null);
  }
});

test('opening a ticket shows a loading state, not a false failure before the first fetch', () => {
  const { SupportPage } = ui('en', '?supportTicket=' + ID);
  const html = renderToStaticMarkup(React.createElement(SupportPage, { vehicles: [], vehicleId: null, notificationsConfigured: false }));
  assert.match(html, /Loading fixture/);
  assert.doesNotMatch(html, /Could not load ticket|Не вдалося завантажити/);
});

test('the support/admin entry screens render their actual language, with no untranslated Ukrainian in Polish or English', () => {
  for (const [language, title] of [['uk', 'Адмін-панель'], ['pl', 'Panel administratora'], ['en', 'Admin panel']]) {
    const { SupportPage } = ui(language);
    const html = renderToStaticMarkup(React.createElement(SupportPage, { admin: true, vehicles: [], vehicleId: null, notificationsConfigured: false }));
    assert.ok(html.includes(title));
    if (language !== 'uk') assert.doesNotMatch(html, /[А-Яа-яІіЇїЄєҐґ]/);
  }
});

test('local support and admin URLs are proxied to backend instead of returning the SPA document', () => {
  const config = load('frontend/vite.config.ts', { vite: { defineConfig: value => value } }, { process: { env: { VITE_PROXY_TARGET: 'http://127.0.0.1:3211' } } }).default;
  for (const path of ['/support', '/admin']) assert.equal(config.server.proxy[path].target, 'http://127.0.0.1:3211');
});
