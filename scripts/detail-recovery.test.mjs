import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';

let definition;
globalThis.Page = (value) => (definition = value);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [] }),
  getStorageSync: () => '',
};
await import('../miniprogram/pages/detail/index.ts');

function page() {
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}

test('detail exposes retry after a failed first read and recovers the same journal', async (t) => {
  const detail = page();
  detail.onLoad({ memoryId: 'retry-entry' });
  let reads = 0;
  t.mock.method(memoryRepository, 'getMemoryById', async (id) => {
    assert.equal(id, 'retry-entry');
    if (++reads === 1) throw new Error('临时读取失败');
    return {
      id,
      text: '重试后仍是原来的日记',
      imagePaths: [],
      mood: 'calm',
      category: 'campus-life',
      placeName: '',
      recordedAt: '2026-10-28T04:00:00.000Z',
      mapAssetVersion: 'journal-unlocated-v1',
      mapXRatio: 0,
      mapYRatio: 0,
    };
  });
  await detail.loadMemory();
  assert.equal(detail.data.memory, null);
  assert.equal(detail.data.canRetryLoad, true);
  assert.match(detail.data.loadError, /临时读取失败/);
  await detail.loadMemory();
  assert.equal(detail.data.memory.id, 'retry-entry');
  assert.equal(detail.data.memory.text, '重试后仍是原来的日记');
  assert.equal(detail.data.canRetryLoad, false);
  assert.equal(detail.data.loadError, '');
  assert.equal(reads, 2);
});

test('detail with no journal ID does not offer retry or query storage', async (t) => {
  const get = t.mock.method(memoryRepository, 'getMemoryById', async () => null);
  const detail = page();
  detail.onLoad({});
  await detail.loadMemory();
  assert.equal(detail.data.canRetryLoad, false);
  assert.equal(get.mock.callCount(), 0);
  assert.match(detail.data.loadError, /日记 ID/);
});

test('a missing journal is a terminal empty state without an endless retry action', async (t) => {
  t.mock.method(memoryRepository, 'getMemoryById', async () => null);
  const detail = page();
  detail.onLoad({ memoryId: 'deleted-entry' });
  await detail.loadMemory();
  assert.equal(detail.data.canRetryLoad, false);
  assert.equal(detail.data.memory, null);
  assert.match(detail.data.loadErrorTitle, /没有找到/);
});
