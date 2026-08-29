import assert from 'node:assert/strict';
import test from 'node:test';

import { CloudMemoryRepository, CloudMemoryRepositoryError } from './cloud-memory-repository.ts';

function createClient(result) {
  const calls = [];
  return {
    calls,
    call: async (...args) => {
      calls.push(args);
      return result;
    },
  };
}

const item = {
  category: 'campus-life',
  customCategory: '',
  customMood: '',
  hasImage: true,
  id: 'memory-shared',
  likeCount: 3,
  mapAssetVersion: 'campus-map-v3',
  mapXRatio: 0.4,
  mapYRatio: 0.6,
  mood: 'happy',
  ownerDisplayName: '好友甲',
  ownerUserId: 'usr_friend',
  placeName: '图书馆',
  publishedAt: '2026-08-15T08:00:00.000Z',
  recordedAt: '2026-08-14T08:00:00.000Z',
  summary: '一起看晚霞',
  thumbnailUrl: 'https://temp.invalid/thumbnail',
};

test('requests one authorized friend timeline page with the current cursor', async () => {
  const response = {
    data: {
      items: [item],
      nextCursor: { id: item.id, publishedAt: item.publishedAt },
    },
    ok: true,
    requestId: 'req-1',
  };
  const client = createClient(response);
  const repository = new CloudMemoryRepository(client);
  const page = await repository.listFriendTimeline(null);
  assert.deepEqual(client.calls, [['memory-api', 'listFriendTimeline', { cursor: null }]]);
  assert.equal(page.items[0].ownerDisplayName, '好友甲');
  assert.deepEqual(page.nextCursor, response.data.nextCursor);
});

test('rejects malformed friend timeline coordinates and counts', async () => {
  const client = createClient({
    data: { items: [{ ...item, likeCount: -1, mapXRatio: 2 }], nextCursor: null },
    ok: true,
    requestId: 'req-2',
  });
  const repository = new CloudMemoryRepository(client);
  await assert.rejects(repository.listFriendTimeline(), /好友时光条目格式无效/u);
});

test('keeps friend timeline authorization errors typed', async () => {
  const client = createClient({
    code: 'PROFILE_REQUIRED',
    message: '请先开启云端身份',
    ok: false,
    requestId: 'req-3',
  });
  const repository = new CloudMemoryRepository(client);
  await assert.rejects(repository.listFriendTimeline(), (error) => {
    assert.equal(error instanceof CloudMemoryRepositoryError, true);
    assert.equal(error.code, 'PROFILE_REQUIRED');
    return true;
  });
});
