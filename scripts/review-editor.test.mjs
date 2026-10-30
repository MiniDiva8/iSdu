import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import { cloudMemoryRepository } from '../miniprogram/services/repository/cloud-memory-repository.ts';
import { localImageService } from '../miniprogram/services/local-image-service.ts';

let definition;
const notices = [];
const navigation = [];
globalThis.Page = (page) => {
  definition = page;
};
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageSync: () => '',
  getStorageInfoSync: () => ({ keys: [] }),
  enableAlertBeforeUnload() {},
  disableAlertBeforeUnload() {},
  showToast: (options) => notices.push(options.title),
  navigateBack: () => navigation.push('back'),
  switchTab: () => navigation.push('tab'),
  showModal: (options) => options.success?.({ confirm: true }),
  chooseMedia() {},
};
await import('../miniprogram/pages/editor/index.ts');
function editor(cloud = false) {
  const page = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  page.onLoad({ source: 'journal', date: '2026-10-01' });
  page.onShow();
  page.data.isCloudMode = cloud;
  page.handleTextInput({ detail: { value: '在图书馆写下这一天。' } });
  return page;
}
function wireSave(t, page) {
  const calls = { content: 0, scope: [] };
  t.mock.method(memoryRepository, 'createMemory', async (value) => {
    calls.content++;
    return { ...value, visibility: 'private', imagePaths: [] };
  });
  t.mock.method(memoryRepository, 'updateMemory', async (id, value) => {
    calls.content++;
    return { ...value, id, visibility: 'friends', imagePaths: [] };
  });
  t.mock.method(localImageService, 'persistTempImages', async () => {
    throw new Error('retry must not persist photos again');
  });
  t.mock.method(cloudMemoryRepository, 'setVisibility', async (...args) => {
    calls.scope.push(args);
    throw new Error('网络暂时中断');
  });
  page.data.visibility = 'private';
  return calls;
}
beforeEach(() => {
  notices.length = 0;
  navigation.length = 0;
});

test('scope failure retains saved content and a visible retry state without success or navigation', async (t) => {
  const page = editor(true);
  page.data.isEditMode = true;
  const calls = wireSave(t, page);
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', (fn) => {
    timers.push(fn);
    return 1;
  });
  await page.saveMemory();
  assert.equal(page.data.hasSaved, true);
  assert.equal(page.data.visibilitySavePending, true);
  assert.match(page.data.formError, /可见范围.*(?:未确认|未更新)/);
  assert.equal(page.data.editorStep, 'options');
  assert.deepEqual(notices, []);
  assert.deepEqual(timers, []);
  assert.deepEqual(navigation, []);
  assert.equal(calls.content, 1);
  page.onUnload();
});

test('scope-only retry never creates a duplicate diary or rewrites saved content', async (t) => {
  const page = editor(true);
  const calls = wireSave(t, page);
  t.mock.method(globalThis, 'setTimeout', () => 1);
  await page.saveMemory();
  assert.equal(page.data.visibilitySavePending, true);
  t.mock.method(cloudMemoryRepository, 'setVisibility', async (...args) => {
    calls.scope.push(args);
    return { id: page.data.memoryId, imagePaths: [], visibility: 'private' };
  });
  await page.saveMemory();
  assert.equal(calls.content, 1);
  assert.equal(calls.scope.length, 2);
  assert.deepEqual(calls.scope[0], calls.scope[1]);
  assert.equal(page.data.visibilitySavePending, false);
  assert.equal(page.data.formError, '');
  assert.deepEqual(notices, ['可见范围已更新']);
  page.onUnload();
});

test('repeated scope failure remains retryable and a concurrent retry sends only one write', async (t) => {
  const page = editor(true);
  const calls = wireSave(t, page);
  await page.saveMemory();
  let reject;
  t.mock.method(cloudMemoryRepository, 'setVisibility', (...args) => {
    calls.scope.push(args);
    return new Promise((_, fail) => {
      reject = fail;
    });
  });
  const pending = page.saveMemory();
  await page.saveMemory();
  assert.equal(calls.scope.length, 2);
  reject(new Error('仍未连上'));
  await pending;
  assert.equal(page.data.visibilitySavePending, true);
  assert.equal(page.data.isSaving, false);
  assert.equal(calls.content, 1);
  assert.deepEqual(notices, []);
  page.onUnload();
});

test('two photo taps share one picker and saving waits until the selection has completed', async (t) => {
  const page = editor();
  let picker;
  let picks = 0;
  t.mock.method(wx, 'chooseMedia', (options) => {
    picks++;
    picker = options;
  });
  await Promise.all([page.chooseImages(), page.chooseImages()]);
  assert.equal(picks, 1);
  assert.equal(page.data.isChoosingImages, true);
  let creates = 0;
  t.mock.method(memoryRepository, 'createMemory', async (value) => {
    creates++;
    return value;
  });
  await page.saveMemory();
  assert.equal(creates, 0);
  picker.success({ tempFiles: [{ size: 100, tempFilePath: 'wxfile://temp/a.jpg' }] });
  picker.complete?.({});
  assert.equal(page.data.images.length, 1);
  assert.equal(page.data.isChoosingImages, false);
  page.onUnload();
});

test('late photo completion cannot change an unloaded or already saved editor', async (t) => {
  for (const leave of ['unload', 'saved']) {
    const page = editor();
    let picker;
    t.mock.method(wx, 'chooseMedia', (options) => {
      picker = options;
    });
    await page.chooseImages();
    if (leave === 'unload') page.onUnload();
    else page.data.hasSaved = true;
    const before = structuredClone(page.data.images);
    picker.success({ tempFiles: [{ size: 100, tempFilePath: 'wxfile://temp/late.jpg' }] });
    picker.complete?.({});
    assert.deepEqual(page.data.images, before);
    page.onUnload();
  }
});

for (const kind of ['missing', 'throwing']) {
  test(`${kind} native picker releases selection and saving controls with a readable error`, async (t) => {
    const page = editor();
    if (kind === 'missing') {
      const original = wx.chooseMedia;
      wx.chooseMedia = undefined;
      t.after(() => {
        wx.chooseMedia = original;
      });
    } else {
      t.mock.method(wx, 'chooseMedia', () => {
        throw new Error('native picker unavailable');
      });
    }
    await page.chooseImages();
    assert.equal(page.data.isChoosingImages, false);
    assert.match(page.data.formError, /照片.*(?:失败|无法|不支持)/);
    assert.match(page.data.text, /图书馆/);
    page.onUnload();
  });
}

test('failed selected-friend scope can be changed to private and retried without rewriting content', async (t) => {
  const page = editor(true);
  const calls = wireSave(t, page);
  page.data.visibility = 'selected_friends';
  page.data.selectedFriendIds = ['removed-friend'];
  await page.saveMemory();
  page.selectVisibility({ currentTarget: { dataset: { value: 'private' } } });
  assert.equal(page.data.visibility, 'private');
  assert.equal(page.data.hasSaved, true);
  page.handleTextInput({ detail: { value: 'must remain locked' } });
  assert.match(page.data.text, /图书馆/);
  t.mock.method(globalThis, 'setTimeout', () => 1);
  t.mock.method(cloudMemoryRepository, 'setVisibility', async (...args) => {
    calls.scope.push(args);
    return { id: page.data.memoryId, visibility: 'private', imagePaths: [] };
  });
  await page.saveMemory();
  assert.equal(calls.content, 1);
  assert.equal(calls.scope.at(-1)[1], 'private');
  assert.equal(page.data.visibilitySavePending, false);
  page.onUnload();
});
