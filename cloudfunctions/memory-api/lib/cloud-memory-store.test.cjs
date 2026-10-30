'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createDatabase } = require('./test-support/database.cjs');
const { createCloudMemoryStore } = require('./cloud-memory-store');
const { createMemoryHandler } = require('./memory-handler');

const now = '2026-10-28T08:00:00.000Z';

test('owner reads and clear include every page without touching other owners or old deletions', async () => {
  const owned = Array.from({ length: 205 }, (_, index) => ({
    _id: `m${String(index).padStart(3, '0')}`,
    ownerUserId: 'u',
    deletedAt: null,
    recordedAt: new Date(Date.parse(now) - index * 1000).toISOString(),
  })).reverse();
  const database = createDatabase({
    memories: [
      ...owned,
      { _id: 'other', ownerUserId: 'v', deletedAt: null },
      { _id: 'deleted', ownerUserId: 'u', deletedAt: 'old' },
    ],
  });
  const store = createCloudMemoryStore(database);
  const items = await store.listMine('u');
  assert.equal(items.length, 205);
  assert.equal(items[0]._id, 'm000');
  assert.equal(items[204]._id, 'm204');
  const removed = await store.clearMine('u', now);
  assert.equal(removed.length, 205);
  assert.equal((await store.listMine('u')).length, 0);
  assert.equal(database.collections.get('memories').get('other').deletedAt, null);
  assert.equal(database.collections.get('memories').get('deleted').deletedAt, 'old');
  assert.ok(database.querySizes.every((size) => size <= 100));
});

for (const wrapped of [false, true]) {
  test(`rate limit preserves false with ${wrapped ? 'wrapped' : 'direct'} transactions`, async () => {
    const database = createDatabase(
      { users: [{ _id: 'u', status: 'active' }] },
      { wrapped, arrayReads: wrapped },
    );
    const store = createCloudMemoryStore(database);
    assert.equal(await store.consumeRateLimit('u', 'upload', now, 60000, 1), true);
    assert.equal(await store.consumeRateLimit('u', 'upload', now, 60000, 1), false);
  });
}

test('an upload plan can be consumed once across concurrent calls and only by its owner', async () => {
  const database = createDatabase(
    {
      image_upload_plans: [{ _id: 'p', ownerUserId: 'u', usedAt: null, expiresAt: '2027-01-01' }],
    },
    { wrapped: true, arrayReads: true },
  );
  const store = createCloudMemoryStore(database);
  assert.equal(await store.consumeUploadPlan('p', 'v', now), null);
  const results = await Promise.all([
    store.consumeUploadPlan('p', 'u', now),
    store.consumeUploadPlan('p', 'u', now),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(database.collections.get('image_upload_plans').get('p').usedAt, now);
});

test('migration uses supported document transactions and remains idempotent', async () => {
  const database = createDatabase({}, { wrapped: true });
  const store = createCloudMemoryStore(database);
  const migration = { _id: 'migration', migrationKey: 'key', cloudMemoryId: 'memory' };
  const results = await Promise.all([
    store.createMigratedMemory({ _id: 'memory' }, migration),
    store.createMigratedMemory({ _id: 'duplicate' }, { ...migration, _id: 'second' }),
  ]);
  assert.equal(results[0].status, 'created');
  assert.equal(results[1].status, 'existing');
  assert.equal(results[1].memoryId, 'memory');
  assert.equal(database.collections.get('memories').size, 1);
});

test('likes recheck privacy in document transactions and do not double count concurrent retries', async () => {
  const database = createDatabase(
    {
      memories: [
        { _id: 'm', ownerUserId: 'u', deletedAt: null, visibility: 'friends', likeCount: 0 },
      ],
      friendships: [{ _id: 'f', pairKey: 'friends', status: 'active', relationshipId: 'r' }],
    },
    { wrapped: true, arrayReads: true },
  );
  const store = createCloudMemoryStore(database);
  const input = {
    memoryId: 'm',
    userId: 'v',
    friendshipPairKey: 'friends',
    likePairKey: 'like',
    likeId: 'like1',
    liked: true,
    now,
  };
  const results = await Promise.all([
    store.setLikeState(input),
    store.setLikeState({ ...input, likeId: 'like2' }),
  ]);
  assert.deepEqual(
    results.map((result) => result.likeCount),
    [1, 1],
  );
  assert.equal(database.collections.get('likes').size, 1);
  await database
    .collection('memories')
    .doc('m')
    .update({ data: { visibility: 'private' } });
  assert.deepEqual(await store.setLikeState({ ...input, liked: false }), {
    code: 'VIEW_FORBIDDEN',
  });
});

test('concurrent creates keep one memory per owner request and preserve legacy random IDs', async () => {
  const database = createDatabase(
    { memories: [{ _id: 'legacy-id', ownerUserId: 'u', clientRequestId: 'old' }] },
    { wrapped: true },
  );
  const store = createCloudMemoryStore(database);
  const input = { _id: 'random1', ownerUserId: 'u', clientRequestId: 'new', deletedAt: null };
  const results = await Promise.all([
    store.createMemory(input),
    store.createMemory({ ...input, _id: 'random2' }),
  ]);
  assert.equal(results[0]._id, results[1]._id);
  assert.equal(database.collections.get('memories').size, 2);
  const old = await store.createMemory({ ...input, clientRequestId: 'old' });
  assert.equal(old._id, 'legacy-id');
  const other = await store.createMemory({ ...input, ownerUserId: 'v' });
  assert.notEqual(other._id, results[0]._id);
});

test('a failed memory commit rolls back upload consumption so the same images can be retried', async () => {
  const database = createDatabase(
    { image_upload_plans: [{ _id: 'p', ownerUserId: 'u', usedAt: null, expiresAt: '2027-01-01' }] },
    { wrapped: true },
  );
  const store = createCloudMemoryStore(database);
  const input = { _id: 'm', ownerUserId: 'u', clientRequestId: 'request', updatedAt: now };
  database.failNextWrite('memories');
  await assert.rejects(() => store.createMemory(input, 'p', now));
  assert.equal(database.collections.get('image_upload_plans').get('p').usedAt, null);
  const saved = await store.createMemory(input, 'p', now);
  assert.equal(saved.ownerUserId, 'u');
  assert.equal(database.collections.get('image_upload_plans').get('p').usedAt, now);
  const reused = await store.createMemory({ ...input, clientRequestId: 'other' }, 'p', now);
  assert.equal(reused.code, 'UPLOAD_PLAN_INVALID');
  assert.equal(database.collections.get('memories').size, 1);
});

test('selected-friend likes reject a grant from an earlier relationship', async () => {
  const database = createDatabase({
    memories: [
      {
        _id: 'm',
        ownerUserId: 'u',
        deletedAt: null,
        visibility: 'selected_friends',
        likeCount: 0,
        selectedGrants: [{ friendUserId: 'v', relationshipId: 'old' }],
      },
    ],
    friendships: [{ _id: 'f', pairKey: 'pair', status: 'active', relationshipId: 'new' }],
  });
  const store = createCloudMemoryStore(database);
  const input = {
    memoryId: 'm',
    userId: 'v',
    friendshipPairKey: 'pair',
    likePairKey: 'like',
    liked: true,
    now,
  };
  assert.deepEqual(await store.setLikeState(input), { code: 'VIEW_FORBIDDEN' });
  assert.equal(database.collections.get('likes').size, 0);
  await database
    .collection('memories')
    .doc('m')
    .update({ data: { selectedGrants: [{ friendUserId: 'v', relationshipId: 'new' }] } });
  assert.equal((await store.setLikeState(input)).likeCount, 1);
  await database
    .collection('friendships')
    .doc('f')
    .update({ data: { status: 'removed' } });
  assert.deepEqual(await store.setLikeState(input), { code: 'VIEW_FORBIDDEN' });
});

for (const action of ['listFriendTimeline', 'listFriendRecentMap']) {
  test(`${action} reaches 205 same-time records beyond inaccessible leading pages`, async () => {
    const base = {
      ownerUserId: 'u',
      deletedAt: null,
      publishedAt: now,
      visibility: 'friends',
      images: [],
      mapAssetVersion: 'map',
      mapXRatio: 0.5,
      mapYRatio: 0.5,
      text: 'memory',
    };
    const memories = [
      ...Array.from({ length: 120 }, (_, index) => ({
        ...base,
        _id: `a${String(index).padStart(3, '0')}`,
        visibility: 'selected_friends',
        selectedGrants: [],
      })),
      ...Array.from({ length: 205 }, (_, index) => ({
        ...base,
        _id: `m${String(index).padStart(3, '0')}`,
      })),
    ];
    const database = createDatabase({
      memories,
      users: [
        { _id: 'u', status: 'active', displayName: 'Owner' },
        { _id: 'v', status: 'active', identityHash: 'viewer' },
      ],
      friendships: [
        { _id: 'f', userAId: 'u', userBId: 'v', status: 'active', relationshipId: 'r' },
      ],
    });
    const handler = createMemoryHandler({
      store: createCloudMemoryStore(database),
      getTrustedContext: () => ({ APPID: 'app', OPENID: 'open' }),
      hash: () => 'viewer',
      now: () => now,
      newRequestId: () => 'request',
      getTempUrls: async () => [],
    });
    const found = [];
    let cursor = null;
    for (let page = 0; page < 12; page++) {
      const result = await handler({ action, payload: { cursor, mapAssetVersion: 'map' } });
      assert.equal(result.ok, true);
      found.push(...(result.data.items ?? result.data.points).map((item) => item.id));
      cursor = result.data.nextCursor;
      if (!cursor) break;
    }
    assert.equal(found.length, 205);
    assert.equal(new Set(found).size, 205);
    assert.equal(found[0], 'm000');
    assert.equal(found[204], 'm204');
  });
}
