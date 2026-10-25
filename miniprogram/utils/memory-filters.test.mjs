import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EMPTY_MEMORY_FILTERS,
  countActiveMemoryFilters,
  filterMemories,
} from './memory-filters.ts';

function createMemory(overrides = {}) {
  return {
    id: 'memory-default',
    text: '图书馆前的晚霞',
    imagePaths: [],
    placeName: '中心校区图书馆',
    mood: 'calm',
    customMood: '',
    category: 'study',
    customCategory: '',
    mapAssetVersion: 'campus-map-v3',
    mapXRatio: 0.5,
    mapYRatio: 0.5,
    recordedAt: new Date(2026, 7, 13, 10).toISOString(),
    origin: 'user',
    createdAt: new Date(2026, 7, 13, 10).toISOString(),
    updatedAt: new Date(2026, 7, 13, 10).toISOString(),
    ...overrides,
  };
}

function filters(overrides = {}) {
  return { ...EMPTY_MEMORY_FILTERS, ...overrides };
}

const now = new Date(2026, 7, 13, 15, 30);

test('searches text, place, mood and topic labels with multiple terms', () => {
  const memories = [
    createMemory({ id: 'library' }),
    createMemory({ id: 'friend', text: '一起吃饭', placeName: '食堂', mood: 'happy' }),
  ];

  assert.deepEqual(
    filterMemories(memories, filters({ keyword: '图书馆 晚霞' }), now).map((memory) => memory.id),
    ['library'],
  );
  assert.equal(filterMemories(memories, filters({ keyword: '开心' }), now)[0]?.id, 'friend');
  assert.equal(filterMemories(memories, filters({ keyword: '学习成长' }), now)[0]?.id, 'library');
});

test('searches custom mood and content topic labels', () => {
  const memory = createMemory({
    category: 'custom',
    customCategory: '比赛准备',
    mood: 'custom',
    customMood: '忐忑又期待',
  });

  assert.equal(filterMemories([memory], filters({ keyword: '比赛准备' }), now).length, 1);
  assert.equal(filterMemories([memory], filters({ keyword: '期待' }), now).length, 1);
});

test('filters the previous 24 hours', () => {
  const memories = [
    createMemory({ id: 'inside', recordedAt: new Date(2026, 7, 12, 15, 30).toISOString() }),
    createMemory({ id: 'outside', recordedAt: new Date(2026, 7, 12, 15, 29).toISOString() }),
  ];

  assert.deepEqual(
    filterMemories(memories, filters({ datePreset: 'day' }), now).map((memory) => memory.id),
    ['inside'],
  );
});

test('filters inclusive seven-day and thirty-day rolling windows', () => {
  const memories = [
    createMemory({ id: 'today', recordedAt: new Date(2026, 7, 13, 12).toISOString() }),
    createMemory({ id: 'week-edge', recordedAt: new Date(2026, 7, 6, 15, 30).toISOString() }),
    createMemory({ id: 'week-out', recordedAt: new Date(2026, 7, 6, 15, 29).toISOString() }),
    createMemory({ id: 'month-edge', recordedAt: new Date(2026, 6, 14, 15, 30).toISOString() }),
    createMemory({ id: 'month-out', recordedAt: new Date(2026, 6, 14, 15, 29).toISOString() }),
  ];

  assert.deepEqual(
    filterMemories(memories, filters({ datePreset: 'week' }), now).map((memory) => memory.id),
    ['today', 'week-edge'],
  );
  assert.deepEqual(
    filterMemories(memories, filters({ datePreset: 'month' }), now).map((memory) => memory.id),
    ['today', 'week-edge', 'week-out', 'month-edge'],
  );
});

test('uses an inclusive custom date range', () => {
  const memories = [
    createMemory({ id: 'before', recordedAt: new Date(2026, 7, 7, 23, 59).toISOString() }),
    createMemory({ id: 'start', recordedAt: new Date(2026, 7, 8, 0).toISOString() }),
    createMemory({ id: 'end', recordedAt: new Date(2026, 7, 10, 23, 59).toISOString() }),
    createMemory({ id: 'after', recordedAt: new Date(2026, 7, 11, 0).toISOString() }),
  ];

  assert.deepEqual(
    filterMemories(
      memories,
      filters({
        customEndDate: '2026-08-10',
        customStartDate: '2026-08-08',
        datePreset: 'custom',
      }),
      now,
    ).map((memory) => memory.id),
    ['start', 'end'],
  );
});

test('combines mood and content topic filters without mutating input', () => {
  const memories = [
    createMemory({ id: 'match', mood: 'happy', category: 'friendship' }),
    createMemory({ id: 'wrong-mood', mood: 'calm', category: 'friendship' }),
    createMemory({ id: 'wrong-topic', mood: 'happy', category: 'study' }),
  ];
  const snapshot = structuredClone(memories);

  assert.deepEqual(
    filterMemories(memories, filters({ mood: 'happy', category: 'friendship' }), now).map(
      (memory) => memory.id,
    ),
    ['match'],
  );
  assert.deepEqual(memories, snapshot);
});

test('counts active filter dimensions', () => {
  assert.equal(countActiveMemoryFilters(EMPTY_MEMORY_FILTERS), 0);
  assert.equal(
    countActiveMemoryFilters(
      filters({ category: 'study', datePreset: 'week', keyword: '图书馆', mood: 'calm' }),
    ),
    4,
  );
});
