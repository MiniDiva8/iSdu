'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createMemoryHandler } = require('./memory-handler');

function createHarness() {
  const users = [
    { _id: 'usr_a', identityHash: 'identity-a', status: 'active', displayName: 'A' },
    { _id: 'usr_b', identityHash: 'identity-b', status: 'active', displayName: 'B' },
  ];
  const memories = new Map();
  const likes = new Map();
  const friendships = [
    {
      userAId: 'usr_a',
      userBId: 'usr_b',
      relationshipId: 'relationship-original',
      status: 'active',
    },
  ];
  const migrations = new Map();
  const plans = new Map();
  let currentOpenId = 'open-a';
  let sequence = 0;
  const options = {
    deleteFiles: async () => undefined,
    getTempUrls: async (fileIds) => fileIds.map((_, index) => `https://temp.invalid/${index}`),
    getTrustedContext: () => ({ APPID: 'app', OPENID: currentOpenId }),
    hash: (value) => {
      if (value === 'app\0open-a') return 'identity-a';
      if (value === 'app\0open-b') return 'identity-b';
      return `hash:${value}`;
    },
    newId: (prefix) => `${prefix}_${++sequence}`,
    newRequestId: () => `req_${++sequence}`,
    now: () => '2026-08-15T08:00:00.000Z',
    store: {
      findUserByIdentityHash: async (identityHash) =>
        users.find((user) => user.identityHash === identityHash) ?? null,
      createUploadPlan: async (plan) => {
        plans.set(plan._id, { ...plan });
        return plan;
      },
      consumeUploadPlan: async (planId, ownerUserId, now) => {
        const plan = plans.get(planId);
        if (!plan || plan.ownerUserId !== ownerUserId || plan.usedAt || plan.expiresAt <= now) {
          return null;
        }
        plan.usedAt = now;
        return plan;
      },
      findMigration: async (key) => migrations.get(key) ?? null,
      createMigratedMemory: async (memory, migration) => {
        const existing = migrations.get(migration.migrationKey);
        if (existing) {
          return { memoryId: existing.cloudMemoryId, status: 'existing' };
        }
        memories.set(memory._id, { ...memory });
        migrations.set(migration.migrationKey, { ...migration });
        return { memoryId: memory._id, status: 'created' };
      },
      createMemory: async (memory) => {
        memories.set(memory._id, { ...memory });
        return memory;
      },
      listMine: async (ownerUserId) =>
        [...memories.values()].filter((memory) => memory.ownerUserId === ownerUserId),
      getMine: async (ownerUserId, memoryId) => {
        const memory = memories.get(memoryId);
        return memory?.ownerUserId === ownerUserId && !memory.deletedAt ? memory : null;
      },
      updateMine: async (ownerUserId, memoryId, data) => {
        const current = memories.get(memoryId);
        if (!current || current.ownerUserId !== ownerUserId) return null;
        const updated = { ...current, ...data };
        memories.set(memoryId, updated);
        return updated;
      },
      deleteMine: async (ownerUserId, memoryId, now) => {
        const current = memories.get(memoryId);
        if (!current || current.ownerUserId !== ownerUserId) return null;
        memories.set(memoryId, { ...current, deletedAt: now });
        return current;
      },
      clearMine: async () => [],
      listActiveFriendships: async (userId) =>
        friendships.filter(
          (item) =>
            item.status === 'active' && (item.userAId === userId || item.userBId === userId),
        ),
      getMemory: async (memoryId) => memories.get(memoryId) ?? null,
      getUser: async (userId) => users.find((user) => user._id === userId) ?? null,
      getActiveFriendship: async (pairKey) =>
        friendships.find(
          (item) =>
            item.status === 'active' &&
            `hash:${[item.userAId, item.userBId].sort().join('\0')}` === pairKey,
        ) ?? null,
      findLike: async (pairKey) => likes.get(pairKey) ?? null,
      setLikeState: async (input) => {
        const memory = memories.get(input.memoryId);
        const friendship = friendships.find(
          (item) =>
            item.status === 'active' &&
            `hash:${[item.userAId, item.userBId].sort().join('\0')}` === input.friendshipPairKey,
        );
        const selectedAllowed = memory?.selectedGrants?.some(
          (grant) =>
            grant.friendUserId === input.userId &&
            grant.relationshipId === friendship?.relationshipId,
        );
        if (!memory || !friendship || (memory.visibility !== 'friends' && !selectedAllowed)) {
          return { code: 'VIEW_FORBIDDEN' };
        }
        const existing = likes.get(input.likePairKey);
        let likeCount = memory.likeCount;
        if (input.liked && !existing) {
          likes.set(input.likePairKey, { _id: input.likeId, ...input });
          likeCount += 1;
        } else if (!input.liked && existing) {
          likes.delete(input.likePairKey);
          likeCount = Math.max(0, likeCount - 1);
        }
        memory.likeCount = likeCount;
        return { likeCount, likedByMe: input.liked };
      },
      listRecentMemoriesByOwners: async (ownerUserIds, since) =>
        [...memories.values()].filter(
          (memory) =>
            ownerUserIds.includes(memory.ownerUserId) &&
            !memory.deletedAt &&
            memory.publishedAt &&
            memory.publishedAt >= since,
        ),
    },
  };
  return {
    friendships,
    handler: createMemoryHandler(options),
    likes,
    memories,
    plans,
    setCurrentUser(userId) {
      currentOpenId = userId === 'usr_b' ? 'open-b' : 'open-a';
    },
  };
}

const content = {
  text: '云端回忆',
  placeName: '中心校区',
  mood: 'happy',
  customMood: '',
  category: 'campus-life',
  customCategory: '',
  mapAssetVersion: 'campus-map-v3',
  mapXRatio: 0.4,
  mapYRatio: 0.6,
  recordedAt: '2026-08-14T08:00:00.000Z',
};

test('migrates a text memory as private and keeps trusted ownership', async () => {
  const { handler, memories } = createHarness();
  const result = await handler({
    action: 'migrate',
    payload: {
      content,
      sourceLocalMemoryId: 'memory-local-1',
      localTimestamps: {
        createdAt: '2026-08-14T08:00:00.000Z',
        updatedAt: '2026-08-14T09:00:00.000Z',
      },
      uploaded: [],
    },
  });
  assert.equal(result.ok, true);
  const stored = [...memories.values()][0];
  assert.equal(stored.ownerUserId, 'usr_a');
  assert.equal(stored.visibility, 'private');
  assert.deepEqual(stored.selectedGrants, []);
  assert.equal(stored.publishedAt, null);
});

test('migration is idempotent for the same local memory', async () => {
  const { handler, memories } = createHarness();
  const payload = {
    content,
    sourceLocalMemoryId: 'memory-local-1',
    localTimestamps: {
      createdAt: '2026-08-14T08:00:00.000Z',
      updatedAt: '2026-08-14T09:00:00.000Z',
    },
    uploaded: [],
  };
  const first = await handler({ action: 'migrate', payload });
  const second = await handler({ action: 'migrate', payload });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.status, 'existing');
  assert.equal(memories.size, 1);
});

test('rejects invalid migration coordinates without writing', async () => {
  const { handler, memories } = createHarness();
  const result = await handler({
    action: 'migrate',
    payload: {
      content: { ...content, mapXRatio: 2 },
      sourceLocalMemoryId: 'memory-local-1',
      localTimestamps: {
        createdAt: '2026-08-14T08:00:00.000Z',
        updatedAt: '2026-08-14T09:00:00.000Z',
      },
      uploaded: [],
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(memories.size, 0);
});

test('requires an unexpired upload plan and exact cloud path', async () => {
  const { handler } = createHarness();
  const planned = await handler({
    action: 'createImageUploadPlan',
    payload: { imageCount: 1, operationId: 'memory-local-1' },
  });
  const result = await handler({
    action: 'migrate',
    payload: {
      content,
      sourceLocalMemoryId: 'memory-local-1',
      localTimestamps: {
        createdAt: '2026-08-14T08:00:00.000Z',
        updatedAt: '2026-08-14T09:00:00.000Z',
      },
      planId: planned.data.planId,
      uploaded: [{ imageId: planned.data.files[0].imageId, fileId: 'cloud://wrong/path.jpg' }],
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'UPLOAD_PLAN_INVALID');
});

test('owner list returns temporary URLs but never fileIDs', async () => {
  const { handler } = createHarness();
  const planned = await handler({
    action: 'createImageUploadPlan',
    payload: { imageCount: 1, operationId: 'new-memory' },
  });
  const target = planned.data.files[0];
  const created = await handler({
    action: 'create',
    payload: {
      clientRequestId: 'new-memory',
      content,
      planId: planned.data.planId,
      uploaded: [{ imageId: target.imageId, fileId: `cloud://env/${target.cloudPath}` }],
    },
  });
  assert.equal(created.ok, true);
  assert.match(created.data.memory.imagePaths[0], /^https:\/\//u);
  assert.equal(JSON.stringify(created).includes('cloud://'), false);
});

test('does not accept a client supplied owner id', async () => {
  const { handler, memories } = createHarness();
  await handler({
    action: 'create',
    payload: { clientRequestId: 'new-memory', content, ownerUserId: 'usr_attacker', uploaded: [] },
  });
  assert.equal([...memories.values()][0].ownerUserId, 'usr_a');
});

test('sets selected friends using current server-side relationship ids', async () => {
  const { handler, memories } = createHarness();
  const created = await handler({
    action: 'create',
    payload: { clientRequestId: 'selected-memory', content, uploaded: [] },
  });
  const result = await handler({
    action: 'setVisibility',
    payload: {
      memoryId: created.data.memory.id,
      selectedFriendIds: ['usr_b'],
      visibility: 'selected_friends',
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.memory.selectedFriendIds, ['usr_b']);
  const stored = memories.get(created.data.memory.id);
  assert.deepEqual(stored.selectedGrants, [
    { friendUserId: 'usr_b', relationshipId: 'relationship-original' },
  ]);
  assert.equal(stored.publishedAt, '2026-08-15T08:00:00.000Z');
});

test('rejects an empty selected-friends list and non-friend ids', async () => {
  const { handler } = createHarness();
  const created = await handler({
    action: 'create',
    payload: { clientRequestId: 'invalid-selected-memory', content, uploaded: [] },
  });
  const empty = await handler({
    action: 'setVisibility',
    payload: {
      memoryId: created.data.memory.id,
      selectedFriendIds: [],
      visibility: 'selected_friends',
    },
  });
  const stranger = await handler({
    action: 'setVisibility',
    payload: {
      memoryId: created.data.memory.id,
      selectedFriendIds: ['usr_stranger'],
      visibility: 'selected_friends',
    },
  });
  assert.equal(empty.code, 'FRIEND_SELECTION_REQUIRED');
  assert.equal(stranger.code, 'NOT_FRIENDS');
});

test('making a memory private clears grants but preserves first published time', async () => {
  const { handler, memories } = createHarness();
  const created = await handler({
    action: 'create',
    payload: { clientRequestId: 'private-again', content, uploaded: [] },
  });
  await handler({
    action: 'setVisibility',
    payload: {
      memoryId: created.data.memory.id,
      selectedFriendIds: ['usr_b'],
      visibility: 'selected_friends',
    },
  });
  await handler({
    action: 'setVisibility',
    payload: { memoryId: created.data.memory.id, visibility: 'private' },
  });
  const stored = memories.get(created.data.memory.id);
  assert.equal(stored.visibility, 'private');
  assert.deepEqual(stored.selectedGrants, []);
  assert.equal(stored.publishedAt, '2026-08-15T08:00:00.000Z');
});

test('old selected grant is not silently rebound after relationship id rotates', async () => {
  const { handler, friendships, memories } = createHarness();
  const created = await handler({
    action: 'create',
    payload: { clientRequestId: 'rotated-friend', content, uploaded: [] },
  });
  await handler({
    action: 'setVisibility',
    payload: {
      memoryId: created.data.memory.id,
      selectedFriendIds: ['usr_b'],
      visibility: 'selected_friends',
    },
  });
  friendships[0].relationshipId = 'relationship-new';
  assert.equal(
    memories.get(created.data.memory.id).selectedGrants[0].relationshipId,
    'relationship-original',
  );
});

test('authorized friend detail returns temporary images without fileIDs', async () => {
  const harness = createHarness();
  const planned = await harness.handler({
    action: 'createImageUploadPlan',
    payload: { imageCount: 1, operationId: 'shared-photo' },
  });
  const target = planned.data.files[0];
  const created = await harness.handler({
    action: 'create',
    payload: {
      clientRequestId: 'shared-photo',
      content,
      planId: planned.data.planId,
      uploaded: [{ imageId: target.imageId, fileId: `cloud://env/${target.cloudPath}` }],
    },
  });
  await harness.handler({
    action: 'setVisibility',
    payload: { memoryId: created.data.memory.id, visibility: 'friends' },
  });
  harness.setCurrentUser('usr_b');
  const shared = await harness.handler({
    action: 'getSharedById',
    payload: { memoryId: created.data.memory.id },
  });
  assert.equal(shared.ok, true);
  assert.equal(shared.data.memory.canEdit, false);
  assert.match(shared.data.memory.imagePaths[0], /^https:\/\//u);
  assert.equal(JSON.stringify(shared).includes('cloud://'), false);
});

test('private and stale selected-friend grants deny detail and likes', async () => {
  const harness = createHarness();
  const created = await harness.handler({
    action: 'create',
    payload: { clientRequestId: 'private-share', content, uploaded: [] },
  });
  harness.setCurrentUser('usr_b');
  const privateRead = await harness.handler({
    action: 'getSharedById',
    payload: { memoryId: created.data.memory.id },
  });
  assert.equal(privateRead.code, 'VIEW_FORBIDDEN');

  harness.setCurrentUser('usr_a');
  await harness.handler({
    action: 'setVisibility',
    payload: {
      memoryId: created.data.memory.id,
      selectedFriendIds: ['usr_b'],
      visibility: 'selected_friends',
    },
  });
  harness.friendships[0].relationshipId = 'relationship-new';
  harness.setCurrentUser('usr_b');
  const staleRead = await harness.handler({
    action: 'getSharedById',
    payload: { memoryId: created.data.memory.id },
  });
  const staleLike = await harness.handler({
    action: 'setLike',
    payload: { liked: true, memoryId: created.data.memory.id },
  });
  assert.equal(staleRead.code, 'VIEW_FORBIDDEN');
  assert.equal(staleLike.code, 'VIEW_FORBIDDEN');
});

test('like and unlike are idempotent and keep one unique pair', async () => {
  const harness = createHarness();
  const created = await harness.handler({
    action: 'create',
    payload: { clientRequestId: 'liked-memory', content, uploaded: [] },
  });
  await harness.handler({
    action: 'setVisibility',
    payload: { memoryId: created.data.memory.id, visibility: 'friends' },
  });
  harness.setCurrentUser('usr_b');
  const first = await harness.handler({
    action: 'setLike',
    payload: { liked: true, memoryId: created.data.memory.id },
  });
  const repeated = await harness.handler({
    action: 'setLike',
    payload: { liked: true, memoryId: created.data.memory.id },
  });
  const removed = await harness.handler({
    action: 'setLike',
    payload: { liked: false, memoryId: created.data.memory.id },
  });
  assert.equal(first.data.likeCount, 1);
  assert.equal(repeated.data.likeCount, 1);
  assert.equal(harness.likes.size, 0);
  assert.equal(removed.data.likeCount, 0);
});

test('friend map includes only authorized valid points from the last 24 hours', async () => {
  const harness = createHarness();
  const base = {
    ...content,
    _id: 'memory-boundary',
    ownerUserId: 'usr_a',
    visibility: 'friends',
    selectedGrants: [],
    publishedAt: '2026-08-14T08:00:00.000Z',
    likeCount: 0,
    deletedAt: null,
    createdAt: '2026-08-14T08:00:00.000Z',
    updatedAt: '2026-08-14T08:00:00.000Z',
    images: [],
  };
  harness.memories.set(base._id, base);
  harness.memories.set('memory-invalid-coordinate', {
    ...base,
    _id: 'memory-invalid-coordinate',
    mapXRatio: 2,
  });
  harness.memories.set('memory-wrong-map', {
    ...base,
    _id: 'memory-wrong-map',
    mapAssetVersion: 'other-map',
  });
  harness.memories.set('memory-private', {
    ...base,
    _id: 'memory-private',
    visibility: 'private',
  });
  harness.setCurrentUser('usr_b');
  const result = await harness.handler({
    action: 'listFriendRecentMap',
    payload: { mapAssetVersion: 'campus-map-v3' },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.data.points.map((point) => point.id),
    ['memory-boundary'],
  );
  assert.equal(JSON.stringify(result).includes('text'), false);
  assert.equal(JSON.stringify(result).includes('images'), false);
});

test('friend map paginates at 50 points without repeating the first page', async () => {
  const harness = createHarness();
  for (let index = 0; index < 55; index += 1) {
    const id = `memory-page-${String(index).padStart(2, '0')}`;
    harness.memories.set(id, {
      ...content,
      _id: id,
      ownerUserId: 'usr_a',
      visibility: 'friends',
      selectedGrants: [],
      publishedAt: `2026-08-15T07:${String(index).padStart(2, '0')}:00.000Z`,
      likeCount: 0,
      deletedAt: null,
      createdAt: '2026-08-15T07:00:00.000Z',
      updatedAt: '2026-08-15T07:00:00.000Z',
      images: [],
    });
  }
  harness.setCurrentUser('usr_b');
  const first = await harness.handler({
    action: 'listFriendRecentMap',
    payload: { mapAssetVersion: 'campus-map-v3' },
  });
  const second = await harness.handler({
    action: 'listFriendRecentMap',
    payload: { cursor: first.data.nextCursor, mapAssetVersion: 'campus-map-v3' },
  });
  assert.equal(first.data.points.length, 50);
  assert.equal(second.data.points.length, 5);
  assert.equal(
    first.data.points.some((point) => second.data.points.some((other) => other.id === point.id)),
    false,
  );
});

test('sanitizes unexpected storage failures', async () => {
  const harness = createHarness();
  harness.handler = createMemoryHandler({
    deleteFiles: async () => undefined,
    getTempUrls: async () => [],
    getTrustedContext: () => ({ APPID: 'app', OPENID: 'open-a' }),
    hash: () => 'identity-a',
    newId: () => 'id',
    newRequestId: () => 'req',
    now: () => '2026-08-15T08:00:00.000Z',
    store: {
      findUserByIdentityHash: async () => {
        throw new Error('database secret');
      },
    },
  });
  const result = await harness.handler({ action: 'listMine' });
  assert.deepEqual(result, {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: '云端回忆服务暂时不可用',
    requestId: 'req',
  });
});
