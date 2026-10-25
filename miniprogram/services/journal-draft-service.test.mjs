import assert from 'node:assert/strict';
import { test } from 'node:test';
let api = {};
try {
  api = await import('./journal-draft-service.ts');
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
const draft = () => ({
  text: '明天继续写',
  mood: 'calm',
  customMood: '',
  category: 'campus-life',
  customCategory: '',
  placeName: '图书馆',
  recordedAt: '2026-10-25T04:00:00.000Z',
  mapAssetVersion: 'journal-unlocated-v1',
  xRatio: 0,
  yRatio: 0,
});
function storage() {
  const values = new Map();
  return {
    values,
    has: (k) => values.has(k),
    read: (k) => values.get(k),
    write: (k, v) => values.set(k, v),
    remove: (k) => values.delete(k),
  };
}
test('text draft roundtrips without retaining temporary photo paths', () => {
  assert.equal(typeof api.JournalDraftService, 'function');
  const store = storage();
  const service = new api.JournalDraftService(store);
  service.save({ ...draft(), imagePaths: ['/temporary.jpg'] });
  const restored = service.read();
  assert.equal(restored.text, '明天继续写');
  assert.equal(restored.placeName, '图书馆');
  assert.equal('imagePaths' in restored, false);
  service.clear();
  assert.equal(service.read(), null);
});
test('malformed and unknown draft versions do not load or erase other storage', () => {
  assert.equal(typeof api.JournalDraftService, 'function');
  const store = storage();
  const service = new api.JournalDraftService(store);
  store.write(api.JOURNAL_DRAFT_STORAGE_KEY, 'broken');
  assert.equal(service.read(), null);
  store.write(api.JOURNAL_DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, draft: draft() }));
  assert.equal(service.read(), null);
  assert.equal(store.values.size, 1);
});
test('draft storage rejects invalid mood or coordinates instead of restoring unsafe state', () => {
  assert.equal(typeof api.JournalDraftService, 'function');
  const service = new api.JournalDraftService(storage());
  assert.throws(() => service.save({ ...draft(), mood: 'unknown' }));
  assert.throws(() => service.save({ ...draft(), xRatio: 3 }));
});
