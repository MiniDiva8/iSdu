import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import {
  journalPreferencesService,
  JOURNAL_PREFERENCES_STORAGE_KEY,
} from '../miniprogram/services/journal-preferences-service.ts';
import { localImageService } from '../miniprogram/services/local-image-service.ts';
import { timelineCoverService } from '../miniprogram/services/timeline-cover-service.ts';
import { wheelIndexAtRotation } from '../miniprogram/utils/selection-wheel.ts';
const values = new Map(),
  definitions = new Map(),
  navigation = [];
let active = '';
globalThis.Page = (definition) => definitions.set(active, definition);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [...values.keys()] }),
  getStorageSync: (key) => values.get(key) ?? '',
  setStorageSync: (key, value) => values.set(key, value),
  removeStorageSync: (key) => values.delete(key),
  getWindowInfo: () => ({ statusBarHeight: 20, windowWidth: 375, windowHeight: 800 }),
  navigateTo: (options) => {
    navigation.push({ type: 'to', ...options });
    return Promise.resolve({});
  },
  redirectTo: (options) => {
    navigation.push({ type: 'redirect', ...options });
    return Promise.resolve({});
  },
  navigateBack: (options) => {
    navigation.push({ type: 'back' });
    options.success?.({});
    return Promise.resolve({});
  },
  switchTab: (options) => {
    navigation.push({ type: 'tab', ...options });
    return Promise.resolve({});
  },
  showToast: () => Promise.resolve(),
  vibrateShort: () => Promise.resolve(),
  enableAlertBeforeUnload: () => {},
  disableAlertBeforeUnload: () => {},
  showModal: (options) => options.success({ confirm: true, cancel: false }),
};
for (const name of ['journal', 'editor', 'profile', 'selection-wheel', 'data-management']) {
  active = name;
  try {
    await import('../miniprogram/pages/' + name + '/index.ts');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
}
function page(name) {
  const d = definitions.get(name);
  assert.ok(d, 'Page ' + name + ' must exist');
  return {
    ...d,
    data: structuredClone(d.data),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      callback?.();
    },
    createSelectorQuery() {
      return {
        select() {
          return this;
        },
        boundingClientRect(callback) {
          callback({ left: 20, top: 100, width: 320, height: 320 });
          return this;
        },
        exec() {},
      };
    },
  };
}
const record = (extra = {}) => ({
  id: 'record',
  text: '你好 A😀',
  imagePaths: [],
  placeName: '',
  mood: 'calm',
  customMood: '',
  category: 'food',
  customCategory: '',
  mapAssetVersion: 'journal-unlocated-v1',
  mapXRatio: 0,
  mapYRatio: 0,
  origin: 'user',
  recordedAt: '2024-02-29T04:00:00.000Z',
  createdAt: '2024-02-29T04:00:00.000Z',
  updatedAt: '2024-02-29T04:00:00.000Z',
  ...extra,
});
beforeEach(() => {
  values.clear();
  navigation.length = 0;
});
test('new journal opens the native wheel before creating an editor', () => {
  const home = page('journal');
  home.startWriting();
  assert.match(navigation.at(-1).url, /pages\/selection-wheel\/index/);
  assert.match(navigation.at(-1).url, /source=journal/);
  assert.equal(values.size, 0);
});
test('journal wheel confirmation redirects exactly once with selected mood and default topic', () => {
  journalPreferencesService.save({ defaultCategory: 'study' });
  const wheel = page('selection-wheel');
  wheel.onLoad({ source: 'journal', kind: 'mood', date: '2024-02-29', value: 'happy' });
  wheel.confirmSelection();
  wheel.confirmSelection();
  assert.equal(navigation.filter((x) => x.type === 'redirect').length, 1);
  assert.match(navigation.at(-1).url, /mood=happy/);
  assert.match(navigation.at(-1).url, /category=study/);
  assert.match(navigation.at(-1).url, /date=2024-02-29/);
});
test('cancel and a future date never create a diary or write a preference', () => {
  const wheel = page('selection-wheel');
  wheel.onLoad({ source: 'journal', kind: 'mood', date: '2199-12-31', value: 'happy' });
  wheel.confirmSelection();
  assert.equal(navigation.length, 0);
  assert.match(wheel.data.errorMessage, /未来/);
  wheel.cancelSelection();
  assert.equal(navigation.at(-1).type, 'back');
  assert.equal(values.size, 0);
});
test('editing a topic returns through its event channel without losing images, text or privacy', () => {
  const editor = page('editor');
  editor.onLoad({ source: 'journal', date: '2024-02-29', mood: 'happy' });
  editor.data.text = '保留现有正文';
  editor.data.images = [{ id: 'x', path: 'wxfile://tmp/a.jpg', isTemporary: true }];
  editor.data.visibility = 'public';
  editor.openCategoryPicker();
  const events = navigation.at(-1).events;
  assert.ok(events?.selection);
  events.selection({ kind: 'category', value: 'study' });
  assert.equal(editor.data.category, 'study');
  assert.equal(editor.data.text, '保留现有正文');
  assert.equal(editor.data.images[0].path, 'wxfile://tmp/a.jpg');
  assert.equal(editor.data.visibility, 'public');
  assert.equal(editor.data.isDirty, true);
});
test('the editor wheel emits only its confirmed value and cancellation emits nothing', () => {
  const wheel = page('selection-wheel');
  const emitted = [];
  wheel.getOpenerEventChannel = () => ({ emit: (...args) => emitted.push(args) });
  wheel.onLoad({ source: 'editor', kind: 'category', value: 'study' });
  wheel.confirmSelection();
  assert.deepEqual(emitted, [['selection', { kind: 'category', value: 'study' }]]);
  const cancelled = page('selection-wheel');
  cancelled.getOpenerEventChannel = () => ({ emit: (...args) => emitted.push(args) });
  cancelled.onLoad({ source: 'editor', kind: 'mood', value: 'happy' });
  cancelled.cancelSelection();
  assert.equal(emitted.length, 1);
});
test('default mood/topic apply to new entries while saved entries retain their values', () => {
  journalPreferencesService.save({ defaultMood: 'proud', defaultCategory: 'study' });
  const fresh = page('editor');
  fresh.onLoad({ source: 'journal', date: '2024-02-29' });
  assert.equal(fresh.data.mood, 'proud');
  assert.equal(fresh.data.category, 'study');
  const existing = page('editor');
  existing.populateMemory(record());
  assert.equal(existing.data.mood, 'calm');
  assert.equal(existing.data.category, 'food');
});
test('preference wheels persist only explicit confirmation', () => {
  const wheel = page('selection-wheel');
  wheel.onLoad({ source: 'preferences', kind: 'category', value: 'nature' });
  assert.equal(values.size, 0);
  wheel.confirmSelection();
  assert.equal(journalPreferencesService.read().defaultCategory, 'nature');
  const cancelled = page('selection-wheel');
  cancelled.onLoad({ source: 'preferences', kind: 'mood', value: 'excited' });
  cancelled.cancelSelection();
  assert.equal(journalPreferencesService.read().defaultMood, 'calm');
});
test('dragging the native ring rotates, snaps and suppresses its trailing tap', (t) => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const wheel = page('selection-wheel');
  wheel.onLoad({ source: 'editor', kind: 'mood', value: 'happy' });
  wheel.handleWheelTouchStart({ touches: [{ identifier: 1, clientX: 320, clientY: 260 }] });
  now += 100;
  wheel.handleWheelTouchMove({ touches: [{ identifier: 1, clientX: 180, clientY: 400 }] });
  assert.ok(wheel.data.rotation >= 89);
  wheel.handleWheelTouchEnd({
    touches: [],
    changedTouches: [{ identifier: 1, clientX: 180, clientY: 400 }],
  });
  assert.equal(wheel.data.selectedIndex, wheelIndexAtRotation(wheel.data.rotation, 12));
  const after = wheel.data.selectedIndex;
  wheel.selectOption({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(wheel.data.selectedIndex, after);
  now += 500;
  wheel.selectOption({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(wheel.data.selectedIndex, 0);
});
test('center touches and multitouch do not rotate or choose an option', () => {
  const wheel = page('selection-wheel');
  wheel.onLoad({ source: 'editor', kind: 'category', value: 'campus-life' });
  wheel.handleWheelTouchStart({ touches: [{ identifier: 1, clientX: 180, clientY: 260 }] });
  wheel.handleWheelTouchMove({ touches: [{ identifier: 1, clientX: 340, clientY: 260 }] });
  assert.equal(wheel.data.rotation, 0);
  wheel.handleWheelTouchStart({
    touches: [
      { identifier: 1, clientX: 320, clientY: 260 },
      { identifier: 2, clientX: 30, clientY: 120 },
    ],
  });
  assert.equal(wheel.data.dragging, false);
});
test('the profile uses real summary values and discards an obsolete async response', async (t) => {
  const profile = page('profile');
  let resolveFirst;
  let calls = 0;
  t.mock.method(memoryRepository, 'listMemories', () => {
    calls++;
    return calls === 1
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : Promise.resolve([record()]);
  });
  const first = profile.loadInsights();
  await profile.loadInsights();
  resolveFirst([record(), record({ id: 'old' })]);
  await first;
  assert.equal(profile.data.entryCount, 1);
  assert.equal(profile.data.characterCount, 4);
});
test('clearing all local data also clears preference metadata', async (t) => {
  journalPreferencesService.save({ defaultMood: 'happy' });
  t.mock.method(localImageService, 'clearAllManagedImages', async () => {});
  t.mock.method(timelineCoverService, 'clearCover', async () => {});
  await page('data-management').clearAllLocalData();
  assert.equal(values.has(JOURNAL_PREFERENCES_STORAGE_KEY), false);
});

test('pending profile reload removes old chart data immediately', async (t) => {
  const profile = page('profile');
  let resolve;
  profile.data.moodCounts = [{ mood: 'happy', label: '开心', count: 8, percentage: 100 }];
  profile.data.entryCount = 8;
  profile.data.insightsReady = true;
  t.mock.method(
    memoryRepository,
    'listMemories',
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const loading = profile.loadInsights();
  assert.deepEqual(profile.data.moodCounts, []);
  assert.equal(profile.data.entryCount, 0);
  resolve([record()]);
  await loading;
  assert.equal(profile.data.entryCount, 1);
});
test('preference confirmation can retry after a temporary storage failure', (t) => {
  const save = journalPreferencesService.save.bind(journalPreferencesService);
  let calls = 0;
  t.mock.method(journalPreferencesService, 'save', (patch) => {
    calls++;
    if (calls === 1) throw Error('temporary storage failure');
    return save(patch);
  });
  const wheel = page('selection-wheel');
  wheel.onLoad({ source: 'preferences', kind: 'category', value: 'study' });
  wheel.confirmSelection();
  assert.match(wheel.data.errorMessage, /storage/);
  wheel.confirmSelection();
  assert.equal(calls, 2);
  assert.equal(journalPreferencesService.read().defaultCategory, 'study');
  assert.equal(navigation.at(-1).type, 'back');
});
test('a selection returned to a hidden editor enables its leave guard only after onShow', (t) => {
  const guards = [];
  let route = 'wheel';
  t.mock.method(wx, 'enableAlertBeforeUnload', () => guards.push(route));
  const editor = page('editor');
  editor.onLoad({ source: 'journal', date: '2024-02-29' });
  editor.onHide();
  editor.applyWheelSelection({ kind: 'mood', value: 'happy' });
  assert.equal(editor.data.isDirty, true);
  assert.deepEqual(guards, []);
  route = 'editor';
  editor.onShow();
  assert.deepEqual(guards, ['editor']);
});
