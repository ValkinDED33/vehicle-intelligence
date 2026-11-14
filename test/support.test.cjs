require('reflect-metadata');
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const { drizzle } = require('drizzle-orm/pglite');
const { Module, ValidationPipe } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { JwtService } = require('@nestjs/jwt');
const { UuidRouteParamsPipe } = require('../dist/common/pipes/uuid-route-params.pipe');
const { SupportAccessService } = require('../dist/modules/support/support-access.service');
const { SupportAdminGuard } = require('../dist/modules/support/support-admin.guard');
const { SupportController, AdminSupportController } = require('../dist/modules/support/support.controller');
const { SupportService } = require('../dist/modules/support/support.service');
const { SupportNotificationStore, SupportNotificationWorker, SupportTelegramSender } = require('../dist/modules/support/support-notifications.service');

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';
const ADMIN2 = '44444444-4444-4444-8444-444444444444';
const CAR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CAR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const status = expected => error => error.getStatus?.() === expected;
const input = (changes = {}) => ({ subject: 'Report question', category: 'report', message: 'Private message text', ...changes });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };

describe('support with isolated PostgreSQL, real JWT HTTP and fake Telegram', () => {
  let pg, db, values, config, access, service, store, sender, wakes;
  const jobs = async () => (await pg.query('SELECT * FROM support_notification_outbox ORDER BY created_at,id')).rows;
  const fakeSender = (send, recipients = ['3001']) => ({ isConfigured: async () => true, recipients: async () => recipients, send });
  const instance = () => new SupportService(db, access, { wake: () => { wakes++; } });

  before(async () => {
    pg = new PGlite();
    for (const migration of JSON.parse(fs.readFileSync('drizzle/meta/_journal.json')).entries) {
      await pg.exec(fs.readFileSync(`drizzle/${migration.tag}.sql`, 'utf8'));
    }
    for (const [id, name] of [[OWNER, 'owner'], [OTHER, 'other'], [ADMIN, 'admin'], [ADMIN2, 'admin2']]) {
      await pg.query('INSERT INTO users(id,email,password_hash,display_name) VALUES($1,$2,$3,$4)', [id, `${name}@fixture.test`, 'fixture-only', name]);
    }
    await pg.query('INSERT INTO vehicles(id,owner_id,vin) VALUES($1,$2,$3),($4,$5,$3)', [CAR, OWNER, 'WVWZZZ1KZ7B071116', OTHER_CAR, OTHER]);
    db = { connection: drizzle(pg) };
    config = { get: key => values[key] };
    access = new SupportAccessService(config, db);
    sender = new SupportTelegramSender(config, access);
    store = new SupportNotificationStore(db);
    service = instance();
  });
  beforeEach(async () => {
    await pg.exec('TRUNCATE support_tickets CASCADE');
    await pg.query('UPDATE users SET telegram_id=NULL');
    await pg.query('UPDATE users SET telegram_id=$1 WHERE id=$2', ['3001', ADMIN]);
    await pg.query('UPDATE users SET telegram_id=$1 WHERE id=$2', ['4001', ADMIN2]);
    values = { SUPPORT_ADMIN_USER_IDS: ADMIN, SUPPORT_NOTIFICATIONS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'support-fixture-not-a-real-token' };
    wakes = 0;
  });
  after(async () => { await pg?.close(); });

  test('allowlist is explicit, trimmed UUID-only, case-insensitive and fails closed', async () => {
    assert.deepEqual(await access.access(OWNER), { isAdmin: false, notificationsConfigured: true });
    for (const value of ['', ' , ', 'admin@fixture.test', '*', 'true', 'undefined']) {
      values.SUPPORT_ADMIN_USER_IDS = value;
      assert.equal((await access.access(ADMIN)).isAdmin, false);
      assert.equal((await access.access(ADMIN)).notificationsConfigured, false);
      for (const operation of [() => service.adminList(ADMIN), () => service.adminGet(ADMIN, MISSING),
        () => service.adminReply(ADMIN, MISSING, { message: 'hello' }), () => service.adminStatus(ADMIN, MISSING, { status: 'resolved' })]) {
        await assert.rejects(operation, status(403));
      }
    }
    values.SUPPORT_ADMIN_USER_IDS = `invalid, ${ADMIN.toUpperCase()},${ADMIN}, ${ADMIN2}`;
    assert.equal((await access.access(ADMIN)).isAdmin, true);
    assert.deepEqual(new Set(await access.recipients()), new Set(['3001', '4001']));
    await assert.rejects(() => access.access('admin@fixture.test'), status(401));
  });

  test('notification availability requires opt-in, token and override or linked allowlisted recipient', async () => {
    for (const flag of [undefined, '', 'false', 'TRUE']) {
      values.SUPPORT_NOTIFICATIONS_ENABLED = flag;
      assert.equal((await access.access(ADMIN)).notificationsConfigured, false);
    }
    values.SUPPORT_NOTIFICATIONS_ENABLED = 'true';
    values.TELEGRAM_BOT_TOKEN = '';
    assert.equal((await access.access(ADMIN)).notificationsConfigured, false);
    values.TELEGRAM_BOT_TOKEN = 'fixture';
    await pg.query('UPDATE users SET telegram_id=NULL WHERE id=$1', [ADMIN]);
    assert.equal((await access.access(ADMIN)).notificationsConfigured, false);
    values.SUPPORT_TELEGRAM_CHAT_ID = ' -100123 ';
    assert.deepEqual(await access.recipients(), ['-100123']);
    assert.deepEqual(await access.access(ADMIN), { isAdmin: true, notificationsConfigured: true });
    assert.doesNotMatch(JSON.stringify(await access.access(ADMIN)), /100123|3001|fixture/);
  });

  test('create saves ticket, first message and outbox atomically, then wakes worker', async () => {
    const result = await service.create(OWNER, input({ vehicleId: CAR, subject: '  A report  ', message: '  A private question  ' }));
    assert.equal(result.ticket.subject, 'A report');
    assert.equal(result.ticket.status, 'open');
    assert.equal(result.ticket.vehicleId, CAR);
    assert.deepEqual(result.messages.map(({ body, authorRole }) => ({ body, authorRole })), [{ body: 'A private question', authorRole: 'user' }]);
    assert.equal(result.ticket.owner, undefined);
    assert.equal(result.ticket.ownerId, undefined);
    assert.equal(result.ticket.notification, undefined);
    assert.equal(result.messages[0].authorId, undefined);
    assert.equal((await jobs())[0].event, 'new_ticket');
    assert.equal((await jobs())[0].status, 'pending');
    assert.equal(wakes, 1);
    assert.equal((await instance().get(OWNER, result.ticket.id)).messages.length, 1);
  });

  test('foreign vehicle, foreign ticket and missing ids are indistinguishable from absent records', async () => {
    await assert.rejects(() => service.create(OWNER, input({ vehicleId: OTHER_CAR })), status(404));
    await assert.rejects(() => service.create(OWNER, input({ vehicleId: MISSING })), status(404));
    const { ticket } = await service.create(OWNER, input());
    for (const id of [ticket.id, MISSING]) {
      await assert.rejects(() => service.get(OTHER, id), status(404));
      await assert.rejects(() => service.reply(OTHER, id, { message: 'foreign' }), status(404));
    }
    await assert.rejects(() => service.get(ADMIN, ticket.id), status(404));
    assert.equal((await service.list(OTHER)).total, 0);
    assert.equal((await service.list(ADMIN)).total, 0);
    assert.equal((await service.adminGet(ADMIN, ticket.id)).messages.length, 1);
    assert.equal((await jobs()).length, 1);
  });

  test('validation rejects whitespace, bounds, invalid UUIDs, enums and spoofed fields for direct callers', async () => {
    for (const change of [{ subject: '   ' }, { subject: 'x'.repeat(161) }, { message: '\n\t' }, { message: 'x'.repeat(10001) },
      { category: 'admin' }, { category: null }, { vehicleId: 'bad' }, { ownerId: OTHER }, { role: 'admin' }, { status: 'resolved' }]) {
      await assert.rejects(() => service.create(OWNER, input(change)), status(400));
    }
    await assert.rejects(() => service.create(OWNER, null), status(400));
    const { ticket } = await service.create(OWNER, input());
    for (const data of [{ message: '' }, { message: 'a', authorRole: 'admin' }, { body: 'wrong field' }, { message: 'a', userId: ADMIN }]) {
      await assert.rejects(() => service.reply(OWNER, ticket.id, data), status(400));
    }
    for (const query of [{ page: 0 }, { pageSize: 51 }, { page: 1.5 }, { status: 'closed' }, { category: 'wrong' }, { q: 'x'.repeat(161) }, { ownerId: OTHER }]) {
      await assert.rejects(() => service.list(OWNER, query), status(400));
    }
    await assert.rejects(() => service.get(OWNER, 'not-a-uuid'), status(400));
    await assert.rejects(() => service.adminStatus(ADMIN, ticket.id, { status: 'closed' }), status(400));
    assert.equal((await service.get(OWNER, ticket.id)).messages.length, 1);
  });

  test('failed outbox insert rolls back create and reply including status; wake happens only after commit', async () => {
    const { ticket } = await service.create(OWNER, input());
    await service.adminStatus(ADMIN, ticket.id, { status: 'resolved' });
    const before = await service.get(OWNER, ticket.id);
    await pg.exec(`CREATE FUNCTION support_fixture_reject_outbox() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'fixture outbox unavailable'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER support_fixture_reject_outbox BEFORE INSERT ON support_notification_outbox
      FOR EACH ROW EXECUTE FUNCTION support_fixture_reject_outbox();`);
    try {
      await assert.rejects(() => service.create(OWNER, input({ subject: 'Must roll back' })));
      await assert.rejects(() => service.reply(OWNER, ticket.id, { message: 'Must roll back' }));
      assert.equal((await service.list(OWNER)).total, 1);
      assert.deepEqual(await service.get(OWNER, ticket.id), before);
      assert.equal((await jobs()).length, 1);
      assert.equal(wakes, 1);
    } finally {
      await pg.exec('DROP TRIGGER support_fixture_reject_outbox ON support_notification_outbox; DROP FUNCTION support_fixture_reject_outbox()');
    }
  });

  test('admin replies mark open in progress; user reply reopens resolved; status changes add no messages', async () => {
    const { ticket } = await service.create(OWNER, input());
    const answered = await service.adminReply(ADMIN, ticket.id, { message: 'Support response' });
    assert.equal(answered.ticket.status, 'in_progress');
    assert.equal(answered.messages.at(-1).authorRole, 'admin');
    assert.equal(answered.ticket.owner.email, 'owner@fixture.test');
    assert.equal((await jobs()).length, 1);
    const resolved = await service.adminStatus(ADMIN, ticket.id, { status: 'resolved' });
    assert.equal(resolved.messages.length, 2);
    const reopened = await service.reply(OWNER, ticket.id, { message: 'Additional question' });
    assert.equal(reopened.ticket.status, 'open');
    assert.deepEqual(reopened.messages.map(row => row.authorRole), ['user', 'admin', 'user']);
    assert.equal((await jobs()).length, 2);
    assert.equal((await jobs()).at(-1).event, 'new_reply');
    assert.equal(wakes, 2);
    assert.ok(reopened.ticket.updatedAt > ticket.updatedAt);
    assert.equal((await service.get(OWNER, ticket.id)).messages.length, 3);
    const current = await service.adminGet(ADMIN, ticket.id);
    assert.equal(current.ticket.notification.status, 'pending');
    assert.equal(current.ticket.notification.attempts, 0);
    assert.equal(Object.hasOwn(reopened.ticket, 'notification'), false);
  });

  test('lists are scoped, filtered, stable, paginated; search is case-insensitive literal subject only', async () => {
    const first = await service.create(OWNER, input({ subject: 'Report 100%_ checked' }));
    await service.create(OWNER, input({ subject: 'Technical question', category: 'technical' }));
    await service.create(OTHER, input({ subject: 'Foreign report' }));
    await service.adminStatus(ADMIN, first.ticket.id, { status: 'resolved' });
    const page = await service.list(OWNER, { page: '1', pageSize: '1' });
    assert.equal(page.total, 2);
    assert.equal(page.page, 1);
    assert.equal(page.pageSize, 1);
    assert.equal(page.tickets[0].id, first.ticket.id);
    assert.equal(page.tickets[0].owner, undefined);
    assert.equal(page.tickets[0].notification, undefined);
    assert.equal((await service.list(OWNER, { page: 2, pageSize: 1 })).tickets.length, 1);
    assert.equal((await service.list(OWNER, { page: 3, pageSize: 1 })).tickets.length, 0);
    assert.equal((await service.list(OWNER, { q: 'rEpOrT', status: 'resolved', category: 'report' })).total, 1);
    assert.equal((await service.list(OWNER, { q: '%_' })).total, 1);
    assert.equal((await service.list(OWNER, { q: 'Private message text' })).total, 0);
    const all = await service.adminList(ADMIN);
    assert.equal(all.total, 3);
    assert.ok(all.tickets.every(row => row.owner?.email));
    assert.equal((await service.adminList(ADMIN, { ownerId: OTHER, q: 'report' })).total, 1);
  });

  test('disabled or unavailable notifications never lose a saved request or consume attempts', async () => {
    const original = global.fetch;
    global.fetch = async () => { throw new Error('Unexpected network call'); };
    try {
      for (const change of [{ SUPPORT_NOTIFICATIONS_ENABLED: 'false' }, { TELEGRAM_BOT_TOKEN: '' }, { SUPPORT_ADMIN_USER_IDS: '' }]) {
        const saved = { ...values };
        Object.assign(values, change);
        const { ticket } = await service.create(OWNER, input());
        assert.deepEqual(await new SupportNotificationWorker(store, sender).drain(), { processed: 0 });
        assert.equal((await service.get(OWNER, ticket.id)).messages.length, 1);
        values = saved;
      }
      assert.ok((await jobs()).every(row => row.status === 'pending' && row.attempts === 0));
    } finally { global.fetch = original; }
  });

  test('Telegram payload is generic with safe HTTPS ticket deep link, never subject, message, owner or vehicle', async () => {
    const { ticket } = await service.create(OWNER, input({ vehicleId: CAR, subject: 'PRIVATE-SUBJECT', message: 'PRIVATE-MESSAGE' }));
    const original = global.fetch;
    const requests = [];
    global.fetch = async (url, init) => {
      assert.equal(url, 'https://api.telegram.org/botsupport-fixture-not-a-real-token/sendMessage');
      assert.equal(init.redirect, 'error');
      const payload = JSON.parse(init.body);
      requests.push(payload);
      assert.equal(payload.chat_id, '3001');
      assert.doesNotMatch(init.body, /PRIVATE|fixture\.test|WVWZZZ|aaaaaaaa|11111111|33333333/);
      assert.equal(payload.parse_mode, undefined);
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    };
    try {
      for (const url of ['javascript:alert(1)', 'http://unsafe.test', 'https://user:password@unsafe.test', 'bad']) {
        values.TELEGRAM_WEB_APP_URL = url;
        assert.equal((await sender.send({ ticketId: ticket.id, event: 'new_ticket' }, '3001')).kind, 'sent');
        assert.ok(requests.at(-1).text.endsWith(`https://vehicle-intelligence-nu.vercel.app/?supportTicket=${ticket.id}`));
      }
      values.TELEGRAM_WEB_APP_URL = 'https://app.fixture.test/?secret=removed#discard';
      await sender.send({ ticketId: ticket.id, event: 'new_reply' }, '3001');
      assert.ok(requests.at(-1).text.endsWith(`https://app.fixture.test/?supportTicket=${ticket.id}`));
      assert.match(requests.at(-1).text, /new reply/);
    } finally { global.fetch = original; }
  });

  test('Telegram rate limits, 5xx, invalid JSON and transport errors become sanitized bounded retries', async () => {
    const original = global.fetch;
    const job = { ticketId: MISSING, event: 'new_ticket' };
    try {
      global.fetch = async () => new Response(JSON.stringify({ ok: false, error_code: 429, description: 'PRIVATE', parameters: { retry_after: 999999 } }), { status: 429 });
      assert.deepEqual(await sender.send(job, '3001'), { kind: 'retry', code: 'rate_limited', retryAfterSeconds: 3600 });
      global.fetch = async () => new Response(JSON.stringify({ ok: false, error_code: 503, description: 'PRIVATE' }), { status: 503 });
      assert.deepEqual(await sender.send(job, '3001'), { kind: 'retry', code: 'telegram_unavailable' });
      global.fetch = async () => { throw new Error('PRIVATE token request headers'); };
      assert.deepEqual(await sender.send(job, '3001'), { kind: 'retry', code: 'transport_failure' });
      global.fetch = async () => new Response('PRIVATE bad response');
      assert.deepEqual(await sender.send(job, '3001'), { kind: 'retry', code: 'transport_failure' });
      global.fetch = async () => new Response(JSON.stringify({ ok: false, error_code: 403, description: 'PRIVATE' }), { status: 403 });
      assert.deepEqual(await sender.send(job, '3001'), { kind: 'failed', code: 'telegram_rejected' });
    } finally { global.fetch = original; }
  });

  test('a network failure retries after backoff, survives recreation and exposes safe admin-only delivery state', async () => {
    const { ticket } = await service.create(OWNER, input());
    let calls = 0;
    const failing = new SupportNotificationWorker(store, fakeSender(async () => { calls++; throw new Error('PRIVATE token'); }));
    await failing.drain();
    await failing.drain();
    assert.equal(calls, 1);
    const [job] = await jobs();
    assert.equal(job.status, 'pending');
    assert.equal(job.attempts, 1);
    assert.equal(job.last_error, 'transport_failure');
    assert.ok(new Date(job.next_attempt_at) > new Date());
    const admin = (await service.adminGet(ADMIN, ticket.id)).ticket.notification;
    assert.equal(admin.lastError, 'transport_failure');
    assert.ok(admin.nextAttemptAt instanceof Date);
    assert.doesNotMatch(JSON.stringify(admin), /PRIVATE|3001|sentTo|lockToken/);
    assert.equal((await service.get(OWNER, ticket.id)).ticket.notification, undefined);
    await pg.exec("UPDATE support_notification_outbox SET next_attempt_at=now()-interval '1 second'");
    await new SupportNotificationWorker(new SupportNotificationStore(db), fakeSender(async () => { calls++; return { kind: 'sent' }; })).drain();
    assert.equal(calls, 2);
    assert.equal((await jobs())[0].status, 'sent');
    assert.equal((await service.adminGet(ADMIN, ticket.id)).ticket.notification.nextAttemptAt, null);
  });

  test('partial multi-admin success is recorded and never resent on a normal retry', async () => {
    await service.create(OWNER, input());
    const calls = [];
    let fail = true;
    const multi = fakeSender(async (_job, chat) => {
      calls.push(chat);
      return chat === '4001' && fail ? { kind: 'retry', code: 'telegram_unavailable' } : { kind: 'sent' };
    }, ['3001', '4001']);
    await new SupportNotificationWorker(store, multi).drain();
    assert.equal((await jobs())[0].status, 'pending');
    assert.deepEqual((await jobs())[0].sent_to, ['3001']);
    fail = false;
    await pg.exec("UPDATE support_notification_outbox SET next_attempt_at=now()-interval '1 second'");
    await new SupportNotificationWorker(new SupportNotificationStore(db), multi).drain();
    assert.deepEqual(calls, ['3001', '4001', '4001']);
    assert.equal((await jobs())[0].status, 'sent');
  });

  test('lease claims exclude competitors, expired claims recover and stale workers cannot finish', async () => {
    await service.create(OWNER, input());
    const now = new Date(Date.now() + 1000);
    const first = await store.claim(now);
    assert.ok(first);
    assert.equal(await new SupportNotificationStore(db).claim(now), null);
    const later = new Date(now.getTime() + 61_000);
    assert.equal(await store.finish(first, { kind: 'sent' }, later), false);
    assert.equal(await store.recordRecipient(first, '3001', later), false);
    const recovered = await new SupportNotificationStore(db).claim(later);
    assert.equal(recovered.attempts, 2);
    assert.notEqual(recovered.lockToken, first.lockToken);
    assert.equal(await store.finish(first, { kind: 'sent' }, later), false);
    assert.equal(await store.finish(recovered, { kind: 'sent' }, later), true);
    assert.equal(await store.claim(later), null);
  });

  test('retry and abandoned-send attempts stop at five and failed state is visible to admins', async () => {
    const { ticket } = await service.create(OWNER, input());
    let calls = 0;
    const worker = new SupportNotificationWorker(store, fakeSender(async () => { calls++; return { kind: 'retry', code: 'telegram_unavailable' }; }));
    for (let attempt = 1; attempt <= 5; attempt++) {
      await pg.exec("UPDATE support_notification_outbox SET next_attempt_at=now()-interval '1 second'");
      await worker.drain();
      assert.equal((await jobs())[0].attempts, attempt);
    }
    await worker.drain();
    assert.equal(calls, 5);
    assert.equal((await jobs())[0].status, 'failed');
    assert.equal((await service.adminGet(ADMIN, ticket.id)).ticket.notification.status, 'failed');
    await pg.exec("UPDATE support_notification_outbox SET status='sending',lease_until=now()-interval '1 second'");
    assert.equal(await store.claim(), null);
    assert.equal((await jobs())[0].last_error, 'retry_exhausted');
  });

  test('worker bounds each drain, shares one active drain and wakes after committed create/reply', async () => {
    for (let n = 0; n < 12; n++) await service.create(OWNER, input());
    let calls = 0;
    const worker = new SupportNotificationWorker(store, fakeSender(async () => { calls++; return { kind: 'sent' }; }));
    await Promise.all([worker.drain(), worker.drain()]);
    assert.equal(calls, 10);
    assert.equal((await jobs()).filter(row => row.status === 'sent').length, 10);
    await worker.drain();
    assert.equal(calls, 12);
    const entered = deferred();
    const immediate = new SupportNotificationWorker(store, fakeSender(async () => { entered.resolve(); return { kind: 'sent' }; }));
    const live = new SupportService(db, access, immediate);
    const created = await live.create(OWNER, input());
    await entered.promise;
    await immediate.drain();
    await live.reply(OWNER, created.ticket.id, { message: 'New question' });
    await immediate.drain();
    await immediate.onModuleDestroy();
    assert.equal((await jobs()).filter(row => row.status === 'sent').length, 14);
  });

  test('real JWT endpoints derive identity only from verified sub; enforce admin, ownership and validation', async () => {
    const jwt = new JwtService({ secret: 'support-fixture-only' });
    class App {}
    Module({ controllers: [SupportController, AdminSupportController], providers: [
      { provide: SupportService, useValue: service }, { provide: SupportAccessService, useValue: access },
      SupportAdminGuard, { provide: JwtService, useValue: jwt },
    ] })(App);
    const app = await NestFactory.create(App, { logger: false });
    app.useGlobalPipes(new UuidRouteParamsPipe(), new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    try {
      const base = await app.getUrl();
      const headers = id => ({ Authorization: `Bearer ${jwt.sign({ sub: id, email: 'admin@fixture.test', role: 'admin', isAdmin: true })}`, 'Content-Type': 'application/json' });
      const request = (path, id, method = 'GET', body) => fetch(base + path, { method, headers: id ? headers(id) : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
      for (const [path, method] of [['/support/access', 'GET'], ['/support/tickets', 'GET'], ['/support/tickets', 'POST'],
        [`/support/tickets/${MISSING}`, 'GET'], [`/support/tickets/${MISSING}/messages`, 'POST'],
        ['/admin/support/tickets', 'GET'], [`/admin/support/tickets/${MISSING}`, 'GET'],
        [`/admin/support/tickets/${MISSING}/messages`, 'POST'], [`/admin/support/tickets/${MISSING}/status`, 'PATCH']]) {
        assert.equal((await request(path, undefined, method)).status, 401);
      }
      assert.equal((await request('/support/access', OWNER)).status, 200);
      assert.equal((await request('/admin/support/tickets', OWNER)).status, 403);
      assert.equal((await request('/support/tickets', OWNER, 'POST', input({ ownerId: OTHER }))).status, 400);
      assert.equal((await request('/support/tickets', OWNER, 'POST', input({ vehicleId: OTHER_CAR }))).status, 404);
      const response = await request('/support/tickets', OWNER, 'POST', input({ vehicleId: CAR }));
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const detail = await response.json();
      assert.equal(typeof detail.ticket.createdAt, 'string');
      const path = `/support/tickets/${detail.ticket.id}`;
      assert.equal((await request(path, OTHER)).status, 404);
      assert.equal((await request(path + '/messages', OTHER, 'POST', { message: 'foreign' })).status, 404);
      assert.equal((await request(path + '/messages', OWNER, 'POST', { message: 'hi', authorRole: 'admin' })).status, 400);
      assert.equal((await request(path + '/messages', OWNER, 'POST', { body: 'wrong field' })).status, 400);
      const reply = await request(path + '/messages', OWNER, 'POST', { message: 'User followup' });
      assert.equal(reply.status, 201);
      assert.equal((await reply.json()).messages.at(-1).body, 'User followup');
      assert.equal((await request('/support/tickets?pageSize=51', OWNER)).status, 400);
      assert.equal((await request('/support/tickets?ownerId=' + OTHER, OWNER)).status, 400);
      assert.equal((await request('/support/tickets/bad', OWNER)).status, 400);
      const adminPath = `/admin/support/tickets/${detail.ticket.id}`;
      assert.equal((await request(adminPath, OWNER)).status, 403);
      assert.equal((await request(adminPath, ADMIN)).status, 200);
      assert.equal((await request(adminPath + '/messages', ADMIN, 'POST', { message: 'Admin response' })).status, 201);
      const resolved = await request(adminPath + '/status', ADMIN, 'PATCH', { status: 'resolved' });
      assert.equal(resolved.status, 200);
      assert.equal((await resolved.json()).ticket.status, 'resolved');
      assert.equal((await request(adminPath + '/status', OWNER, 'PATCH', { status: 'resolved' })).status, 403);
      values.SUPPORT_ADMIN_USER_IDS = '';
      assert.equal((await request('/admin/support/tickets', ADMIN)).status, 403);
      assert.equal((await (await request('/support/access', ADMIN)).json()).isAdmin, false);
      assert.equal((await request('/support/register-admin', OWNER, 'POST', { role: 'admin' })).status, 404);
    } finally { await app.close(); }
  });
});
