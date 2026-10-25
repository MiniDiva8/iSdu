import assert from 'node:assert/strict';
import test from 'node:test';

import { CloudAuthRepository, CloudAuthRepositoryError } from './cloud-auth-repository.ts';

const USER = {
  avatarFileId: '',
  createdAt: '2026-08-15T08:00:00.000Z',
  displayName: '小忆',
  signature: '留住校园时光',
  updatedAt: '2026-08-15T08:00:00.000Z',
  userId: `usr_${'a'.repeat(32)}`,
};

function createClient(response) {
  const calls = [];
  return {
    calls,
    client: {
      async call(functionName, action, payload) {
        calls.push({ action, functionName, payload });
        return typeof response === 'function' ? response(action, payload) : response;
      },
    },
  };
}

test('parses a successful bootstrap without receiving an OpenID', async () => {
  const gateway = createClient({
    data: { isNew: true, profileComplete: true, user: USER },
    ok: true,
    requestId: 'req_1',
  });
  const repository = new CloudAuthRepository(gateway.client);

  assert.deepEqual(await repository.bootstrap(), {
    isNew: true,
    profileComplete: true,
    user: USER,
  });
  assert.deepEqual(gateway.calls, [
    { action: 'bootstrap', functionName: 'auth-api', payload: undefined },
  ]);
});

test('sends only editable profile fields to the cloud function', async () => {
  const gateway = createClient({ data: { user: USER }, ok: true, requestId: 'req_2' });
  const repository = new CloudAuthRepository(gateway.client);

  await repository.updateMyProfile({ displayName: '小忆', signature: '留住校园时光' });

  assert.deepEqual(gateway.calls[0], {
    action: 'updateMyProfile',
    functionName: 'auth-api',
    payload: { displayName: '小忆', signature: '留住校园时光' },
  });
});

test('turns a public cloud failure into a typed repository error', async () => {
  const gateway = createClient({
    code: 'AUTH_CONTEXT_MISSING',
    message: '无法确认当前微信身份',
    ok: false,
    requestId: 'req_3',
  });
  const repository = new CloudAuthRepository(gateway.client);

  await assert.rejects(repository.bootstrap(), (error) => {
    assert.equal(error instanceof CloudAuthRepositoryError, true);
    assert.equal(error.code, 'AUTH_CONTEXT_MISSING');
    assert.equal(error.requestId, 'req_3');
    return true;
  });
});

test('rejects malformed success data and identity-looking user ids', async () => {
  const malformed = createClient({
    data: { isNew: false, profileComplete: false, user: { ...USER, userId: 'openid-value' } },
    ok: true,
    requestId: 'req_4',
  });
  const repository = new CloudAuthRepository(malformed.client);

  await assert.rejects(repository.bootstrap(), /用户标识无效/u);
});

test('deletes cloud data with a fixed confirmation value only', async () => {
  const gateway = createClient({
    data: { deleted: true, orphanFileCount: 0 },
    ok: true,
    requestId: 'req_delete',
  });
  const repository = new CloudAuthRepository(gateway.client);
  assert.deepEqual(await repository.deleteCloudAccount(), { deleted: true, orphanFileCount: 0 });
  assert.deepEqual(gateway.calls, [
    {
      action: 'deleteCloudAccount',
      functionName: 'auth-api',
      payload: { confirmation: 'DELETE_MY_CLOUD_DATA' },
    },
  ]);
});
