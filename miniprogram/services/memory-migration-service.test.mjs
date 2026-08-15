import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryMigrationService } from './memory-migration-service.ts';

const baseMemory = {
  id: 'memory-1',
  text: '测试',
  imagePaths: [],
  placeName: '中心校区',
  mood: 'happy',
  customMood: '',
  category: 'campus-life',
  customCategory: '',
  mapAssetVersion: 'campus-map-v3',
  mapXRatio: 0.5,
  mapYRatio: 0.5,
  recordedAt: '2026-08-15T08:00:00.000Z',
  origin: 'user',
  createdAt: '2026-08-15T08:00:00.000Z',
  updatedAt: '2026-08-15T08:00:00.000Z',
};

test('activates cloud mode only after all user memories migrate', async () => {
  const activated = [];
  const service = new MemoryMigrationService(
    { listMemories: async () => [baseMemory, { ...baseMemory, id: 'demo-1', origin: 'demo' }] },
    { migrateMemory: async (memory) => ({ cloudMemoryId: `cloud-${memory.id}` }) },
    { activateCloud: (at) => activated.push(at) },
  );
  const report = await service.migrateAll();
  assert.equal(report.migrated, 1);
  assert.equal(report.skippedDemo, 1);
  assert.equal(report.failed.length, 0);
  assert.equal(activated.length, 1);
});

test('retains local mode and reports each failed memory', async () => {
  const activated = [];
  const service = new MemoryMigrationService(
    { listMemories: async () => [baseMemory, { ...baseMemory, id: 'memory-2' }] },
    {
      migrateMemory: async (memory) => {
        if (memory.id === 'memory-2') throw new Error('图片丢失');
        return { cloudMemoryId: 'cloud-memory-1' };
      },
    },
    { activateCloud: (at) => activated.push(at) },
  );
  const report = await service.migrateAll();
  assert.equal(report.migrated, 1);
  assert.deepEqual(report.failed, [{ localMemoryId: 'memory-2', message: '图片丢失' }]);
  assert.equal(report.completedAt, null);
  assert.equal(activated.length, 0);
});

test('an empty real-memory set can switch without uploading demo data', async () => {
  let activated = false;
  const service = new MemoryMigrationService(
    { listMemories: async () => [{ ...baseMemory, id: 'demo-1', origin: 'demo' }] },
    {
      migrateMemory: async () => {
        throw new Error('must not run');
      },
    },
    {
      activateCloud: () => {
        activated = true;
      },
    },
  );
  const report = await service.migrateAll();
  assert.equal(report.total, 0);
  assert.equal(report.skippedDemo, 1);
  assert.equal(activated, true);
});

test('corrupt local data stops migration before any cloud write', async () => {
  let cloudWrites = 0;
  let activated = false;
  const corruption = new Error('CORRUPT_DATA');
  const service = new MemoryMigrationService(
    {
      listMemories: async () => {
        throw corruption;
      },
    },
    {
      migrateMemory: async () => {
        cloudWrites += 1;
        return { cloudMemoryId: 'must-not-exist' };
      },
    },
    {
      activateCloud: () => {
        activated = true;
      },
    },
  );

  await assert.rejects(service.migrateAll(), corruption);
  assert.equal(cloudWrites, 0);
  assert.equal(activated, false);
});
