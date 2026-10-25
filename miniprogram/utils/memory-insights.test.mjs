import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateMemoryInsights, groupMemoriesByMonth } from './memory-insights.ts';

function createMemory(overrides = {}) {
  return {
    id: 'memory-default',
    text: '一段回忆',
    imagePaths: [],
    placeName: '图书馆',
    mood: 'calm',
    category: 'study',
    mapAssetVersion: 'campus-map-v2',
    mapXRatio: 0.5,
    mapYRatio: 0.5,
    recordedAt: '2026-08-01T10:00:00.000Z',
    origin: 'user',
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

test('groups memories by month in descending date order', () => {
  const groups = groupMemoriesByMonth([
    createMemory({ id: 'july', recordedAt: '2026-07-28T10:00:00.000Z' }),
    createMemory({ id: 'august-old', recordedAt: '2026-08-01T10:00:00.000Z' }),
    createMemory({ id: 'august-new', recordedAt: '2026-08-09T10:00:00.000Z' }),
  ]);

  assert.deepEqual(
    groups.map((group) => ({
      ids: group.memories.map((memory) => memory.id),
      key: group.key,
      title: group.title,
    })),
    [
      { ids: ['august-new', 'august-old'], key: '2026-08', title: '2026年08月' },
      { ids: ['july'], key: '2026-07', title: '2026年07月' },
    ],
  );
});

test('calculates totals, days, named places and the latest memory', () => {
  const insights = calculateMemoryInsights([
    createMemory({ id: 'one', recordedAt: '2026-08-01T09:00:00.000Z' }),
    createMemory({ id: 'two', recordedAt: '2026-08-01T18:00:00.000Z' }),
    createMemory({
      id: 'three',
      placeName: ' 操场 ',
      recordedAt: '2026-08-03T08:00:00.000Z',
    }),
    createMemory({ id: 'four', placeName: '', recordedAt: '2026-08-04T08:00:00.000Z' }),
  ]);

  assert.equal(insights.totalCount, 4);
  assert.equal(insights.userCount, 4);
  assert.equal(insights.demoCount, 0);
  assert.equal(insights.recordedDayCount, 3);
  assert.equal(insights.placeCount, 2);
  assert.equal(insights.mostFrequentPlace, '图书馆');
  assert.equal(insights.mostFrequentPlaceCount, 2);
  assert.equal(insights.recentMemory?.id, 'four');
});

test('returns a safe empty overview', () => {
  assert.deepEqual(calculateMemoryInsights([]), {
    demoCount: 0,
    mostFrequentPlace: null,
    mostFrequentPlaceCount: 0,
    placeCount: 0,
    recentMemory: null,
    recordedDayCount: 0,
    totalCount: 0,
    userCount: 0,
  });
  assert.deepEqual(groupMemoriesByMonth([]), []);
});
