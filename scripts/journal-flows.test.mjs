import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import { cloudModeService } from '../miniprogram/services/cloud/cloud-mode-service.ts';
const definitions = new Map();
const storage = new Map();
const navigation = [];
let current = '';
globalThis.Page = (definition) => definitions.set(current, definition);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  getStorageSync: (key) => storage.get(key) ?? '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  navigateTo: (options) => {
    navigation.push(options.url);
    return Promise.resolve({});
  },
  switchTab: (options) => {
    navigation.push(options.url);
    return Promise.resolve({});
  },
  showToast: () => Promise.resolve(),
  previewImage: () => Promise.resolve(),
};
for (const name of ['journal', 'album']) {
  current = name;
  try {
    await import('../miniprogram/pages/' + name + '/index.ts');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
}
function page(name) {
  const definition = definitions.get(name);
  assert.ok(definition, 'Page ' + name + ' must be registered');
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}
const memory = (extra = {}) => ({
  id: 'entry',
  text: '图书馆的一天',
  imagePaths: [],
  placeName: '图书馆',
  mood: 'happy',
  customMood: '',
  category: 'study',
  customCategory: '',
  mapAssetVersion: 'journal-unlocated-v1',
  mapXRatio: 0,
  mapYRatio: 0,
  recordedAt: '2024-02-29T04:00:00.000Z',
  createdAt: '2024-02-29T04:00:00.000Z',
  updatedAt: '2024-02-29T04:00:00.000Z',
  origin: 'user',
  ...extra,
});
beforeEach(() => {
  storage.clear();
  navigation.length = 0;
});
test('journal month opens all entries from the same day', async (t) => {
  const home = page('journal');
  home.data.monthKey = '2024-02';
  t.mock.method(memoryRepository, 'listMemories', async () => [
    memory({ id: 'first' }),
    memory({ id: 'second', recordedAt: '2024-02-29T05:00:00.000Z' }),
  ]);
  await home.loadJournal();
  assert.equal(home.data.days.length, 29);
  home.openDay({ currentTarget: { dataset: { key: '2024-02-29' } } });
  assert.equal(home.data.showDaySheet, true);
  assert.deepEqual(new Set(home.data.dayEntries.map((x) => x.id)), new Set(['first', 'second']));
});
test('empty day and selected mood start an explicitly unlocated journal', async (t) => {
  const home = page('journal');
  home.data.monthKey = '2024-02';
  t.mock.method(memoryRepository, 'listMemories', async () => []);
  await home.loadJournal();
  home.openDay({ currentTarget: { dataset: { key: '2024-02-20' } } });
  assert.equal(home.data.showMoodPicker, true);
  home.chooseMood({ currentTarget: { dataset: { value: 'happy' } } });
  assert.match(navigation.at(-1), /source=journal/);
  assert.match(navigation.at(-1), /date=2024-02-20/);
  assert.match(navigation.at(-1), /mood=happy/);
});
test('failed reload clears stale entries when changing to cloud mode', async (t) => {
  const home = page('journal');
  home.data.memories = [memory()];
  home.data.dayEntries = [memory()];
  cloudModeService.acceptPrivacy();
  cloudModeService.activateCloud();
  t.mock.method(memoryRepository, 'listMemories', async () => {
    throw new Error('网络暂不可用');
  });
  await home.loadJournal();
  assert.equal(home.data.memories.length, 0);
  assert.equal(home.data.dayEntries.length, 0);
  assert.match(home.data.errorMessage, /网络/);
});
test('album keeps every image and links to its owning diary', async (t) => {
  const album = page('album');
  album.data.monthKey = '2024-02';
  t.mock.method(memoryRepository, 'listMemories', async () => [
    memory({ id: 'a', imagePaths: ['/a1.jpg', '/a2.jpg'] }),
    memory({ id: 'b', imagePaths: ['/b.jpg'] }),
  ]);
  await album.loadPhotos();
  assert.equal(album.data.photos.length, 3);
  album.openDiary({ currentTarget: { dataset: { memoryId: 'b' } } });
  assert.match(navigation.at(-1), /memoryId=b/);
});
test('journal search finds content outside the displayed month', async (t) => {
  const home = page('journal');
  home.data.monthKey = '2026-10';
  t.mock.method(memoryRepository, 'listMemories', async () => [memory({ id: 'old' })]);
  await home.loadJournal();
  home.handleSearchInput({ detail: { value: '图书馆' } });
  assert.equal(home.data.searchResults[0].id, 'old');
});

test('journal ignores an older failed request after a newer month has loaded', async (t) => {
  const home = page('journal');
  let rejectFirst;
  let calls = 0;
  t.mock.method(memoryRepository, 'listMemories', () => {
    calls += 1;
    if (calls === 1)
      return new Promise((_, reject) => {
        rejectFirst = reject;
      });
    return Promise.resolve([memory({ id: 'newest' })]);
  });
  home.data.monthKey = '2024-01';
  const first = home.loadJournal();
  home.data.monthKey = '2024-02';
  await home.loadJournal();
  rejectFirst(new Error('old request failed'));
  await first;
  assert.equal(home.data.errorMessage, '');
  assert.equal(home.data.memories[0].id, 'newest');
  assert.equal(home.data.days.length, 29);
});

test('album ignores an older successful request after a newer request failed', async (t) => {
  const album = page('album');
  album.data.monthKey = '2024-02';
  let resolveFirst;
  let calls = 0;
  t.mock.method(memoryRepository, 'listMemories', () => {
    calls += 1;
    if (calls === 1)
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    return Promise.reject(new Error('current request failed'));
  });
  const first = album.loadPhotos();
  await album.loadPhotos();
  resolveFirst([memory({ imagePaths: ['/old.jpg'] })]);
  await first;
  assert.deepEqual(album.data.photos, []);
  assert.match(album.data.errorMessage, /current/);
});
