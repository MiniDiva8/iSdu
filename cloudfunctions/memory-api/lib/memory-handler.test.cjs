'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createMemoryHandler } = require('./memory-handler');

function createHarness() {
  const users = [{ _id: 'usr_a', identityHash: 'identity-a', status: 'active', displayName: 'A' }];
  const memories = new Map();
  const migrations = new Map();
  const plans = new Map();
  let sequence = 0;
  const options = {
    deleteFiles: async () => undefined,
    getTempUrls: async (fileIds) => fileIds.map((_, index) => `https://temp.invalid/${index}`),
    getTrustedContext: () => ({ APPID: 'app', OPENID: 'open-a' }),
    hash: (value) => (value === 'app\0open-a' ? 'identity-a' : `hash:${value}`),
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
    },
  };
  return { handler: createMemoryHandler(options), memories, plans };
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
