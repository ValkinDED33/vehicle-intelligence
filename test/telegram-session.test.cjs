require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TelegramSessionService } = require('../dist/modules/telegram/telegram-session.service');
const USER = '33333333-3333-4333-8333-333333333333';

function database({ loseLease = false, checkpointOffline = false } = {}) {
  let row;
  const update = () => ({ set: values => ({ where: () => {
    const save = () => { row = { ...row, ...structuredClone(values) }; };
    return {
      returning: async () => {
        if (checkpointOffline) throw new Error('database unavailable');
        if (loseLease) return [];
        save(); return [{ userId: USER }];
      },
      then: (resolve, reject) => { save(); return Promise.resolve([]).then(resolve, reject); },
    };
  } }) });
  const tx = {
    update,
    insert: () => ({ values: values => ({ onConflictDoNothing: async () => { if (!row) row = structuredClone(values); } }) }),
    select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [structuredClone(row)] }) }) }) }),
  };
  return { connection: { update, transaction: fn => fn(tx) }, row: () => row };
}

test('a durable checkpoint prevents a delivered action from repeating after a process failure', async () => {
  const db = database();
  let effects = 0;
  await assert.rejects(new TelegramSessionService(db).run(USER, 101, async (state, checkpoint) => {
    state.lastEffect = { id: 'confirmation', operation: 'expense', status: 'started', at: Date.now() };
    await checkpoint();
    effects++;
    throw new Error('process stopped after the domain write');
  }));
  await new TelegramSessionService(db).run(USER, 101, async () => { effects++; });
  assert.equal(effects, 1);
  assert.equal(db.row().state.lastEffect.status, 'started');
  assert.ok(db.row().state.processedUpdates.includes(101));
});

test('no side effect starts when a checkpoint cannot be saved or its lease is lost', async () => {
  for (const options of [{ loseLease: true }, { checkpointOffline: true }]) {
    const db = database(options);
    let effects = 0;
    await assert.rejects(new TelegramSessionService(db).run(USER, 102, async (_state, checkpoint) => {
      await checkpoint(); effects++;
    }));
    assert.equal(effects, 0);
  }
});

test('several checkpoints do not duplicate an update id or release its lease early', async () => {
  const db = database();
  await new TelegramSessionService(db).run(USER, 103, async (state, checkpoint) => {
    await checkpoint();
    assert.ok(db.row().lockToken);
    state.lastEffect = { id: 'confirmation', operation: 'expense', status: 'completed', at: Date.now() };
    await checkpoint();
    assert.ok(db.row().lockToken);
  });
  assert.equal(db.row().lockToken, null);
  assert.deepEqual(db.row().state.processedUpdates, [103]);
  assert.equal(db.row().state.lastEffect.status, 'completed');
});
