'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createCloudUserStore } = require('./cloud-user-store');

function createDatabase(seed) {
  const collections = new Map(
    Object.entries(seed).map(([name, items]) => [
      name,
      new Map(items.map((item) => [item._id, { ...item }])),
    ]),
  );

  function collection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    const items = collections.get(name);
    return {
      add: async ({ data }) => items.set(data._id, { ...data }),
      doc: (id) => ({
        get: async () => ({ data: items.get(id) ?? null }),
        remove: async () => items.delete(id),
        update: async ({ data }) => {
          const current = items.get(id);
          if (!current) throw new Error(`missing ${name}/${id}`);
          items.set(id, { ...current, ...data });
        },
      }),
      where: (query) => ({
        limit: () => ({
          get: async () => ({
            data: [...items.values()].filter((item) =>
              Object.entries(query).every(([key, value]) => item[key] === value),
            ),
          }),
        }),
      }),
    };
  }

  return {
    collection,
    collections,
    runTransaction: async (callback) => callback({ collection }),
  };
}

test('deletes the trusted account graph and atomically repairs outgoing like counts', async () => {
  const database = createDatabase({
    users: [
      { _id: 'usr_a', avatarFileId: 'cloud://private/avatar-a.jpg', status: 'active' },
      { _id: 'usr_b', status: 'active' },
    ],
    memories: [
      {
        _id: 'memory-a',
        images: [{ fileId: 'cloud://private/memory-a.jpg' }],
        likeCount: 1,
        ownerUserId: 'usr_a',
      },
      { _id: 'memory-b', images: [], likeCount: 1, ownerUserId: 'usr_b' },
    ],
    likes: [
      {
        _id: 'like-a-to-b',
        memoryId: 'memory-b',
        ownerUserId: 'usr_b',
        userId: 'usr_a',
      },
      {
        _id: 'like-b-to-a',
        memoryId: 'memory-a',
        ownerUserId: 'usr_a',
        userId: 'usr_b',
      },
    ],
    friendships: [{ _id: 'friendship', userAId: 'usr_a', userBId: 'usr_b' }],
    friend_requests: [
      { _id: 'request-out', requesterUserId: 'usr_a', receiverUserId: 'usr_b' },
      { _id: 'request-in', requesterUserId: 'usr_b', receiverUserId: 'usr_a' },
    ],
    invite_tokens: [{ _id: 'invite', creatorUserId: 'usr_a' }],
    memory_migrations: [{ _id: 'migration', ownerUserId: 'usr_a' }],
    image_upload_plans: [{ _id: 'plan', ownerUserId: 'usr_a' }],
  });
  const store = createCloudUserStore(database);

  const result = await store.deleteAccount('usr_a');

  assert.deepEqual(result.fileIds.sort(), [
    'cloud://private/avatar-a.jpg',
    'cloud://private/memory-a.jpg',
  ]);
  assert.equal(database.collections.get('users').has('usr_a'), false);
  assert.equal(database.collections.get('users').has('usr_b'), true);
  assert.equal(database.collections.get('memories').has('memory-a'), false);
  assert.equal(database.collections.get('memories').get('memory-b').likeCount, 0);
  assert.equal(database.collections.get('likes').size, 0);
  assert.equal(database.collections.get('friendships').size, 0);
  assert.equal(database.collections.get('friend_requests').size, 0);
  assert.equal(database.collections.get('invite_tokens').size, 0);
  assert.equal(database.collections.get('memory_migrations').size, 0);
  assert.equal(database.collections.get('image_upload_plans').size, 0);
});
