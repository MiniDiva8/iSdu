import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanionService, COMPANION_STORAGE_KEY } from './companion-service.ts';
function setup() {
  const values = new Map();
  let fail = false;
  const storage = {
    has: (k) => values.has(k),
    read: (k) => values.get(k),
    write(k, v) {
      if (fail) throw Error('quota');
      values.set(k, v);
    },
    remove: (k) => values.delete(k),
  };
  const memories = [
    {
      origin: 'demo',
      createdAt: '2026-10-26T08:00:00Z',
      recordedAt: '2026-10-26T08:00:00Z',
      imagePaths: ['x'],
    },
    {
      origin: 'user',
      createdAt: '2026-10-26T08:00:00Z',
      recordedAt: '2026-10-20T08:00:00Z',
      imagePaths: [],
      mood: 'calm',
    },
  ];
  const service = new CompanionService(
    storage,
    async () => memories,
    () => '2026-10-26T08:00:00Z',
    () => 0,
  );
  return {
    values,
    storage,
    service,
    setFail: () => {
      fail = true;
    },
  };
}
test('first read is side effect free and diary facts exclude demo records', async () => {
  const { service, values } = setup();
  assert.equal(service.read().adoptedAt, null);
  assert.equal(values.size, 0);
  const facts = await service.facts();
  assert.equal(facts.totalEntries, 1);
  assert.equal(facts.entriesToday, 1);
  assert.equal(facts.photosToday, 0);
});
test('failed persistence leaves the previous whole state intact', async () => {
  const { service, values, setFail } = setup();
  await service.dispatch({ type: 'adopt', name: '豆芽' });
  const before = values.get(COMPANION_STORAGE_KEY);
  setFail();
  await assert.rejects(() => service.dispatch({ type: 'checkin' }));
  assert.equal(values.get(COMPANION_STORAGE_KEY), before);
});
test('concurrent claims read the latest state and award only one diary reward', async () => {
  const { service } = setup();
  await service.dispatch({ type: 'adopt', name: '豆芽' });
  const results = await Promise.allSettled([
    service.dispatch({ type: 'claim', taskId: 'write' }),
    service.dispatch({ type: 'claim', taskId: 'write' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(service.read().crystals, 110);
  service.clear();
  assert.equal(service.read().adoptedAt, null);
});

test('claimAll reads facts once and commits the rewards as one state write', async (t) => {
  const { service, values } = setup();
  await service.dispatch({ type: 'adopt', name: '豆芽' });
  const reads = t.mock.method(service, 'facts', service.facts.bind(service));
  const before = service.read().crystals;
  await Promise.all([
    service.dispatch({ type: 'claimAll', requestId: 'batch-1' }),
    service.dispatch({ type: 'claim', taskId: 'write', requestId: 'single-1' }).catch(() => null),
  ]);
  assert.equal(reads.mock.callCount(), 2, 'one fact lookup per command');
  assert.equal(service.read().crystals, before + 100 + 10);
  assert.ok(values.get(COMPANION_STORAGE_KEY));
});
test('failed claimAll persistence leaves every task reward unclaimed', async () => {
  const { service, values, setFail } = setup();
  await service.dispatch({ type: 'adopt', name: '豆芽' });
  const before = values.get(COMPANION_STORAGE_KEY);
  setFail();
  await assert.rejects(service.dispatch({ type: 'claimAll' }), /quota/);
  assert.equal(values.get(COMPANION_STORAGE_KEY), before);
});
test('claimAll crossing Beijing midnight refuses stale facts and grants no rewards', async () => {
  let now = '2026-10-26T15:59:59Z';
  const values = new Map();
  const service = new CompanionService(
    {
      has: (k) => values.has(k),
      read: (k) => values.get(k),
      write: (k, v) => values.set(k, v),
      remove: (k) => values.delete(k),
    },
    async () => {
      now = '2026-10-26T16:00:01Z';
      return [];
    },
    () => now,
  );
  await service.dispatch({ type: 'adopt', name: '豆芽' });
  const before = values.get(COMPANION_STORAGE_KEY);
  await assert.rejects(service.dispatch({ type: 'claimAll' }), (e) => e.code === 'DAY_CHANGED');
  assert.equal(values.get(COMPANION_STORAGE_KEY), before);
});

test('one claimAll command performs one facts read and one durable state write', async (t) => {
  const { service, storage } = setup();
  await service.dispatch({ type: 'adopt', name: '豆芽' });
  const facts = t.mock.method(service, 'facts', service.facts.bind(service));
  const writes = t.mock.method(storage, 'write', storage.write.bind(storage));
  await service.dispatch({ type: 'claimAll', requestId: 'atomic-batch' });
  assert.equal(facts.mock.callCount(), 1);
  assert.equal(writes.mock.callCount(), 1);
});
