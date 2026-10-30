import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { cloudModeService } from '../miniprogram/services/cloud/cloud-mode-service.ts';
import { cloudAuthRepository } from '../miniprogram/services/repository/cloud-auth-repository.ts';
import { userProfileRepository } from '../miniprogram/services/repository/index.ts';
import { localMemoryRepository } from '../miniprogram/services/repository/local-memory-repository.ts';
import { journalBackgroundService } from '../miniprogram/services/journal-background-service.ts';
import { localImageService } from '../miniprogram/services/local-image-service.ts';
import { timelineCoverService } from '../miniprogram/services/timeline-cover-service.ts';

const storage = new Map();
const definitions = new Map();
let activePage;
globalThis.Page = (definition) => definitions.set(activePage, definition);
globalThis.wx = {
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  getStorageSync: (key) => storage.get(key) ?? '',
  setStorageSync: (key, value) => storage.set(key, value),
  removeStorageSync: (key) => storage.delete(key),
  enableAlertBeforeUnload: () => undefined,
  disableAlertBeforeUnload: () => undefined,
  pageScrollTo: () => Promise.resolve(),
  showModal: (options) => options.success({ confirm: false, cancel: true }),
};
for (const name of ['editor', 'profile-edit', 'profile', 'timeline', 'data-management']) {
  activePage = name;
  await import(`../miniprogram/pages/${name}/index.ts`);
}

function page(name) {
  const definition = definitions.get(name);
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}

beforeEach(() => storage.clear());

test('editor steps reject empty content and preserve the draft in both directions', () => {
  const editor = page('editor');
  editor.onLoad({ mapXRatio: '0.5', mapYRatio: '0.5' });
  editor.goToOptions();
  assert.equal(editor.data.editorStep, 'content');
  assert.ok(editor.data.formError);
  editor.handleTextInput({ detail: { value: '秋天的校园' } });
  editor.data.images = [{ id: 'draft-image', path: '/temporary/image.jpg', isTemporary: true }];
  editor.goToOptions();
  assert.equal(editor.data.editorStep, 'options');
  editor.selectMood({ currentTarget: { dataset: { value: 'happy' } } });
  editor.backToContent();
  assert.equal(editor.data.text, '秋天的校园');
  assert.equal(editor.data.images[0].path, '/temporary/image.jpg');
  assert.equal(editor.data.mood, 'happy');
  assert.equal(editor.data.isDirty, true);
  assert.equal(storage.size, 0, 'changing steps must not save or upload the draft');
});

test('broken draft images prevent advancing to the save step', () => {
  const editor = page('editor');
  editor.onLoad({ mapXRatio: '0.5', mapYRatio: '0.5' });
  editor.data.images = [{ path: '/missing/image.jpg', loadFailed: true }];
  editor.goToOptions();
  assert.equal(editor.data.editorStep, 'content');
  assert.match(editor.data.formError, /无法读取/);
});

test('local profile saves refresh the space and timeline without cloud consent', async (t) => {
  const bootstrap = t.mock.method(cloudAuthRepository, 'bootstrap', async () => {
    throw new Error('Cloud must not be contacted without consent');
  });
  const editor = page('profile-edit');
  await editor.loadProfile();
  editor.handleProfileNameInput({ detail: { value: '  小忆  ' } });
  editor.handleProfileSignatureInput({ detail: { value: '留住校园时光' } });
  await editor.saveProfile();
  assert.equal((await userProfileRepository.getProfile()).displayName, '小忆');
  assert.equal(editor.data.isDirty, false);
  assert.equal(bootstrap.mock.callCount(), 0);
  const space = page('profile');
  const timeline = page('timeline');
  await space.loadProfile();
  await timeline.loadProfile();
  assert.equal(space.data.displayName, '小忆');
  assert.equal(space.data.signature, '留住校园时光');
  assert.match(timeline.data.timelineTitle, /^小忆的/);
});

test('cloud profile sync failure preserves the local save and exposes retry feedback', async (t) => {
  cloudModeService.acceptPrivacy();
  t.mock.method(cloudAuthRepository, 'bootstrap', async () => ({}));
  t.mock.method(cloudAuthRepository, 'updateMyProfile', async () => {
    throw new Error('Simulated offline');
  });
  const editor = page('profile-edit');
  await editor.loadProfile();
  editor.handleProfileNameInput({ detail: { value: '小忆' } });
  await editor.saveProfile();
  assert.equal((await userProfileRepository.getProfile()).displayName, '小忆');
  assert.match(editor.data.actionMessage, /本机.*同步失败/);
  assert.equal(editor.data.isSaving, false);
});

test('invalid profile input keeps the unsaved draft and returns validation feedback', async () => {
  const editor = page('profile-edit');
  await editor.loadProfile();
  editor.handleProfileNameInput({ detail: { value: '   ' } });
  await editor.saveProfile();
  assert.ok(editor.data.errorMessage);
  assert.equal(editor.data.isDirty, true);
  assert.equal(await userProfileRepository.getProfile(), null);
});

test('opening the data page and cancelling confirmations never mutates data', async (t) => {
  const bootstrap = t.mock.method(cloudAuthRepository, 'bootstrap', async () => ({}));
  const clear = t.mock.method(localMemoryRepository, 'clearMemories', async () => undefined);
  const removeCloud = t.mock.method(cloudAuthRepository, 'deleteCloudAccount', async () => ({}));
  const background = t.mock.method(journalBackgroundService, 'clear', async () => undefined);
  const data = page('data-management');
  data.onShow();
  await data.enableCloudAndMigrate();
  await data.clearAllLocalData();
  data.data.cloudModeActive = true;
  await data.deleteAllCloudData();
  assert.equal(bootstrap.mock.callCount(), 0);
  assert.equal(clear.mock.callCount(), 0);
  assert.equal(removeCloud.mock.callCount(), 0);
  assert.equal(background.mock.callCount(), 0);
  assert.equal(storage.size, 0);
});

test('confirmed local cleanup includes homepage background without invoking cloud deletion', async (t) => {
  t.mock.method(wx, 'showModal', (options) => options.success({ confirm: true, cancel: false }));
  wx.showToast = async () => undefined;
  t.mock.method(localMemoryRepository, 'clearMemories', async () => undefined);
  t.mock.method(localImageService, 'clearAllManagedImages', async () => undefined);
  t.mock.method(timelineCoverService, 'clearCover', async () => undefined);
  const background = t.mock.method(journalBackgroundService, 'clear', async () => undefined);
  const cloud = t.mock.method(cloudAuthRepository, 'deleteCloudAccount', async () => ({}));
  const data = page('data-management');
  await data.clearAllLocalData();
  assert.equal(background.mock.callCount(), 1);
  assert.equal(cloud.mock.callCount(), 0);
  assert.equal(data.data.isClearing, false);
  assert.match(data.data.actionMessage, /首页背景.*已清除/u);
});

test('failed homepage background cleanup is reported instead of claiming complete success', async (t) => {
  t.mock.method(wx, 'showModal', (options) => options.success({ confirm: true, cancel: false }));
  t.mock.method(localMemoryRepository, 'clearMemories', async () => undefined);
  t.mock.method(localImageService, 'clearAllManagedImages', async () => undefined);
  t.mock.method(timelineCoverService, 'clearCover', async () => undefined);
  t.mock.method(journalBackgroundService, 'clear', async () => {
    throw new Error('背景目录仍忙');
  });
  const data = page('data-management');
  await data.clearAllLocalData();
  assert.match(data.data.actionMessage, /首页背景.*背景目录仍忙/u);
  assert.match(data.data.actionMessage, /部分数据未完成/u);
  assert.equal(data.data.isClearing, false);
});
