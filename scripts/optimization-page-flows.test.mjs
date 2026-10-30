import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import { cloudMemoryRepository } from '../miniprogram/services/repository/cloud-memory-repository.ts';
import { cloudModeService } from '../miniprogram/services/cloud/cloud-mode-service.ts';
import { setMapFocusIntent } from '../miniprogram/services/map-focus-intent.ts';
import { campusMapConfig } from '../miniprogram/config/campus-map.ts';
const storage = new Map(),
  definitions = new Map();
let active;
globalThis.Page = (definition) => definitions.set(active, definition);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  getStorageSync: (key) => storage.get(key) ?? '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
};
for (const name of ['timeline', 'map']) {
  active = name;
  await import('../miniprogram/pages/' + name + '/index.ts');
}
function page(name) {
  const def = definitions.get(name);
  return {
    ...def,
    data: structuredClone(def.data),
    patches: [],
    setData(patch, callback) {
      this.patches.push(structuredClone(patch));
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/gu, '.$1').split('.');
        let target = this.data;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts.at(-1)] = value;
      }
      callback?.();
    },
  };
}
const entry = (id) => ({
  id,
  text: '校园日记'.repeat(100),
  imagePaths: [],
  placeName: '',
  mood: 'happy',
  customMood: '',
  category: 'study',
  customCategory: '',
  origin: 'user',
  mapAssetVersion: 'journal-unlocated-v1',
  mapXRatio: 0,
  mapYRatio: 0,
  createdAt: '2026-10-28T06:00:00Z',
  updatedAt: '2026-10-28T06:00:00Z',
  recordedAt: '2026-10-28T06:00:00Z',
});
const friendEntry = (id) => ({
  ...entry(id),
  ownerDisplayName: '同学',
  publishedAt: '2026-10-28T06:00:00Z',
  summary: '分享',
  hasImage: false,
  thumbnailUrl: '',
  likeCount: 0,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => {
  storage.clear();
  memoryRepository.invalidateList();
});

const titleCases = [
  { id: 'happy', placeName: '', mood: 'happy', customMood: '', expected: '开心' },
  { id: 'relaxed', placeName: '', mood: 'relaxed', customMood: '', expected: '放松' },
  {
    id: 'custom',
    placeName: '',
    mood: 'custom',
    customMood: ' 松了一口气 ',
    expected: '松了一口气',
  },
  { id: 'place', placeName: ' 体育馆 ', mood: 'happy', customMood: '', expected: '体育馆' },
  { id: 'blank-place', placeName: '   ', mood: 'calm', customMood: '', expected: '平静' },
];

test('my timeline titles prefer the entered place and otherwise show the actual mood', () => {
  const target = page('timeline');
  target.applyKeywordSearch(
    titleCases.map((item) => ({ ...entry(item.id), ...item })),
    '',
    {
      isLoading: false,
      replaceMemories: true,
    },
  );
  const byId = new Map(
    target.data.groups.flatMap((group) => group.items).map((item) => [item.id, item]),
  );
  for (const item of titleCases) {
    assert.equal(byId.get(item.id).placeLabel, item.expected);
  }
  assert.equal(
    byId.get('place').hasLocation,
    false,
    'a manually entered place remains the title without map coordinates',
  );
});

test('friend timeline titles use the same place and standard or custom mood rule', async (t) => {
  cloudModeService.activateCloud();
  t.mock.method(cloudMemoryRepository, 'listFriendTimeline', async () => ({
    items: titleCases.map((item) => ({ ...friendEntry(item.id), ...item })),
    nextCursor: null,
  }));
  const target = page('timeline');
  await target.loadFriendTimeline(true);
  const byId = new Map(target.data.friendItems.map((item) => [item.id, item]));
  for (const item of titleCases) assert.equal(byId.get(item.id).placeLabel, item.expected);
});

test('timeline search does not resend the complete private diary collection through setData', () => {
  const target = page('timeline');
  target.data.allMemories = Array.from({ length: 500 }, (_, i) => entry(String(i)));
  target.handleKeywordInput({ detail: { value: 'no-match' } });
  assert.equal(target.data.resultCount, 0);
  assert.ok(target.patches.every((p) => !Object.hasOwn(p, 'allMemories')));
  assert.ok(JSON.stringify(target.patches).length < 1024);
});
test('timeline image failure updates only the affected view item', () => {
  const target = page('timeline');
  target.applyKeywordSearch([entry('first'), entry('second')], '', {
    isLoading: false,
    replaceMemories: true,
  });
  target.patches = [];
  target.handleImageError({ currentTarget: { dataset: { memoryId: 'second' } } });
  assert.equal(target.data.groups[0].items[1].imageFailed, true);
  assert.equal(target.data.groups[0].items[0].imageFailed, false);
  assert.ok(JSON.stringify(target.patches).length < 100);
});
test('friend timeline ignores replies from a previous cloud session', async (t) => {
  cloudModeService.activateCloud();
  const target = page('timeline'),
    pending = deferred();
  t.mock.method(cloudMemoryRepository, 'listFriendTimeline', () => pending.promise);
  const loading = target.loadFriendTimeline(true);
  cloudModeService.resetToLocal();
  pending.resolve({ items: [friendEntry('old')], nextCursor: null });
  await loading;
  assert.deepEqual(target.data.friendItems, []);
  assert.equal(target.data.isFriendLoading, false);
});
test('friend timeline hidden requests cannot overwrite a new request on return', async (t) => {
  cloudModeService.activateCloud();
  const target = page('timeline'),
    pending = deferred();
  let calls = 0;
  t.mock.method(cloudMemoryRepository, 'listFriendTimeline', () =>
    ++calls === 1
      ? pending.promise
      : Promise.resolve({ items: [friendEntry('new')], nextCursor: null }),
  );
  const old = target.loadFriendTimeline(true);
  target.onHide();
  await target.loadFriendTimeline(true);
  pending.resolve({ items: [friendEntry('old')], nextCursor: null });
  await old;
  assert.equal(target.data.friendItems[0].id, 'new');
});
test('friend timeline pagination does not duplicate items across changing page boundaries', async (t) => {
  cloudModeService.activateCloud();
  const target = page('timeline');
  target.data.friendItems = [{ id: 'existing' }];
  t.mock.method(cloudMemoryRepository, 'listFriendTimeline', async () => ({
    items: [friendEntry('existing'), friendEntry('new')],
    nextCursor: null,
  }));
  await target.loadFriendTimeline(false);
  assert.deepEqual(
    target.data.friendItems.map((item) => item.id),
    ['existing', 'new'],
  );
});
test('map latest refresh wins even when old request resolves last', async (t) => {
  const target = page('map'),
    pending = deferred();
  let calls = 0;
  t.mock.method(memoryRepository, 'listMemories', () =>
    ++calls === 1 ? pending.promise : Promise.resolve([entry('new')]),
  );
  const old = target.refreshMemories();
  await target.refreshMemories();
  pending.resolve([entry('old')]);
  await old;
  assert.equal(target.data.memories[0].id, 'new');
});
test('map friend markers cannot return after leaving the cloud session', async (t) => {
  cloudModeService.activateCloud();
  const target = page('map'),
    pending = deferred();
  t.mock.method(cloudMemoryRepository, 'listFriendRecentMapPoints', () => pending.promise);
  const loading = target.refreshFriendLayer();
  cloudModeService.resetToLocal();
  pending.resolve([
    { id: 'old', mapXRatio: 0.5, mapYRatio: 0.5, mood: 'happy', ownerDisplayName: '同学' },
  ]);
  await loading;
  assert.deepEqual(target.data.friendPoints, []);
});

test('returning to a map with the friend layer selected refreshes that layer', async (t) => {
  cloudModeService.activateCloud();
  const target = page('map');
  target.data.mapLayer = 'friends';
  const refresh = t.mock.method(target, 'refreshFriendLayer', async () => undefined);
  t.mock.method(target, 'refreshMemories', async () => undefined);
  target.onHide();
  target.onShow();
  assert.equal(refresh.mock.callCount(), 1);
});

test('closing a pending friend card keeps it closed when its response arrives', async (t) => {
  cloudModeService.activateCloud();
  const target = page('map'),
    pending = deferred();
  t.mock.method(cloudMemoryRepository, 'getSharedMemoryById', () => pending.promise);
  const loading = target.handleFriendMarkerTap({ currentTarget: { dataset: { memoryId: 'old' } } });
  target.closeMemoryCard();
  pending.resolve({ ...entry('old'), ownerDisplayName: '同学' });
  await loading;
  assert.equal(target.data.selectedMemory, null);
});

for (const action of ['hide', 'close', 'switch']) {
  test(`friend timeline focus cannot restore a card after ${action}`, async (t) => {
    cloudModeService.activateCloud();
    const target = page('map'),
      pending = deferred(),
      started = deferred();
    t.mock.method(target, 'refreshMemories', async () => undefined);
    t.mock.method(target, 'refreshFriendLayer', async () => {
      target.data.friendPoints = [{ id: 'focus', mapAssetVersion: campusMapConfig.assetVersion }];
    });
    t.mock.method(cloudMemoryRepository, 'getSharedMemoryById', () => {
      started.resolve();
      return pending.promise;
    });
    setMapFocusIntent({
      memoryId: 'focus',
      mapXRatio: 0.5,
      mapYRatio: 0.5,
      source: 'friend-timeline',
    });
    target.onShow();
    const loading = target.applyPendingFocusIntent();
    await started.promise;
    if (action === 'hide') target.onHide();
    if (action === 'close') target.closeMemoryCard();
    if (action === 'switch')
      target.handleMapLayerTap({ currentTarget: { dataset: { layer: 'mine' } } });
    pending.resolve({ ...entry('focus'), ownerDisplayName: '同学' });
    await loading;
    assert.equal(target.data.selectedMemory, null);
    if (action === 'switch') assert.equal(target.data.mapLayer, 'mine');
  });
}
