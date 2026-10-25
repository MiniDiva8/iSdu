import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfileSummary } from './profile-summary.ts';
const record = (extra = {}) => ({
  id: 'a',
  text: '',
  mood: 'happy',
  customMood: '',
  imagePaths: [],
  placeName: '',
  category: 'campus-life',
  customCategory: '',
  mapAssetVersion: 'journal-unlocated-v1',
  mapXRatio: 0,
  mapYRatio: 0,
  origin: 'user',
  recordedAt: '2026-10-25T04:00:00.000Z',
  createdAt: '2026-10-25T04:00:00.000Z',
  updatedAt: '2026-10-25T04:00:00.000Z',
  ...extra,
});
test('profile counts actual entries, non-whitespace Unicode characters and distinct days', () => {
  const rows = [
    record({
      id: 'one',
      text: '你好 A😀',
      mapAssetVersion: 'campus-current',
      mapXRatio: 0.54,
      mapYRatio: 0.53,
    }),
    record({ id: 'two', text: '再写' }),
    record({ id: 'yesterday', text: 'A', mood: 'calm', recordedAt: '2026-10-24T04:00:00.000Z' }),
    record({ id: 'earlier', text: 'B', mood: 'sad', recordedAt: '2026-10-23T04:00:00.000Z' }),
    record({
      id: 'demo',
      text: '这段演示不计入',
      origin: 'demo',
      recordedAt: '2026-10-22T04:00:00.000Z',
    }),
  ];
  const before = structuredClone(rows);
  const stats = buildProfileSummary(rows, '2026-10-25T06:00:00.000Z');
  assert.equal(stats.entryCount, 4);
  assert.equal(stats.characterCount, 8);
  assert.equal(stats.recordedDayCount, 3);
  assert.equal(stats.currentStreak, 3);
  assert.equal(stats.campusPlaceCount, 1);
  assert.equal(stats.moodCounts.find((x) => x.mood === 'happy').count, 2);
  assert.deepEqual(rows, before);
});
test('an ongoing streak may end yesterday and a gap or demo does not extend it', () => {
  const stats = buildProfileSummary(
    [
      record({ recordedAt: '2026-10-24T04:00:00.000Z' }),
      record({ id: 'two', recordedAt: '2026-10-23T04:00:00.000Z' }),
      record({ id: 'old', recordedAt: '2026-10-21T04:00:00.000Z' }),
      record({ id: 'demo', origin: 'demo', recordedAt: '2026-10-22T04:00:00.000Z' }),
    ],
    '2026-10-25T06:00:00.000Z',
  );
  assert.equal(stats.currentStreak, 2);
});
test('Beijing midnight and year boundaries use the same dates as the journal wall', () => {
  const stats = buildProfileSummary(
    [
      record({ recordedAt: '2026-12-31T18:00:00.000Z' }),
      record({ id: 'two', recordedAt: '2026-12-30T18:00:00.000Z' }),
    ],
    '2027-01-01T06:00:00.000Z',
  );
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.recordedDayCount, 2);
  assert.equal(buildProfileSummary([], '2027-01-01T06:00:00.000Z').entryCount, 0);
});
