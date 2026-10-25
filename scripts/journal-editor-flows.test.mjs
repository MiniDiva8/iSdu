import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import { cloudFriendRepository } from '../miniprogram/services/repository/cloud-friend-repository.ts';
import { cloudModeService } from '../miniprogram/services/cloud/cloud-mode-service.ts';
import { journalDraftService } from '../miniprogram/services/journal-draft-service.ts';
import { JOURNAL_UNLOCATED_MAP_VERSION } from '../miniprogram/utils/journal.ts';
import { CURRENT_MAP_ASSET_VERSION } from '../miniprogram/config/campus-map.ts';
const definitions = new Map();
const storage = new Map();
const navigation = [];
let current = '';
let confirm = false;
globalThis.Page = (definition) => definitions.set(current, definition);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  getStorageSync: (key) => storage.get(key) ?? '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  enableAlertBeforeUnload: () => {},
  disableAlertBeforeUnload: () => {},
  pageScrollTo: () => Promise.resolve(),
  showToast: () => Promise.resolve(),
  showModal: (options) => options.success({ confirm, cancel: !confirm }),
  navigateTo: (options) => {
    navigation.push(options.url);
    options.success?.({});
    return Promise.resolve({});
  },
  switchTab: (options) => {
    navigation.push(options.url);
    options.success?.({});
    return Promise.resolve({});
  },
  navigateBack: (options) => {
    navigation.push('back');
    options.success?.({});
    return Promise.resolve({});
  },
};
for (const name of ['editor', 'detail', 'location-picker', 'map']) {
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
  text: '留下这一刻',
  imagePaths: [],
  placeName: '',
  mood: 'happy',
  customMood: '',
  category: 'campus-life',
  customCategory: '',
  mapAssetVersion: JOURNAL_UNLOCATED_MAP_VERSION,
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
  confirm = false;
});
test('journal editor opens from a date and mood without requiring a map', () => {
  const editor = page('editor');
  editor.onLoad({ source: 'journal', date: '2024-02-29', mood: 'happy' });
  assert.equal(editor.data.isFormReady, true);
  assert.equal(editor.data.mapAssetVersion, JOURNAL_UNLOCATED_MAP_VERSION);
  assert.equal(editor.data.mood, 'happy');
  assert.equal(editor.data.hasLocation, false);
  assert.match(editor.data.recordedAt, /2024-02-29/);
});
test('new journal saves to the real local repository and can be reopened and edited', async () => {
  const editor = page('editor');
  editor.onLoad({ source: 'journal', date: '2024-02-29', mood: 'happy' });
  editor.handleTextInput({ detail: { value: '今天在图书馆读完一本书。' } });
  await editor.saveMemory();
  editor.onUnload();
  assert.equal(editor.data.hasSaved, true);
  const saved = await memoryRepository.getMemoryById(editor.data.memoryId);
  assert.equal(saved.text, '今天在图书馆读完一本书。');
  assert.equal(saved.mapAssetVersion, JOURNAL_UNLOCATED_MAP_VERSION);
  const edit = page('editor');
  await edit.loadMemory(saved.id);
  assert.equal(edit.data.text, saved.text);
  assert.equal(edit.data.hasLocation, false);
});
test('campus location requires a valid in-campus point and preserves editor content', () => {
  const editor = page('editor');
  editor.onLoad({ source: 'journal' });
  assert.equal(typeof editor.applyCampusLocation, 'function');
  editor.handleTextInput({ detail: { value: '选点前的文字' } });
  editor.applyCampusLocation({ mapAssetVersion: CURRENT_MAP_ASSET_VERSION, xRatio: 0, yRatio: 0 });
  assert.equal(editor.data.hasLocation, false);
  editor.applyCampusLocation({
    mapAssetVersion: CURRENT_MAP_ASSET_VERSION,
    xRatio: 0.54,
    yRatio: 0.53,
  });
  assert.equal(editor.data.hasLocation, true);
  assert.equal(editor.data.text, '选点前的文字');
  assert.equal(editor.buildMemoryContent([]).mapXRatio, 0.54);
  editor.removeCampusLocation();
  assert.equal(editor.data.mapAssetVersion, JOURNAL_UNLOCATED_MAP_VERSION);
});
test('local text draft restores explicitly while cloud mode never restores or overwrites it', async (t) => {
  const editor = page('editor');
  editor.onLoad({ source: 'journal', date: '2024-02-29' });
  editor.handleTextInput({ detail: { value: '下次继续写的草稿' } });
  editor.saveTextDraft(false);
  const restored = page('editor');
  restored.onLoad({ source: 'journal', restore: '1' });
  assert.equal(restored.data.text, '下次继续写的草稿');
  cloudModeService.acceptPrivacy();
  cloudModeService.activateCloud();
  t.mock.method(cloudFriendRepository, 'listFriends', async () => []);
  const cloud = page('editor');
  cloud.onLoad({ source: 'journal', restore: '1' });
  assert.equal(cloud.data.text, '');
  cloud.data.text = '云端临时文字';
  cloud.saveTextDraft(false);
  assert.equal(journalDraftService.read().text, '下次继续写的草稿');
});
test('future journal date is rejected before editing or saving', () => {
  const editor = page('editor');
  editor.onLoad({ source: 'journal', date: '2199-12-31' });
  assert.equal(editor.data.isFormReady, false);
  assert.match(editor.data.formError, /未来/);
});
test('unlocated detail never sends a zero coordinate to the campus map', async (t) => {
  const detail = page('detail');
  detail.data.memoryId = 'entry';
  t.mock.method(memoryRepository, 'getMemoryById', async () => memory());
  await detail.loadMemory();
  assert.equal(detail.data.hasLocation, false);
  detail.showOnMap();
  assert.equal(navigation.length, 0);
  assert.match(detail.data.actionMessage, /地点/);
});
test('picker only emits an explicitly selected valid campus point', () => {
  const picker = page('location-picker');
  let selected = null;
  picker.getOpenerEventChannel = () => ({
    emit: (name, value) => {
      if (name === 'locationSelected') selected = value;
    },
  });
  picker.confirmPoint();
  assert.equal(selected, null);
  picker.acceptPoint({ xRatio: 0.54, yRatio: 0.53 });
  picker.confirmPoint();
  assert.equal(selected.mapAssetVersion, CURRENT_MAP_ASSET_VERSION);
  assert.equal(selected.xRatio, 0.54);
  assert.equal(navigation.at(-1), 'back');
});
test('saved diary deletion uses the existing repository and confirmation flow', async () => {
  const saved = await memoryRepository.createMemory(memory({ id: 'delete-journal' }));
  const detail = page('detail');
  detail.data.memory = saved;
  confirm = true;
  await detail.deleteMemory();
  assert.equal(await memoryRepository.getMemoryById(saved.id), null);
});

test('explicit mood-only action saves the selected mood through the existing content contract', async () => {
  const editor = page('editor');
  editor.onLoad({ source: 'journal', date: '2024-02-29', mood: 'happy' });
  await editor.recordMoodOnly();
  editor.onUnload();
  const saved = await memoryRepository.getMemoryById(editor.data.memoryId);
  assert.match(saved.text, /心情/);
  assert.equal(saved.mood, 'happy');
});
test('picker screen coordinates are converted against the rendered map rectangle', () => {
  const picker = page('location-picker');
  picker.createSelectorQuery = () => ({
    select: () => ({
      boundingClientRect: (callback) => {
        callback({ left: 30, top: 80, width: 400, height: 300 });
        return { exec: () => {} };
      },
    }),
  });
  picker.selectPoint({ touches: [], changedTouches: [{ clientX: 246, clientY: 239 }] });
  assert.equal(picker.data.hasPicked, true);
  assert.equal(picker.data.xRatio, 0.54);
  assert.equal(picker.data.yRatio, 0.53);
});

test('a separate new diary cannot replace or clear an unrelated text draft', async () => {
  const first = page('editor');
  first.onLoad({ source: 'journal', date: '2024-02-29' });
  first.handleTextInput({ detail: { value: '先前未完成的私密草稿 A' } });
  first.saveTextDraft(false);
  const second = page('editor');
  second.onLoad({ source: 'journal', date: '2024-03-01' });
  second.handleTextInput({ detail: { value: '新日记 B' } });
  second.onHide();
  assert.equal(journalDraftService.read().text, '先前未完成的私密草稿 A');
  await second.saveMemory();
  second.onUnload();
  assert.equal(journalDraftService.read().text, '先前未完成的私密草稿 A');
});
test('unlocated journals are excluded before map incompatibility warnings are counted', async (t) => {
  const map = page('map');
  t.mock.method(memoryRepository, 'listMemories', async () => [
    memory({ id: 'unlocated' }),
    memory({
      id: 'campus',
      mapAssetVersion: CURRENT_MAP_ASSET_VERSION,
      mapXRatio: 0.54,
      mapYRatio: 0.53,
    }),
  ]);
  await map.refreshMemories();
  assert.equal(map.data.hasIncompatibleMapMemories, false);
  assert.equal(map.data.incompatibleMapMemoryCount, 0);
  assert.equal(map.data.availableMarkerCount, 1);
  assert.deepEqual(
    map.data.markers.map((x) => x.id),
    ['campus'],
  );
});
