import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryService } from './memory-service.ts';

function createRepository(label, calls, failure = null) {
  return {
    clearMemories: async () => calls.push(`${label}:clear`),
    createMemory: async () => {
      calls.push(`${label}:create`);
      if (failure) throw failure;
      return { id: `${label}-memory` };
    },
    deleteMemory: async () => calls.push(`${label}:delete`),
    getMemoryById: async () => null,
    listMemories: async () => [],
    updateMemory: async () => ({ id: `${label}-memory` }),
  };
}

test('uses the local repository while cloud mode has not been activated', async () => {
  const calls = [];
  const service = new MemoryService(
    { getState: () => ({ mode: 'local' }) },
    createRepository('local', calls),
    createRepository('cloud', calls),
  );

  await service.createMemory({});
  assert.deepEqual(calls, ['local:create']);
});

test('does not silently write to local storage when a cloud write fails', async () => {
  const calls = [];
  const cloudFailure = new Error('CloudBase unavailable');
  const service = new MemoryService(
    { getState: () => ({ mode: 'cloud' }) },
    createRepository('local', calls),
    createRepository('cloud', calls, cloudFailure),
  );

  await assert.rejects(service.createMemory({}), cloudFailure);
  assert.deepEqual(calls, ['cloud:create']);
});
