import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { campusMapConfig } from '../miniprogram/config/campus-map.ts';
import { cloudMemoryRepository } from '../miniprogram/services/repository/cloud-memory-repository.ts';
import { consumeMapFocusIntent } from '../miniprogram/services/map-focus-intent.ts';

let definition;
const navigations = [];
globalThis.Page = (value) => (definition = value);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [] }),
  getStorageSync: () => '',
  switchTab: (options) => {
    navigations.push(options.url);
    options.success?.();
  },
};
await import('../miniprogram/pages/detail/index.ts');

const now = Date.parse('2026-10-29T08:00:00Z');
const memory = (patch = {}) => ({
  id: 'friend-diary',
  text: '同学分享的校园日记',
  imagePaths: [],
  mood: 'calm',
  category: 'campus-life',
  customMood: '',
  customCategory: '',
  placeName: '图书馆',
  recordedAt: '2026-10-28T04:00:00Z',
  mapAssetVersion: campusMapConfig.assetVersion,
  mapXRatio: 0.4,
  mapYRatio: 0.6,
  publishedAt: new Date(now - 60 * 60 * 1000).toISOString(),
  ownerDisplayName: '同学',
  likeCount: 0,
  likedByMe: false,
  ...patch,
});
function page(entry = memory()) {
  return {
    ...definition,
    data: { ...structuredClone(definition.data), memory: entry, isFriendMemory: true },
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}
beforeEach((t) => {
  navigations.length = 0;
  consumeMapFocusIntent();
  t.mock.method(Date, 'now', () => now);
});

test('recent friend detail uses the shared-map focus route', () => {
  const detail = page();
  detail.showOnMap();
  assert.equal(consumeMapFocusIntent()?.source, 'friend-timeline');
  assert.deepEqual(navigations, ['/pages/map/index']);
});

for (const [name, patch, reason] of [
  ['expired', { publishedAt: new Date(now - 24 * 60 * 60 * 1000 - 1).toISOString() }, /24 小时/],
  ['old map', { mapAssetVersion: 'old-campus-map' }, /旧版地图/],
  ['missing share date', { publishedAt: null }, /分享时间/],
  ['invalid share date', { publishedAt: 'invalid' }, /分享时间/],
  ['future share date', { publishedAt: new Date(now + 1000).toISOString() }, /分享时间/],
]) {
  test(`${name} friend detail explains why map navigation is unavailable`, async (t) => {
    const entry = memory(patch);
    const detail = page(entry);
    detail.data.memoryId = entry.id;
    t.mock.method(cloudMemoryRepository, 'getSharedMemoryById', async () => entry);
    await detail.loadMemory();
    assert.equal(detail.data.canShowOnMap, false);
    assert.match(detail.data.mapUnavailableReason, reason);
    detail.showOnMap();
    assert.equal(consumeMapFocusIntent(), null);
    assert.equal(navigations.length, 0);
    assert.match(detail.data.actionMessage, reason);
  });
}

test('friend detail rechecks the 24 hour window when map action is tapped', async (t) => {
  const entry = memory({ publishedAt: new Date(now - 24 * 60 * 60 * 1000).toISOString() });
  const detail = page(entry);
  detail.data.memoryId = entry.id;
  t.mock.method(cloudMemoryRepository, 'getSharedMemoryById', async () => entry);
  await detail.loadMemory();
  assert.equal(detail.data.canShowOnMap, true);
  t.mock.method(Date, 'now', () => now + 1);
  detail.showOnMap();
  assert.equal(detail.data.canShowOnMap, false);
  assert.equal(navigations.length, 0);
  assert.equal(consumeMapFocusIntent(), null);
});

test('failed friend map navigation discards the pending intent', async (t) => {
  t.mock.method(globalThis.wx, 'switchTab', (options) => options.fail({ errMsg: '导航失败' }));
  const detail = page();
  detail.showOnMap();
  await Promise.resolve();
  assert.equal(consumeMapFocusIntent(), null);
  assert.match(detail.data.actionMessage, /导航失败/);
});

test('own detail keeps the own-memory route regardless of sharing age', () => {
  const detail = page(memory({ publishedAt: null }));
  detail.data.isFriendMemory = false;
  detail.showOnMap();
  assert.equal(consumeMapFocusIntent()?.source, 'detail');
  assert.equal(navigations.length, 1);
});

test('unlocated friend diary does not create a focus intent', () => {
  const detail = page(memory({ mapAssetVersion: 'journal-unlocated-v1' }));
  detail.showOnMap();
  assert.equal(consumeMapFocusIntent(), null);
  assert.equal(navigations.length, 0);
});

test('unavailable friend map has an explanatory state instead of an interactive preview', async () => {
  const template = await readFile(
    new URL('../miniprogram/pages/detail/index.wxml', import.meta.url),
    'utf8',
  );
  assert.match(template, /wx:if="\{\{canShowOnMap\}\}"/);
  assert.match(template, /wx:else[^>]*class="detail-map-unavailable"[\s\S]*?mapUnavailableReason/);
});
