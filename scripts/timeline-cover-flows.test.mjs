import { journalDraftService } from '../miniprogram/services/journal-draft-service.ts';
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  timelineCoverService,
  TIMELINE_COVER_STORAGE_KEY,
} from '../miniprogram/services/timeline-cover-service.ts';

const values = new Map();
const images = new Map();
const definitions = new Map();
let activePage;
let selected;
let chooseError;
let saveError;
let writeError;
let removeError;
let cleanupError;
let pickerCalls;
let picker;
let action;

const mediaResult = (size = 1024) => ({
  errMsg: 'chooseMedia:ok',
  type: 'image',
  tempFiles: [
    {
      tempFilePath: 'wxfile://tmp/background.jpg',
      size,
      width: 1200,
      height: 800,
      fileType: 'image',
      duration: 0,
      thumbTempFilePath: '',
    },
  ],
});

globalThis.Page = (definition) => definitions.set(activePage, definition);
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageInfoSync: () => ({ keys: [...values.keys()] }),
  getStorageSync: (key) => values.get(key) ?? '',
  setStorageSync: (key, value) => {
    if (writeError && key === TIMELINE_COVER_STORAGE_KEY) throw new Error('storage full');
    values.set(key, value);
  },
  removeStorageSync: (key) => {
    if (removeError && key === TIMELINE_COVER_STORAGE_KEY) throw new Error('storage busy');
    values.delete(key);
  },
  getFileSystemManager: () => ({
    mkdir: ({ success }) => success({ errMsg: 'mkdir:ok' }),
    saveFile: ({ filePath, tempFilePath, success, fail }) => {
      if (saveError) return fail({ errMsg: 'saveFile:fail disk full' });
      images.set(filePath, tempFilePath);
      success({ errMsg: 'saveFile:ok', savedFilePath: filePath });
    },
    unlink: ({ filePath, success }) => {
      images.delete(filePath);
      success({ errMsg: 'unlink:ok' });
    },
    rmdir: ({ dirPath, success, fail }) => {
      if (cleanupError) return fail({ errMsg: 'rmdir:fail busy' });
      for (const path of images.keys()) if (path.startsWith(`${dirPath}/`)) images.delete(path);
      success({ errMsg: 'rmdir:ok' });
    },
  }),
  chooseMedia: async (options) => {
    pickerCalls += 1;
    assert.equal(options.count, 1);
    assert.deepEqual(options.mediaType, ['image']);
    if (picker) return picker();
    if (chooseError) throw chooseError;
    return selected;
  },
  showActionSheet: async () => ({ tapIndex: action, errMsg: 'showActionSheet:ok' }),
  showToast: async () => ({ errMsg: 'showToast:ok' }),
  showModal: (options) => options.success({ confirm: true, cancel: false, errMsg: 'showModal:ok' }),
};

for (const name of ['timeline', 'data-management']) {
  activePage = name;
  await import(`../miniprogram/pages/${name}/index.ts`);
}

function page(name = 'timeline') {
  const definition = definitions.get(name);
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}

beforeEach(() => {
  values.clear();
  images.clear();
  selected = mediaResult();
  chooseError = saveError = writeError = removeError = cleanupError = false;
  pickerCalls = 0;
  picker = null;
  action = 0;
});

test('selecting one cover saves a permanent image and a reopened timeline shows it', async () => {
  const timeline = page();
  await timeline.chooseCoverImage();
  assert.match(timeline.data.coverImagePath, /\/sdu-memory\/timeline-cover\//u);
  assert.equal(timeline.data.coverImageFailed, false);
  assert.equal(timeline.data.isCoverSaving, false);
  const reopened = page();
  await reopened.loadCover();
  assert.equal(reopened.data.coverImagePath, timeline.data.coverImagePath);
  assert.equal(reopened.data.coverErrorMessage, '');
});

test('cancelling native image selection preserves the cover without an error message', async () => {
  const previous = await timelineCoverService.saveCover('wxfile://tmp/previous.jpg');
  const timeline = page();
  await timeline.loadCover();
  chooseError = { errMsg: 'chooseMedia:fail cancel' };
  await timeline.chooseCoverImage();
  assert.equal(timeline.data.coverImagePath, previous);
  assert.equal(timeline.data.coverErrorMessage, '');
  assert.equal(timeline.data.isCoverSaving, false);
  assert.equal(await timelineCoverService.getCover(), previous);
});

test('oversized, empty and invalid picker results preserve the previous cover', async () => {
  const previous = await timelineCoverService.saveCover('wxfile://tmp/previous.jpg');
  for (const result of [
    mediaResult(10 * 1024 * 1024 + 1),
    mediaResult(0),
    mediaResult(NaN),
    { tempFiles: [] },
    { tempFiles: [{ size: 123, tempFilePath: '' }] },
  ]) {
    const timeline = page();
    await timeline.loadCover();
    selected = result;
    await timeline.chooseCoverImage();
    assert.equal(timeline.data.coverImagePath, previous);
    assert.ok(timeline.data.coverErrorMessage);
    assert.equal(timeline.data.isCoverSaving, false);
  }
  assert.equal(images.size, 1);
});

test('a compressed image exactly at the 10 MiB limit can be saved', async () => {
  selected = mediaResult(10 * 1024 * 1024);
  const timeline = page();
  await timeline.chooseCoverImage();
  assert.ok(timeline.data.coverImagePath);
  assert.equal(timeline.data.coverErrorMessage, '');
});

test('picker failure exposes retry feedback and retains the saved cover', async () => {
  const previous = await timelineCoverService.saveCover('wxfile://tmp/previous.jpg');
  const timeline = page();
  await timeline.loadCover();
  chooseError = { errMsg: 'chooseMedia:fail auth deny' };
  await timeline.chooseCoverImage();
  assert.equal(timeline.data.coverImagePath, previous);
  assert.ok(timeline.data.coverErrorMessage);
  assert.equal(timeline.data.isCoverSaving, false);
});

test('file and storage failures retain the old cover and unlock the next attempt', async () => {
  const previous = await timelineCoverService.saveCover('wxfile://tmp/previous.jpg');
  for (const failure of ['file', 'storage']) {
    saveError = failure === 'file';
    writeError = failure === 'storage';
    const timeline = page();
    await timeline.loadCover();
    await timeline.chooseCoverImage();
    assert.equal(timeline.data.coverImagePath, previous);
    assert.ok(timeline.data.coverErrorMessage);
    assert.equal(timeline.data.isCoverSaving, false);
    assert.equal(await timelineCoverService.getCover(), previous);
    assert.equal(images.size, 1);
  }
});

test('rapid repeated taps open only one picker and returning to the page does not reload during selection', async () => {
  let finish;
  picker = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const timeline = page();
  const first = timeline.chooseCoverImage();
  await timeline.chooseCoverImage();
  await timeline.loadCover();
  assert.equal(pickerCalls, 1);
  assert.equal(timeline.data.isCoverSaving, true);
  finish(mediaResult());
  await first;
  assert.equal(images.size, 1);
  assert.equal(timeline.data.isCoverSaving, false);
});

test('a stale cover read cannot replace an image saved while that read was pending', async (t) => {
  let finish;
  t.mock.method(
    timelineCoverService,
    'getCover',
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const timeline = page();
  const loading = timeline.loadCover();
  await timeline.chooseCoverImage();
  const saved = timeline.data.coverImagePath;
  finish('wxfile://usr/sdu-memory/timeline-cover/stale.jpg');
  await loading;
  assert.equal(timeline.data.coverImagePath, saved);
  assert.ok(saved);
});

test('corrupt cover metadata shows a fallback and selecting a new picture repairs it', async () => {
  values.set(TIMELINE_COVER_STORAGE_KEY, '{broken');
  const timeline = page();
  await timeline.loadCover();
  assert.equal(timeline.data.coverImagePath, '');
  assert.ok(timeline.data.coverErrorMessage);
  await timeline.chooseCoverImage();
  assert.ok(timeline.data.coverImagePath);
  assert.equal(timeline.data.coverErrorMessage, '');
});

test('a broken cover image falls back without deleting metadata and remains replaceable', async () => {
  const previous = await timelineCoverService.saveCover('wxfile://tmp/previous.jpg');
  const timeline = page();
  await timeline.loadCover();
  timeline.handleCoverImageError({ currentTarget: { dataset: { imagePath: previous } } });
  assert.equal(timeline.data.coverImageFailed, true);
  assert.ok(timeline.data.coverErrorMessage);
  assert.equal(await timelineCoverService.getCover(), previous);
  await timeline.chooseCoverImage();
  assert.equal(timeline.data.coverImageFailed, false);
  assert.notEqual(timeline.data.coverImagePath, previous);
});

test('an error emitted by a replaced image cannot hide the newly saved cover', async () => {
  const timeline = page();
  await timeline.chooseCoverImage();
  timeline.handleCoverImageError({ currentTarget: { dataset: { imagePath: 'old-image' } } });
  assert.equal(timeline.data.coverImageFailed, false);
});

test('restoring the default cover removes the saved setting and managed files', async () => {
  const timeline = page();
  await timeline.chooseCoverImage();
  await timeline.restoreDefaultCover();
  assert.equal(timeline.data.coverImagePath, '');
  assert.equal(timeline.data.coverImageFailed, false);
  assert.equal(timeline.data.coverErrorMessage, '');
  assert.equal(images.size, 0);
  assert.equal(await timelineCoverService.getCover(), '');
});

test('failed reset keeps the current image when storage removal fails', async () => {
  const timeline = page();
  await timeline.chooseCoverImage();
  const previous = timeline.data.coverImagePath;
  removeError = true;
  await timeline.restoreDefaultCover();
  assert.equal(timeline.data.coverImagePath, previous);
  assert.ok(timeline.data.coverErrorMessage);
  assert.equal(timeline.data.isCoverSaving, false);
});

test('partial reset cleanup failure still displays the already committed default cover', async () => {
  const timeline = page();
  await timeline.chooseCoverImage();
  cleanupError = true;
  await timeline.restoreDefaultCover();
  assert.equal(timeline.data.coverImagePath, '');
  assert.match(timeline.data.coverErrorMessage, /已恢复默认.*清理/u);
  assert.equal(timeline.data.isCoverSaving, false);
});

test('the cover action sheet routes selection and restore to real page flows', async () => {
  const timeline = page();
  await timeline.changeCover();
  assert.ok(timeline.data.coverImagePath);
  action = 1;
  await timeline.changeCover();
  assert.equal(timeline.data.coverImagePath, '');
});

test('confirmed clear of all local data also clears the cover and text draft', async () => {
  journalDraftService.save({
    text: 'private draft',
    mood: 'happy',
    customMood: '',
    category: 'campus-life',
    customCategory: '',
    placeName: '',
    recordedAt: '2024-02-29T04:00:00.000Z',
    mapAssetVersion: 'journal-unlocated-v1',
    xRatio: 0,
    yRatio: 0,
    hadPhotos: false,
  });
  await timelineCoverService.saveCover('wxfile://tmp/previous.jpg');
  const management = page('data-management');
  await management.clearAllLocalData();
  assert.equal(await timelineCoverService.getCover(), '');
  assert.equal(journalDraftService.read(), null);
  assert.equal(images.size, 0);
  assert.equal(management.data.isClearing, false);
});

test('draft cleanup failure is reported without claiming all local data was cleared', async (t) => {
  t.mock.method(journalDraftService, 'clear', () => {
    throw new Error('文字草稿存储被占用');
  });
  const management = page('data-management');
  await management.clearAllLocalData();
  assert.match(management.data.actionMessage, /文字草稿/);
  assert.match(management.data.actionMessage, /未完成/);
});
