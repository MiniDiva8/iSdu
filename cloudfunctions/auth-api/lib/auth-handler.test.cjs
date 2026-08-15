'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const { createAuthHandler } = require('./auth-handler');

const FIXED_NOW = '2026-08-15T08:00:00.000Z';

function hashIdentity(appId, openId) {
  return crypto.createHash('sha256').update(appId).update('\0').update(openId).digest('hex');
}

function createMemoryStore(initialUsers = []) {
  const users = new Map(initialUsers.map((user) => [user.identityHash, { ...user }]));
  const deletedUserIds = [];

  return {
    store: {
      async create(user) {
        if (users.has(user.identityHash)) {
          throw new Error('duplicate identity');
        }
        users.set(user.identityHash, { ...user });
      },
      async findByIdentityHash(identityHash) {
        const user = users.get(identityHash);
        return user ? { ...user } : null;
      },
      async updateProfile(userId, profile) {
        const entry = [...users.entries()].find(([, user]) => user.userId === userId);
        if (!entry) {
          throw new Error('missing user');
        }
        users.set(entry[0], { ...entry[1], ...profile });
      },
      async deleteAccount(userId) {
        const entry = [...users.entries()].find(([, user]) => user.userId === userId);
        if (!entry) throw new Error('missing user');
        users.delete(entry[0]);
        deletedUserIds.push(userId);
        return { fileIds: ['cloud://env/private-photo.jpg'] };
      },
    },
    deletedUserIds,
    users,
  };
}

function createHandler(options = {}) {
  const memory = options.memory ?? createMemoryStore();
  let nextUser = 1;
  let nextRequest = 1;

  return {
    handler: createAuthHandler({
      deleteFiles: options.deleteFiles ?? (async () => undefined),
      getTrustedContext:
        options.getTrustedContext ?? (() => ({ APPID: 'wx-app', OPENID: 'openid-a' })),
      hashIdentity,
      newRequestId: () => `req_${String(nextRequest++).padStart(24, '0')}`,
      newUserId: () => `usr_${String(nextUser++).padStart(32, '0')}`,
      now: () => FIXED_NOW,
      userStore: memory.store,
    }),
    memory,
  };
}

test('bootstraps a user only from trusted context and never returns WeChat identity', async () => {
  const { handler, memory } = createHandler();
  const result = await handler({
    action: 'bootstrap',
    payload: { APPID: 'attacker-app', OPENID: 'attacker-openid', openId: 'attacker-openid' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.isNew, true);
  assert.equal(result.data.profileComplete, false);
  assert.match(result.data.user.userId, /^usr_[a-f0-9]{32}$/u);
  assert.equal(memory.users.size, 1);
  assert.equal(memory.users.has(hashIdentity('wx-app', 'openid-a')), true);
  assert.doesNotMatch(JSON.stringify(result), /openid|identityHash|wx-app/iu);
});

test('reuses the same cloud user for repeated bootstrap requests', async () => {
  const { handler } = createHandler();
  const first = await handler({ action: 'bootstrap' });
  const second = await handler({ action: 'bootstrap' });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.data.isNew, false);
  assert.equal(second.data.user.userId, first.data.user.userId);
});

test('rejects a request without a trusted OpenID or AppID', async () => {
  const { handler } = createHandler({ getTrustedContext: () => ({ OPENID: '' }) });
  const result = await handler({ action: 'bootstrap' });

  assert.deepEqual(
    { code: result.code, message: result.message, ok: result.ok },
    { code: 'AUTH_CONTEXT_MISSING', message: '无法确认当前微信身份', ok: false },
  );
});

test('requires bootstrap before profile reads and updates', async () => {
  const { handler } = createHandler();
  const read = await handler({ action: 'getMyProfile' });
  const update = await handler({
    action: 'updateMyProfile',
    payload: { displayName: '小忆', signature: '' },
  });

  assert.equal(read.code, 'USER_NOT_INITIALIZED');
  assert.equal(update.code, 'USER_NOT_INITIALIZED');
});

test('normalizes profile input and returns only public fields', async () => {
  const { handler } = createHandler();
  await handler({ action: 'bootstrap' });
  const updated = await handler({
    action: 'updateMyProfile',
    payload: { displayName: '  山大   小忆 ', signature: ' 留住   校园时光 ' },
  });
  const read = await handler({ action: 'getMyProfile' });

  assert.equal(updated.ok, true);
  assert.equal(updated.data.user.displayName, '山大 小忆');
  assert.equal(updated.data.user.signature, '留住 校园时光');
  assert.deepEqual(read.data.user, updated.data.user);
  assert.deepEqual(Object.keys(updated.data.user).sort(), [
    'avatarFileId',
    'createdAt',
    'displayName',
    'signature',
    'updatedAt',
    'userId',
  ]);
});

test('rejects empty and oversized profile fields', async () => {
  const { handler } = createHandler();
  await handler({ action: 'bootstrap' });

  const emptyName = await handler({
    action: 'updateMyProfile',
    payload: { displayName: '  ', signature: '' },
  });
  const longSignature = await handler({
    action: 'updateMyProfile',
    payload: { displayName: '小忆', signature: '签'.repeat(81) },
  });

  assert.equal(emptyName.code, 'INVALID_DISPLAY_NAME');
  assert.equal(longSignature.code, 'INVALID_SIGNATURE');
});

test('blocks disabled accounts', async () => {
  const identityHash = hashIdentity('wx-app', 'openid-a');
  const memory = createMemoryStore([
    {
      avatarFileId: '',
      createdAt: FIXED_NOW,
      displayName: '小忆',
      identityHash,
      schemaVersion: 1,
      signature: '',
      status: 'disabled',
      updatedAt: FIXED_NOW,
      userId: `usr_${'a'.repeat(32)}`,
    },
  ]);
  const { handler } = createHandler({ memory });
  const result = await handler({ action: 'getMyProfile' });

  assert.equal(result.code, 'ACCOUNT_DISABLED');
});

test('rejects unsupported actions without exposing internal details', async () => {
  const { handler } = createHandler();
  const result = await handler({ action: 'deleteEveryone' });

  assert.equal(result.code, 'UNSUPPORTED_ACTION');
  assert.equal(result.message, '不支持的身份操作');
  assert.match(result.requestId, /^req_/u);
});

test('requires explicit confirmation then deletes only the trusted current account', async () => {
  const deletedFiles = [];
  const { handler, memory } = createHandler({
    deleteFiles: async (fileIds) => deletedFiles.push(...fileIds),
  });
  const bootstrapped = await handler({ action: 'bootstrap' });
  const denied = await handler({ action: 'deleteCloudAccount', payload: {} });
  const deleted = await handler({
    action: 'deleteCloudAccount',
    payload: { confirmation: 'DELETE_MY_CLOUD_DATA', userId: 'usr_attacker' },
  });
  assert.equal(denied.code, 'CONFIRMATION_REQUIRED');
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.data, { deleted: true, orphanFileCount: 0 });
  assert.deepEqual(memory.deletedUserIds, [bootstrapped.data.user.userId]);
  assert.deepEqual(deletedFiles, ['cloud://env/private-photo.jpg']);
  assert.equal(memory.users.size, 0);
});

test('reports orphan cloud files without exposing their addresses', async () => {
  const { handler } = createHandler({
    deleteFiles: async () => {
      throw new Error('storage unavailable');
    },
  });
  await handler({ action: 'bootstrap' });
  const result = await handler({
    action: 'deleteCloudAccount',
    payload: { confirmation: 'DELETE_MY_CLOUD_DATA' },
  });
  assert.deepEqual(result.data, { deleted: true, orphanFileCount: 1 });
  assert.equal(JSON.stringify(result).includes('cloud://'), false);
});

test('sanitizes unexpected storage errors', async () => {
  const memory = createMemoryStore();
  memory.store.findByIdentityHash = async () => {
    throw new Error('database host and private query details');
  };
  const { handler } = createHandler({ memory });
  const result = await handler({ action: 'bootstrap' });

  assert.equal(result.code, 'INTERNAL_ERROR');
  assert.equal(result.message, '云端身份服务暂时不可用，请稍后重试');
  assert.doesNotMatch(JSON.stringify(result), /database host|private query/iu);
});
