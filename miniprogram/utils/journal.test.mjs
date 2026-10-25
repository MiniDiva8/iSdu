import assert from 'node:assert/strict';
import { test } from 'node:test';
let api = {};
try {
  api = await import('./journal.ts');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const memory = (extra = {}) => ({
  id: 'entry',
  text: '记住今天',
  imagePaths: [],
  placeName: '',
  mood: 'happy',
  customMood: '',
  category: 'campus-life',
  customCategory: '',
  mapAssetVersion: 'journal-unlocated-v1',
  mapXRatio: 0,
  mapYRatio: 0,
  recordedAt: '2024-02-29T05:00:00.000Z',
  origin: 'user',
  createdAt: '2024-02-29T05:00:00.000Z',
  updatedAt: '2024-02-29T05:00:00.000Z',
  ...extra,
});
test('journal day keys use Beijing midnight and reject invalid timestamps', () => {
  assert.equal(typeof api.getJournalDayKey, 'function');
  assert.equal(api.getJournalDayKey('2026-10-25T16:30:00.000Z'), '2026-10-26');
  assert.equal(api.getJournalDayKey('2026-10-25T15:59:59.000Z'), '2026-10-25');
  assert.throws(() => api.getJournalDayKey('not-a-date'), RangeError);
});
test('month wall includes leap day and keeps the latest of multiple entries per day', () => {
  assert.equal(typeof api.buildJournalMonth, 'function');
  const entries = [
    memory({ id: 'early', imagePaths: ['/a.jpg'] }),
    memory({
      id: 'late',
      mood: 'calm',
      recordedAt: '2024-02-29T07:00:00.000Z',
      imagePaths: ['/b.jpg', '/c.jpg'],
    }),
    memory({ id: 'next', recordedAt: '2024-03-01T05:00:00.000Z' }),
  ];
  const model = api.buildJournalMonth(entries, '2024-02', '2024-03-04T05:00:00.000Z');
  assert.equal(model.days.length, 29);
  assert.equal(model.entryCount, 2);
  assert.equal(model.recordedDays, 1);
  assert.equal(model.days[28].memoryId, 'late');
  assert.equal(model.days[28].count, 2);
  assert.equal(model.days[28].mood, 'calm');
  assert.equal(model.photos.length, 3);
  assert.deepEqual(new Set(model.photos.map((x) => x.memoryId)), new Set(['early', 'late']));
  assert.equal(entries[0].id, 'early', 'view model must not reorder repository data');
});
test('empty and future days remain distinct from recorded days', () => {
  assert.equal(typeof api.buildJournalMonth, 'function');
  const model = api.buildJournalMonth([], '2026-10', '2026-10-25T04:00:00.000Z');
  assert.equal(model.days[24].isToday, true);
  assert.equal(model.days[24].isFuture, false);
  assert.equal(model.days[25].isFuture, true);
  assert.equal(model.days[24].memoryId, '');
});
test('month stepping crosses years and validates month input', () => {
  assert.equal(typeof api.shiftJournalMonth, 'function');
  assert.equal(api.shiftJournalMonth('2026-01', -1), '2025-12');
  assert.equal(api.shiftJournalMonth('2026-12', 1), '2027-01');
  assert.throws(() => api.shiftJournalMonth('2026-13', 1), RangeError);
});
test('new journal timestamps preserve today and use Beijing noon for a historical day', () => {
  assert.equal(typeof api.createJournalTimestamp, 'function');
  const now = '2026-10-25T08:30:00.000Z';
  assert.equal(api.createJournalTimestamp('2026-10-25', now), now);
  assert.equal(api.createJournalTimestamp('2024-02-29', now), '2024-02-29T04:00:00.000Z');
  assert.throws(() => api.createJournalTimestamp('2026-02-29', now), RangeError);
  assert.throws(() => api.createJournalTimestamp('2026-10-26', now), RangeError);
});
test('unlocated journals have an explicit marker and legacy campus memories stay located', () => {
  assert.equal(typeof api.hasJournalLocation, 'function');
  assert.equal(api.JOURNAL_UNLOCATED_MAP_VERSION, 'journal-unlocated-v1');
  assert.equal(api.hasJournalLocation(memory()), false);
  assert.equal(api.hasJournalLocation(memory({ mapAssetVersion: 'campus-v1' })), true);
});
