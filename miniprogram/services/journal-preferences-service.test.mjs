import assert from 'node:assert/strict';
import test from 'node:test';
import {
  JournalPreferencesService,
  JOURNAL_PREFERENCES_STORAGE_KEY,
} from './journal-preferences-service.ts';
function setup() {
  const values = new Map();
  const service = new JournalPreferencesService({
    has: (key) => values.has(key),
    read: (key) => values.get(key),
    write: (key, value) => values.set(key, value),
    remove: (key) => values.delete(key),
  });
  return { values, service };
}
test('preferences merge valid defaults and retain only supported metadata', () => {
  const { values, service } = setup();
  assert.deepEqual(service.read(), {
    defaultMood: 'calm',
    defaultCategory: 'campus-life',
    haptics: false,
  });
  service.save({ defaultMood: 'happy' });
  service.save({ defaultCategory: 'study', haptics: true });
  assert.deepEqual(service.read(), {
    defaultMood: 'happy',
    defaultCategory: 'study',
    haptics: true,
  });
  assert.equal(values.size, 1);
  assert.throws(() => service.save({ text: 'a private diary body' }), /偏好/);
});
test('invalid or future stored settings fall back without changing existing storage', () => {
  const { values, service } = setup();
  const raw = JSON.stringify({ schemaVersion: 7, preferences: { defaultMood: 'alien' } });
  values.set(JOURNAL_PREFERENCES_STORAGE_KEY, raw);
  assert.equal(service.read().defaultMood, 'calm');
  assert.equal(values.get(JOURNAL_PREFERENCES_STORAGE_KEY), raw);
  assert.throws(() => service.save({ defaultMood: 'alien' }), /偏好/);
  assert.equal(values.get(JOURNAL_PREFERENCES_STORAGE_KEY), raw);
});
test('clearing preferences only removes their own key and failures are observable', () => {
  const { values, service } = setup();
  values.set('unrelated-draft', 'private');
  service.save({ haptics: true });
  service.clear();
  assert.equal(values.has(JOURNAL_PREFERENCES_STORAGE_KEY), false);
  assert.equal(values.get('unrelated-draft'), 'private');
  const broken = new JournalPreferencesService({
    has: () => false,
    read: () => '',
    write: () => {},
    remove: () => {
      throw Error('busy');
    },
  });
  assert.throws(() => broken.clear(), /busy/);
});
