import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MemoryValidationError,
  createMemoryId,
  normalizeCreateMemoryInput,
  sortMemoriesByDate,
} from './memory.ts';

const BASE_INPUT = {
  id: 'memory-test-001',
  text: '图书馆前的晚霞',
  imagePaths: [],
  placeName: '中心校区图书馆',
  mood: 'calm',
  customMood: '',
  category: 'campus-life',
  customCategory: '',
  mapAssetVersion: 'campus-map-v2',
  mapXRatio: 0.42,
  mapYRatio: 0.68,
  recordedAt: '2026-08-11T08:00:00.000Z',
};

test('normalizes a valid text memory', () => {
  const result = normalizeCreateMemoryInput({ ...BASE_INPUT, text: '  晚霞  ' });
  assert.equal(result.text, '晚霞');
});

test('allows a photo-only memory', () => {
  const result = normalizeCreateMemoryInput({
    ...BASE_INPUT,
    text: '',
    imagePaths: ['wxfile://usr/memory.jpg'],
  });
  assert.equal(result.imagePaths.length, 1);
});

test('rejects empty content and invalid ratios', () => {
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, text: '', imagePaths: [] }),
    MemoryValidationError,
  );
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, mapXRatio: 1.2 }),
    MemoryValidationError,
  );
});

test('rejects overly long text and place names', () => {
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, text: '记'.repeat(2001) }),
    MemoryValidationError,
  );
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, placeName: '地'.repeat(61) }),
    MemoryValidationError,
  );
});

test('rejects invalid mood, category and date values', () => {
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, mood: 'unknown' }),
    MemoryValidationError,
  );
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, category: 'unknown' }),
    MemoryValidationError,
  );
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, recordedAt: '2026/08/11' }),
    MemoryValidationError,
  );
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, mapAssetVersion: '../map-v2' }),
    MemoryValidationError,
  );
});

test('supports custom mood and category labels', () => {
  const result = normalizeCreateMemoryInput({
    ...BASE_INPUT,
    mood: 'custom',
    customMood: ' 如释重负 ',
    category: 'custom',
    customCategory: ' 志愿服务 ',
  });

  assert.equal(result.customMood, '如释重负');
  assert.equal(result.customCategory, '志愿服务');
});

test('requires and limits custom labels', () => {
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, mood: 'custom', customMood: '   ' }),
    MemoryValidationError,
  );
  assert.throws(
    () =>
      normalizeCreateMemoryInput({
        ...BASE_INPUT,
        category: 'custom',
        customCategory: '类'.repeat(21),
      }),
    MemoryValidationError,
  );
});

test('sorts memories by recorded date descending', () => {
  const older = {
    ...BASE_INPUT,
    origin: 'user',
    createdAt: '2026-08-10T08:00:00.000Z',
    updatedAt: '2026-08-10T08:00:00.000Z',
  };
  const newer = {
    ...older,
    id: 'memory-test-002',
    recordedAt: '2026-08-12T08:00:00.000Z',
  };

  assert.deepEqual(
    sortMemoriesByDate([older, newer]).map((memory) => memory.id),
    ['memory-test-002', 'memory-test-001'],
  );
});

test('creates deterministic collision-resistant-looking ids', () => {
  assert.equal(createMemoryId(123, 0.5), 'memory-123-800000');
});

test('rejects ids that cannot be used as safe local image directories', () => {
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, id: '../memory' }),
    MemoryValidationError,
  );
  assert.throws(
    () => normalizeCreateMemoryInput({ ...BASE_INPUT, id: '记忆-001' }),
    MemoryValidationError,
  );
});
