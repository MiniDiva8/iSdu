import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocalUserProfileRepository,
  USER_PROFILE_STORAGE_KEY,
  UserProfileRepositoryError,
  parseUserProfileStorage,
} from './local-user-profile-repository.ts';

const FIXED_NOW = '2026-08-13T08:30:00.000Z';

function createStorage(initialValue) {
  let exists = initialValue !== undefined;
  let value = initialValue;

  return {
    adapter: {
      has: () => exists,
      read: () => value,
      remove: (key) => {
        assert.equal(key, USER_PROFILE_STORAGE_KEY);
        exists = false;
        value = undefined;
      },
      write: (key, nextValue) => {
        assert.equal(key, USER_PROFILE_STORAGE_KEY);
        exists = true;
        value = nextValue;
      },
    },
    getValue: () => value,
  };
}

test('returns null before a local profile is created', async () => {
  const storage = createStorage();
  const repository = new LocalUserProfileRepository(storage.adapter, () => FIXED_NOW);
  assert.equal(await repository.getProfile(), null);
});

test('normalizes, saves and reloads a local profile', async () => {
  const storage = createStorage();
  const repository = new LocalUserProfileRepository(
    storage.adapter,
    () => FIXED_NOW,
    '山东大学中心校区',
  );
  const saved = await repository.saveProfile({
    displayName: '  山大   小忆  ',
    signature: '  把校园里的每一天   好好收起来  ',
  });

  assert.deepEqual(saved, {
    campusName: '山东大学中心校区',
    displayName: '山大 小忆',
    signature: '把校园里的每一天 好好收起来',
    updatedAt: FIXED_NOW,
  });
  assert.deepEqual(await repository.getProfile(), saved);
  assert.equal(parseUserProfileStorage(storage.getValue()).displayName, '山大 小忆');
});

test('clears a saved local profile', async () => {
  const storage = createStorage();
  const repository = new LocalUserProfileRepository(storage.adapter, () => FIXED_NOW);
  await repository.saveProfile({ displayName: '小忆', signature: '留住校园时光' });

  await repository.clearProfile();

  assert.equal(await repository.getProfile(), null);
});

test('rejects an empty or overly long display name', async () => {
  const repository = new LocalUserProfileRepository(createStorage().adapter, () => FIXED_NOW);
  await assert.rejects(
    repository.saveProfile({ displayName: '   ', signature: '' }),
    /取一个名字/u,
  );
  await assert.rejects(
    repository.saveProfile({
      displayName: '这是一段超过二十个汉字长度限制的用户名字测试',
      signature: '',
    }),
    /不能超过 20 字/u,
  );
});

test('rejects an overly long signature', async () => {
  const repository = new LocalUserProfileRepository(createStorage().adapter, () => FIXED_NOW);
  await assert.rejects(
    repository.saveProfile({ displayName: '小忆', signature: '签'.repeat(81) }),
    /不能超过 80 字/u,
  );
});

test('reports corrupted local profile data without overwriting it', async () => {
  const storage = createStorage('{broken-json');
  const repository = new LocalUserProfileRepository(storage.adapter, () => FIXED_NOW);

  await assert.rejects(
    repository.getProfile(),
    (error) => error instanceof UserProfileRepositoryError && error.code === 'CORRUPT_DATA',
  );
  assert.equal(storage.getValue(), '{broken-json');
});

test('reports storage write failures', async () => {
  const repository = new LocalUserProfileRepository(
    {
      has: () => false,
      read: () => '',
      remove: () => {},
      write: () => {
        throw new Error('quota exceeded');
      },
    },
    () => FIXED_NOW,
  );

  await assert.rejects(
    repository.saveProfile({ displayName: '小忆', signature: '' }),
    (error) => error instanceof UserProfileRepositoryError && error.code === 'WRITE_FAILED',
  );
});

test('reports profile deletion failures', async () => {
  const repository = new LocalUserProfileRepository(
    {
      has: () => true,
      read: () => '',
      remove: () => {
        throw new Error('storage locked');
      },
      write: () => {},
    },
    () => FIXED_NOW,
  );

  await assert.rejects(
    repository.clearProfile(),
    (error) => error instanceof UserProfileRepositoryError && error.code === 'DELETE_FAILED',
  );
});
