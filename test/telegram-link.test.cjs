require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { IdentityDbService } = require('../dist/modules/identity/identity.db.service');
const { AuthController } = require('../dist/modules/identity/controllers/auth.controller');
const { AuthService } = require('../dist/modules/identity/services/auth.service');

const TOKEN = 'a'.repeat(32);
const TARGET = '11111111-1111-4111-8111-111111111111';
const PREVIOUS = '22222222-2222-4222-8222-222222222222';

function fixture({ current, targetTelegramId = null, expired = false, hasCars = false } = {}) {
  let tokenRow = { tokenHash: createHash('sha256').update(TOKEN).digest('hex'), userId: TARGET, expiresAt: new Date(Date.now() + (expired ? -1 : 600000)) };
  const writes = [];
  let selectIndex = 0;
  const target = { id: TARGET, telegramId: targetTelegramId, email: 'owner@example.test', displayName: 'Website owner' };
  const select = () => {
    const rows = () => {
      switch (selectIndex++) {
        case 0: return tokenRow ? [tokenRow] : [];
        case 1: return [target];
        case 2: return current ? [current] : [];
        default: return hasCars ? [{ id: 'car' }] : [];
      }
    };
    return { from: () => ({ where: () => ({ for: async () => rows(), limit: async () => rows() }) }) };
  };
  const tx = {
    execute: async () => {}, select,
    update: () => ({ set: data => ({ where: () => {
      writes.push(data); const result = Promise.resolve();
      result.returning = async () => [{ ...target, ...data }]; return result;
    } }) }),
    delete: () => ({ where: async () => { tokenRow = null; } }),
  };
  const db = { connection: {
    transaction: async fn => { selectIndex = 0; return fn(tx); },
    insert: () => ({ values: data => ({ onConflictDoUpdate: async () => { tokenRow = data; } }) }),
  } };
  return { service: new IdentityDbService(db), writes, row: () => tokenRow };
}

test('link creation returns a short-lived token and stores only its hash', async () => {
  const f = fixture(); const result = await f.service.createTelegramLink(TARGET);
  assert.match(result.token, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(f.row().tokenHash, createHash('sha256').update(result.token).digest('hex'));
  assert.equal(f.row().token, undefined); assert.ok(result.expiresAt.getTime() > Date.now());
  assert.ok(result.expiresAt.getTime() <= Date.now() + 600000);
});
test('linking selects the website user, preserves its name, and consumes the token once', async () => {
  const f = fixture(); const result = await f.service.consumeTelegramLink(TOKEN, '12345', 'tester');
  assert.equal(result.id, TARGET); assert.equal(result.displayName, 'Website owner');
  assert.equal(result.telegramId, '12345'); assert.equal(f.row(), null);
  await assert.rejects(f.service.consumeTelegramLink(TOKEN, '12345', 'tester'));
});
test('expired links cannot bind an account', async () => {
  const f = fixture({ expired: true });
  await assert.rejects(f.service.consumeTelegramLink(TOKEN, '12345'));
  assert.equal(f.writes.length, 0);
});
test('an empty auto-created Telegram account can be connected to the website account', async () => {
  const f = fixture({ current: { id: PREVIOUS, email: 'telegram_12345@telegram.local' } });
  await f.service.consumeTelegramLink(TOKEN, '12345');
  assert.equal(f.writes[0].telegramId, null); assert.equal(f.writes[1].telegramId, '12345');
});
test('linking refuses to overwrite another Telegram identity or an account with cars', async () => {
  for (const options of [
    { targetTelegramId: 'other-user' },
    { current: { id: PREVIOUS, email: 'other@example.test' } },
    { current: { id: PREVIOUS, email: 'telegram_12345@telegram.local' }, hasCars: true },
  ]) {
    const f = fixture(options); await assert.rejects(f.service.consumeTelegramLink(TOKEN, '12345'));
    assert.equal(f.writes.length, 0);
  }
});
test('link endpoint uses the authenticated website user id', async () => {
  let requested;
  const controller = new AuthController({ createTelegramLink: async userId => { requested = userId; return {}; } });
  await controller.telegramLink({ userId: TARGET }); assert.equal(requested, TARGET);
});

test('profile refresh returns current language and Telegram status without private identity fields', async () => {
  const user = { id: TARGET, email: 'owner@example.test', displayName: 'Website owner', country: 'PL', language: 'pl', telegramId: '12345', telegramUsername: 'owner', passwordHash: 'private', telegramPhotoUrl: 'private-photo' };
  const auth = new AuthService({ findById: async id => { assert.equal(id, TARGET); return user; } });
  const controller = new AuthController(auth);
  const result = await controller.getMe({ userId: TARGET });
  assert.equal(result.language, 'pl');
  assert.equal(result.telegramLinked, true);
  assert.equal(result.telegramUsername, 'owner');
  assert.equal(result.passwordHash, undefined);
  assert.equal(result.telegramId, undefined);
  assert.equal(result.telegramPhotoUrl, undefined);
});

test('profile refresh rejects an account that no longer exists', async () => {
  const auth = new AuthService({ findById: async () => null });
  await assert.rejects(auth.getProfile(TARGET), { status: 404 });
});
