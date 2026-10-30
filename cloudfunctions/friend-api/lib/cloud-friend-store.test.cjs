'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createDatabase } = require('../../memory-api/lib/test-support/database.cjs');
const { createCloudFriendStore } = require('./cloud-friend-store');

const now = '2026-10-28T08:00:00.000Z';

test('concurrent invitation creation cannot exceed the server rate limit', async () => {
  const database = createDatabase({ users: [{ _id: 'u', status: 'active' }] }, { wrapped: true });
  const store = createCloudFriendStore(database);
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      store.createInvite({
        _id: `invite-${index}`,
        creatorUserId: 'u',
        createdAt: now,
      }),
    ),
  );
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(database.collections.get('invite_tokens').size, 5);
});

test('accepting an invitation uses document transactions and returns the public result envelope', async () => {
  const database = createDatabase(
    {
      users: [
        { _id: 'u', status: 'active' },
        { _id: 'v', status: 'active' },
      ],
      invite_tokens: [
        { _id: 'i', tokenHash: 'token', creatorUserId: 'u', expiresAt: '2027-01-01', usedAt: null },
      ],
    },
    { wrapped: true, arrayReads: true },
  );
  const store = createCloudFriendStore(database);
  const input = {
    tokenHash: 'token',
    receiverUserId: 'v',
    pairKey: 'pair',
    relationshipId: 'r',
    now,
    friendship: {
      _id: 'f',
      pairKey: 'pair',
      userAId: 'u',
      userBId: 'v',
      relationshipId: 'r',
      status: 'active',
    },
    request: { _id: 'request' },
  };
  const results = await Promise.all([
    store.acceptInvite(input),
    store.acceptInvite({ ...input, friendship: { ...input.friendship, _id: 'f2' } }),
  ]);
  assert.equal(results[0].status, 'created');
  assert.equal(results[1].status, 'existing');
  assert.equal(database.collections.get('friendships').size, 1);
});

test('removing a friendship revokes access and removes more than 100 likes using bounded transactions', async () => {
  const likes = Array.from({ length: 205 }, (_, index) => ({
    _id: `l${index}`,
    memoryId: `m${index}`,
    ownerUserId: 'u',
    userId: 'v',
  }));
  const database = createDatabase(
    {
      friendships: [
        {
          _id: 'f',
          pairKey: 'pair',
          userAId: 'u',
          userBId: 'v',
          relationshipId: 'r',
          status: 'active',
        },
      ],
      likes,
      memories: likes.map((like) => ({ _id: like.memoryId, ownerUserId: 'u', likeCount: 1 })),
    },
    { wrapped: true },
  );
  const store = createCloudFriendStore(database);
  assert.ok(await store.removeFriend('pair', 'u', now));
  assert.equal(database.collections.get('friendships').get('f').status, 'removed');
  assert.equal(database.collections.get('likes').size, 0);
  assert.ok(
    [...database.collections.get('memories').values()].every((memory) => memory.likeCount === 0),
  );
  assert.ok(database.transactionSizes.every((count) => count <= 100));
});

test('friend removal is retryable after cleanup failure and keeps a newly renewed like', async () => {
  const database = createDatabase({
    friendships: [
      {
        _id: 'f',
        pairKey: 'pair',
        userAId: 'u',
        userBId: 'v',
        relationshipId: 'old',
        status: 'active',
      },
    ],
    likes: [{ _id: 'l', memoryId: 'm', ownerUserId: 'u', userId: 'v', relationshipId: 'old' }],
    memories: [{ _id: 'm', ownerUserId: 'u', likeCount: 1 }],
  });
  const store = createCloudFriendStore(database);
  const runTransaction = database.runTransaction;
  let calls = 0;
  database.runTransaction = async (callback) => {
    calls++;
    if (calls === 2) throw new Error('temporary cleanup failure');
    return runTransaction(callback);
  };
  await assert.rejects(() => store.removeFriend('pair', 'u', now));
  assert.equal(database.collections.get('friendships').get('f').status, 'removed');
  await store.removeFriend('pair', 'u', now);
  assert.equal(database.collections.get('likes').size, 0);
  assert.equal(database.collections.get('memories').get('m').likeCount, 0);
});

test('cleanup does not remove a like renewed after a new friendship was accepted', async () => {
  const database = createDatabase({
    friendships: [
      {
        _id: 'f',
        pairKey: 'pair',
        userAId: 'u',
        userBId: 'v',
        relationshipId: 'old',
        status: 'active',
      },
    ],
    likes: [{ _id: 'l', memoryId: 'm', ownerUserId: 'u', userId: 'v', relationshipId: 'old' }],
    memories: [{ _id: 'm', ownerUserId: 'u', likeCount: 1 }],
  });
  const store = createCloudFriendStore(database);
  const runTransaction = database.runTransaction;
  let calls = 0;
  database.runTransaction = async (callback) => {
    const result = await runTransaction(callback);
    if (++calls === 1) {
      await database
        .collection('friendships')
        .doc('f')
        .update({ data: { status: 'active', relationshipId: 'new' } });
      await database
        .collection('likes')
        .doc('l')
        .update({ data: { relationshipId: 'new' } });
    }
    return result;
  };
  await store.removeFriend('pair', 'u', now);
  assert.equal(database.collections.get('friendships').get('f').relationshipId, 'new');
  assert.equal(database.collections.get('likes').size, 1);
  assert.equal(database.collections.get('memories').get('m').likeCount, 1);
});

test('an unavailable invitation creator cannot create a friendship', async () => {
  const database = createDatabase({
    users: [
      { _id: 'u', status: 'deleted' },
      { _id: 'v', status: 'active' },
    ],
    invite_tokens: [
      { _id: 'i', tokenHash: 'token', creatorUserId: 'u', expiresAt: '2027-01-01', usedAt: null },
    ],
  });
  const store = createCloudFriendStore(database);
  const result = await store.acceptInvite({
    tokenHash: 'token',
    receiverUserId: 'v',
    pairKey: 'pair',
    now,
    friendship: { userAId: 'u', userBId: 'v' },
  });
  assert.equal(result.code, 'INVITE_NOT_FOUND');
  assert.equal(database.collections.get('friendships').size, 0);
  assert.equal(database.collections.get('invite_tokens').get('i').usedAt, null);
});
