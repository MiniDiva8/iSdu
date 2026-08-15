import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LocalMemoryRepository,
  MEMORY_STORAGE_KEY,
  parseMemoryStorage,
} from './local-memory-repository.ts';
import { LEGACY_MAP_ASSET_VERSION } from '../../config/campus-map.ts';
import { MemoryRepositoryError } from './memory-repository.ts';

const FIXED_NOW = '2026-08-11T10:00:00.000Z';
const MISSING_STORAGE_VALUE = Symbol('missing-storage-value');

function createInput(id, recordedAt = FIXED_NOW) {
  return {
    id,
    text: `日记 ${id}`,
    imagePaths: [],
    placeName: '中心校区',
    mood: 'happy',
    customMood: '',
    category: 'study',
    customCategory: '',
    mapAssetVersion: 'campus-map-v2',
    mapXRatio: 0.5,
    mapYRatio: 0.5,
    recordedAt,
  };
}

function createStorage(initialValue = MISSING_STORAGE_VALUE) {
  let exists = initialValue !== MISSING_STORAGE_VALUE;
  let value = exists ? initialValue : '';

  return {
    adapter: {
      has: () => exists,
      read: () => value,
      remove: () => {
        exists = false;
        value = '';
      },
      write: (_key, nextValue) => {
        exists = true;
        value = nextValue;
      },
    },
    getValue: () => value,
  };
}

test('reads an empty repository', async () => {
  const storage = createStorage();
  const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);
  assert.deepEqual(await repository.listMemories(), []);
});

test('seeds demo memories only when the storage key has never existed', async () => {
  const storage = createStorage();
  const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);
  const demoMemory = {
    ...createInput('demo-memory-001'),
    origin: 'demo',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  assert.equal(await repository.initializeDemoMemories([demoMemory]), true);
  assert.equal((await repository.listMemories())[0]?.origin, 'demo');
  assert.equal(await repository.initializeDemoMemories([demoMemory]), false);

  await repository.deleteMemory('demo-memory-001');
  assert.equal(await repository.initializeDemoMemories([demoMemory]), false);
  assert.deepEqual(await repository.listMemories(), []);
});

test('does not overwrite an existing empty or null storage value with demo data', async () => {
  const demoMemory = {
    ...createInput('demo-memory-001'),
    origin: 'demo',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  for (const damagedValue of ['', null]) {
    const storage = createStorage(damagedValue);
    const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);

    assert.equal(await repository.initializeDemoMemories([demoMemory]), false);
    await assert.rejects(
      repository.listMemories(),
      (error) => error instanceof MemoryRepositoryError && error.code === 'CORRUPT_DATA',
    );
  }
});

test('creates, reads, updates and deletes a memory', async () => {
  const storage = createStorage();
  const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);
  const created = await repository.createMemory(createInput('memory-001'));
  assert.equal(created.id, 'memory-001');
  assert.equal((await repository.getMemoryById('memory-001'))?.text, '日记 memory-001');

  const updated = await repository.updateMemory('memory-001', {
    ...createInput('ignored'),
    text: '修改后的日记',
  });
  assert.equal(updated.text, '修改后的日记');

  await repository.deleteMemory('memory-001');
  assert.equal(await repository.getMemoryById('memory-001'), null);
});

test('clears all memories while keeping an explicit empty snapshot', async () => {
  const storage = createStorage();
  const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);
  await repository.createMemory(createInput('memory-001'));
  await repository.createMemory(createInput('memory-002'));

  await repository.clearMemories();

  assert.deepEqual(await repository.listMemories(), []);
  assert.equal(JSON.parse(storage.getValue()).schemaVersion, 3);
  assert.deepEqual(JSON.parse(storage.getValue()).memories, []);
});

test('sorts repository results by recorded date', async () => {
  const storage = createStorage();
  const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);
  await repository.createMemory(createInput('older', '2026-08-10T10:00:00.000Z'));
  await repository.createMemory(createInput('newer', '2026-08-12T10:00:00.000Z'));
  assert.deepEqual(
    (await repository.listMemories()).map((memory) => memory.id),
    ['newer', 'older'],
  );
});

test('rejects duplicate and missing ids', async () => {
  const storage = createStorage();
  const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);
  await repository.createMemory(createInput('memory-001'));
  await assert.rejects(
    repository.createMemory(createInput('memory-001')),
    (error) => error instanceof MemoryRepositoryError && error.code === 'DUPLICATE_ID',
  );
  await assert.rejects(
    repository.updateMemory('missing', createInput('ignored')),
    (error) => error instanceof MemoryRepositoryError && error.code === 'NOT_FOUND',
  );
});

test('rejects malformed ids before reading or deleting records', async () => {
  const storage = createStorage();
  const repository = new LocalMemoryRepository(storage.adapter, () => FIXED_NOW);

  await assert.rejects(
    repository.getMemoryById('../memory'),
    (error) => error instanceof MemoryRepositoryError && error.code === 'INVALID_ID',
  );
  await assert.rejects(
    repository.deleteMemory(''),
    (error) => error instanceof MemoryRepositoryError && error.code === 'INVALID_ID',
  );
});

test('migrates schema v1 records to an explicit legacy map version', () => {
  const legacyMemory = {
    ...createInput('legacy-memory'),
    origin: 'user',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  delete legacyMemory.mapAssetVersion;
  delete legacyMemory.customMood;
  delete legacyMemory.customCategory;

  const [parsed] = parseMemoryStorage({
    schemaVersion: 1,
    updatedAt: FIXED_NOW,
    memories: [legacyMemory],
  });

  assert.equal(parsed?.mapAssetVersion, LEGACY_MAP_ASSET_VERSION);
  assert.equal(parsed?.customMood, '');
  assert.equal(parsed?.customCategory, '');
});

test('reads schema v2 records without custom labels', () => {
  const previousMemory = {
    ...createInput('schema-two-memory'),
    origin: 'user',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  delete previousMemory.customMood;
  delete previousMemory.customCategory;

  const [parsed] = parseMemoryStorage({
    schemaVersion: 2,
    updatedAt: FIXED_NOW,
    memories: [previousMemory],
  });

  assert.equal(parsed?.customMood, '');
  assert.equal(parsed?.customCategory, '');
});

test('rejects corrupted JSON and unsupported schemas without overwriting', () => {
  assert.throws(
    () => parseMemoryStorage('{broken'),
    (error) => error instanceof MemoryRepositoryError && error.code === 'CORRUPT_DATA',
  );
  assert.throws(
    () =>
      parseMemoryStorage({
        schemaVersion: 99,
        updatedAt: FIXED_NOW,
        memories: [],
      }),
    (error) => error instanceof MemoryRepositoryError && error.code === 'UNSUPPORTED_SCHEMA',
  );
});

test('rejects duplicated ids in a stored snapshot', () => {
  const duplicate = {
    ...createInput('duplicate-memory'),
    origin: 'user',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };

  assert.throws(
    () =>
      parseMemoryStorage({
        schemaVersion: 2,
        updatedAt: FIXED_NOW,
        memories: [duplicate, { ...duplicate }],
      }),
    (error) => error instanceof MemoryRepositoryError && error.code === 'CORRUPT_DATA',
  );
});

test('keeps the previous snapshot when storage writing fails', async () => {
  const initialStorage = createStorage();
  const initialRepository = new LocalMemoryRepository(initialStorage.adapter, () => FIXED_NOW);
  await initialRepository.createMemory(createInput('existing'));
  const oldValue = initialStorage.getValue();
  const failingStorage = {
    has: () => true,
    read: () => oldValue,
    remove: () => {},
    write: () => {
      throw new Error('disk full');
    },
  };
  const repository = new LocalMemoryRepository(failingStorage, () => FIXED_NOW);

  await assert.rejects(
    repository.createMemory(createInput('new-memory')),
    (error) => error instanceof MemoryRepositoryError && error.code === 'STORAGE_WRITE_FAILED',
  );
  assert.equal(initialStorage.getValue(), oldValue);
});

test('writes the versioned storage key', async () => {
  let writtenKey = '';
  let writtenValue = '';
  const storage = {
    has: () => false,
    read: () => '',
    remove: () => {},
    write: (key, value) => {
      writtenKey = key;
      writtenValue = value;
    },
  };
  const repository = new LocalMemoryRepository(storage, () => FIXED_NOW);
  await repository.createMemory(createInput('memory-001'));
  assert.equal(writtenKey, MEMORY_STORAGE_KEY);
  assert.equal(JSON.parse(writtenValue).schemaVersion, 3);
});
