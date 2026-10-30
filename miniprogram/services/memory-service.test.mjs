import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryService } from './memory-service.ts';

function createRepository(label, calls, failure = null) {
  return {
    clearMemories: async () => calls.push(`${label}:clear`),
    createMemory: async () => {
      calls.push(`${label}:create`);
      if (failure) throw failure;
      return { id: `${label}-memory` };
    },
    deleteMemory: async () => calls.push(`${label}:delete`),
    getMemoryById: async () => null,
    listMemories: async () => [],
    updateMemory: async () => ({ id: `${label}-memory` }),
  };
}

test('uses the local repository while cloud mode has not been activated', async () => {
  const calls = [];
  const service = new MemoryService(
    { getState: () => ({ mode: 'local' }) },
    createRepository('local', calls),
    createRepository('cloud', calls),
  );

  await service.createMemory({});
  assert.deepEqual(calls, ['local:create']);
});

test('does not silently write to local storage when a cloud write fails', async () => {
  const calls = [];
  const cloudFailure = new Error('CloudBase unavailable');
  const service = new MemoryService(
    { getState: () => ({ mode: 'cloud' }) },
    createRepository('local', calls),
    createRepository('cloud', calls, cloudFailure),
  );

  await assert.rejects(service.createMemory({}), cloudFailure);
  assert.deepEqual(calls, ['cloud:create']);
});

const entry = (id) => ({ id, text: id, imagePaths: ['/one.jpg'] });
function cachedService() {
  let mode = { mode: 'cloud', activatedAt: 'session-a' };
  let now = 1000;
  let calls = 0;
  const repo = createRepository('cloud', []);
  repo.listMemories = async () => [entry('read-' + ++calls)];
  const service = new MemoryService(
    { getState: () => mode },
    createRepository('local', []),
    repo,
    () => now,
  );
  return {
    service,
    repo,
    calls: () => calls,
    setNow: (v) => (now = v),
    setMode: (v) => (mode = v),
  };
}
test('cloud list merges concurrent requests and reuses a 30 second isolated snapshot', async () => {
  const h = cachedService();
  const [a, b] = await Promise.all([h.service.listMemories(), h.service.listMemories()]);
  assert.equal(h.calls(), 1);
  a[0].imagePaths.push('mutated');
  assert.deepEqual(b[0].imagePaths, ['/one.jpg']);
  assert.deepEqual((await h.service.listMemories())[0].imagePaths, ['/one.jpg']);
  h.setNow(31001);
  await h.service.listMemories();
  assert.equal(h.calls(), 2);
});
test('forced refresh requests current data and propagates failure instead of returning cache', async () => {
  const h = cachedService();
  await h.service.listMemories();
  assert.equal((await h.service.listMemories(true))[0].id, 'read-2');
  h.repo.listMemories = async () => {
    throw new Error('offline');
  };
  await assert.rejects(h.service.listMemories(true), /offline/);
});
test('mutations invalidate list snapshots and pre-write pending reads cannot refill them', async () => {
  const h = cachedService();
  let resolveOld;
  h.repo.listMemories = () =>
    new Promise((r) => {
      resolveOld = r;
    });
  const old = h.service.listMemories();
  await h.service.createMemory({});
  resolveOld([entry('old')]);
  await old;
  assert.equal(h.service.getCachedMemories(), null);
  h.repo.listMemories = async () => [entry('new')];
  await h.service.listMemories();
  assert.equal(h.service.getCachedMemories()[0].id, 'new');
  for (const mutate of [
    () => h.service.updateMemory('new', {}),
    () => h.service.deleteMemory('new'),
    () => h.service.clearMemories(),
  ]) {
    await mutate();
    assert.equal(h.service.getCachedMemories(), null);
    await h.service.listMemories();
  }
});
test('cloud activation changes and local mode never reuse the previous session snapshot', async () => {
  const h = cachedService();
  await h.service.listMemories();
  h.setMode({ mode: 'local' });
  assert.equal(h.service.getCachedMemories(), null);
  assert.deepEqual(await h.service.listMemories(), []);
  h.setMode({ mode: 'cloud', activatedAt: 'session-b' });
  assert.equal(h.service.getCachedMemories(), null);
  await h.service.listMemories();
  assert.equal(h.calls(), 2);
});

test('each cached list call reads the current mode only once without caching identity state', async () => {
  let reads = 0;
  let state = { mode: 'cloud', activatedAt: 'session-a' };
  const cloud = createRepository('cloud', []);
  cloud.listMemories = async () => [entry('cloud')];
  const service = new MemoryService(
    {
      getState: () => {
        reads++;
        return state;
      },
    },
    createRepository('local', []),
    cloud,
  );
  await service.listMemories();
  reads = 0;
  assert.equal((await service.listMemories())[0].id, 'cloud');
  assert.equal(reads, 1, 'one cache hit should use one synchronous storage snapshot');
  state = { mode: 'local' };
  assert.deepEqual(await service.listMemories(), []);
});
