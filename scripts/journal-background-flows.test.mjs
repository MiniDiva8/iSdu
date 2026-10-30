import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  journalBackgroundService,
  JOURNAL_BACKGROUND_STORAGE_KEY,
} from '../miniprogram/services/journal-background-service.ts';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';

let definition;
let selected;
let chooseError;
let pickerCalls;
let picker;
let metadataError;
let toasts;
const values = new Map();
const images = new Map();
const navigation = [];
globalThis.Page = (value) => {
  definition = value;
};
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageInfoSync: () => ({ keys: [...values.keys()] }),
  getStorageSync: (key) => values.get(key) ?? '',
  setStorageSync: (key, value) => {
    if (metadataError && key === JOURNAL_BACKGROUND_STORAGE_KEY) throw new Error('storage full');
    values.set(key, value);
  },
  removeStorageSync: (key) => values.delete(key),
  getFileSystemManager: () => ({
    mkdir: ({ success }) => success({ errMsg: 'mkdir:ok' }),
    copyFile: ({ srcPath, destPath, success }) => {
      images.set(destPath, srcPath);
      success({ errMsg: 'copyFile:ok' });
    },
    unlink: ({ filePath, success }) => {
      images.delete(filePath);
      success({ errMsg: 'unlink:ok' });
    },
    rmdir: ({ dirPath, success }) => {
      for (const path of images.keys()) if (path.startsWith(`${dirPath}/`)) images.delete(path);
      success({ errMsg: 'rmdir:ok' });
    },
  }),
  chooseMedia: async (options) => {
    pickerCalls += 1;
    assert.deepEqual(options.sourceType, ['album']);
    assert.deepEqual(options.mediaType, ['image']);
    assert.equal(options.count, 1);
    if (picker) return picker();
    if (chooseError) throw chooseError;
    return selected;
  },
  showToast: async (options) => {
    toasts.push(options.title);
  },
  navigateTo: async ({ url }) => {
    navigation.push(url);
  },
};
await import('../miniprogram/pages/journal/index.ts');
function page() {
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}
function media(size = 1024, path = 'wxfile://tmp/background.jpg') {
  return {
    errMsg: 'chooseMedia:ok',
    type: 'image',
    tempFiles: [
      {
        tempFilePath: path,
        size,
        width: 1200,
        height: 800,
        fileType: 'image',
        duration: 0,
        thumbTempFilePath: '',
      },
    ],
  };
}
beforeEach(async () => {
  await journalBackgroundService.clear();
  values.clear();
  images.clear();
  navigation.length = 0;
  selected = media();
  chooseError = null;
  pickerCalls = 0;
  picker = null;
  metadataError = false;
  toasts = [];
});

test('album selection persists a local background and reopening restores clarity', async () => {
  const home = page();
  home.openBackgroundSettings();
  await home.chooseBackgroundImage();
  assert.match(home.data.backgroundImagePath, /\/journal-background\//u);
  assert.equal(home.data.pendingBackgroundPath, '');
  await home.changeBackgroundClarity({ detail: { value: 85 } });
  const reopened = page();
  await reopened.loadBackground();
  assert.equal(reopened.data.backgroundImagePath, home.data.backgroundImagePath);
  assert.equal(reopened.data.backgroundClarity, 85);
  assert.equal(reopened.data.backgroundErrorMessage, '');
});

test('cancelled or invalid image selection preserves the saved background', async () => {
  const saved = await journalBackgroundService.saveImage('wxfile://tmp/previous.jpg');
  const home = page();
  await home.loadBackground();
  chooseError = { errMsg: 'chooseMedia:fail cancel' };
  await home.chooseBackgroundImage();
  assert.equal(home.data.backgroundErrorMessage, '');
  chooseError = null;
  for (const result of [
    media(10 * 1024 * 1024 + 1),
    media(0),
    media(NaN),
    media(100, ''),
    { tempFiles: [] },
  ]) {
    selected = result;
    await home.chooseBackgroundImage();
    assert.equal(home.data.backgroundImagePath, saved.imagePath);
    assert.ok(home.data.backgroundErrorMessage);
    assert.equal(home.data.isBackgroundSaving, false);
  }
});

test('failed save retains the chosen image and retry succeeds without opening the picker again', async (t) => {
  const saved = await journalBackgroundService.saveImage('wxfile://tmp/previous.jpg');
  const home = page();
  await home.loadBackground();
  const mock = t.mock.method(journalBackgroundService, 'saveImage', async () => {
    throw new Error('保存失败');
  });
  await home.chooseBackgroundImage();
  assert.equal(home.data.backgroundImagePath, saved.imagePath);
  assert.equal(home.data.pendingBackgroundPath, 'wxfile://tmp/background.jpg');
  assert.equal(home.data.isBackgroundSaving, false);
  mock.mock.restore();
  await home.savePendingBackground();
  assert.notEqual(home.data.backgroundImagePath, saved.imagePath);
  assert.equal(home.data.pendingBackgroundPath, '');
  assert.equal(pickerCalls, 1);
});

test('the real copy adapter retains the selection when metadata saving fails and retry succeeds', async () => {
  const saved = await journalBackgroundService.saveImage('wxfile://tmp/previous.jpg');
  const home = page();
  await home.loadBackground();
  metadataError = true;
  await home.chooseBackgroundImage();
  assert.equal(home.data.backgroundImagePath, saved.imagePath);
  assert.equal(home.data.pendingBackgroundPath, 'wxfile://tmp/background.jpg');
  assert.deepEqual([...images.keys()], [saved.imagePath]);
  metadataError = false;
  await home.savePendingBackground();
  assert.notEqual(home.data.backgroundImagePath, saved.imagePath);
  assert.equal(home.data.pendingBackgroundPath, '');
  assert.equal(pickerCalls, 1);
  assert.equal(images.size, 1);
});

test('restore failures reflect the committed appearance and preserve the error feedback', async (t) => {
  const home = page();
  await home.chooseBackgroundImage();
  const originalPath = home.data.backgroundImagePath;
  const clear = journalBackgroundService.clear;
  const removal = t.mock.method(journalBackgroundService, 'clear', async () => {
    throw new Error('恢复默认失败');
  });
  await home.restoreDefaultBackground();
  assert.equal(home.data.backgroundImagePath, originalPath);
  assert.match(home.data.backgroundErrorMessage, /失败/u);
  removal.mock.restore();
  t.mock.method(journalBackgroundService, 'clear', async () => {
    await clear();
    throw new Error('已恢复默认，但旧图片未能清理');
  });
  await home.restoreDefaultBackground();
  assert.equal(home.data.backgroundImagePath, '');
  assert.match(home.data.backgroundErrorMessage, /已恢复默认.*清理/u);
});

test('broken background falls back and stale image errors cannot remove its replacement', async () => {
  const home = page();
  await home.chooseBackgroundImage();
  const broken = home.data.backgroundImagePath;
  home.handleBackgroundImageError({ currentTarget: { dataset: { imagePath: broken } } });
  assert.equal(home.data.backgroundImageFailed, true);
  assert.ok(home.data.backgroundErrorMessage);
  selected = media(1024, 'wxfile://tmp/replacement.jpg');
  await home.chooseBackgroundImage();
  home.handleBackgroundImageError({ currentTarget: { dataset: { imagePath: broken } } });
  assert.equal(home.data.backgroundImageFailed, false);
  assert.notEqual(home.data.backgroundImagePath, broken);
});

test('failed clarity save restores the previous visible value and keeps diary state', async (t) => {
  const home = page();
  await home.chooseBackgroundImage();
  home.data.selectedDate = '2024-02-29';
  home.data.keyword = '图书馆';
  t.mock.method(journalBackgroundService, 'setClarity', async () => {
    throw new Error('设置保存失败');
  });
  await home.changeBackgroundClarity({ detail: { value: 90 } });
  assert.equal(home.data.backgroundClarity, 55);
  assert.equal(home.data.selectedDate, '2024-02-29');
  assert.equal(home.data.keyword, '图书馆');
  assert.ok(home.data.backgroundErrorMessage);
});

test('restore default leaves diary navigation and memory content usable', async (t) => {
  const home = page();
  await home.chooseBackgroundImage();
  home.data.monthKey = '2024-02';
  t.mock.method(memoryRepository, 'listMemories', async () => []);
  await home.loadJournal();
  await home.restoreDefaultBackground();
  assert.equal(home.data.backgroundImagePath, '');
  assert.equal(home.data.backgroundClarity, 55);
  assert.equal(home.data.days.length, 29);
  home.openDay({ currentTarget: { dataset: { key: '2024-02-20' } } });
  assert.match(navigation.at(-1), /date=2024-02-20/u);
  home.openCompanion();
  assert.equal(navigation.at(-1), '/pages/companion/index');
});

test('hiding during a load prevents stale callbacks and hidden toasts', async (t) => {
  const home = page();
  let releaseRead;
  t.mock.method(
    journalBackgroundService,
    'read',
    () =>
      new Promise((resolve) => {
        releaseRead = resolve;
      }),
  );
  const reading = home.loadBackground();
  home.onHide();
  const hidden = structuredClone(home.data);
  releaseRead({ imagePath: 'wxfile://usr/sdu-memory/journal-background/stale.jpg', clarity: 90 });
  await reading;
  assert.deepEqual(home.data, hidden);
  assert.equal(toasts.length, 0);
});

test('hiding before image selection finishes prevents a stale selection from being saved', async () => {
  const home = page();
  let release;
  picker = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const choosing = home.chooseBackgroundImage();
  home.onHide();
  const hidden = structuredClone(home.data);
  release(media());
  await choosing;
  assert.deepEqual(home.data, hidden);
  assert.deepEqual(await journalBackgroundService.read(), { imagePath: '', clarity: 55 });
  home._backgroundVisible = true;
  await home.loadBackground();
  assert.equal(home.data.pendingBackgroundPath, 'wxfile://tmp/background.jpg');
  await home.savePendingBackground();
  assert.match(home.data.backgroundImagePath, /\/journal-background\//u);
});

test('native album hide and show before selection returns still saves the explicit selection', async () => {
  const home = page();
  let release;
  picker = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const choosing = home.chooseBackgroundImage();
  home.onHide();
  home._backgroundVisible = true;
  await home.loadBackground();
  release(media());
  await choosing;
  assert.match(home.data.backgroundImagePath, /\/journal-background\//u);
  assert.equal(home.data.isBackgroundSaving, false);
});

test('an unloaded page cannot accept a late album result', async () => {
  const home = page();
  let release;
  picker = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const choosing = home.chooseBackgroundImage();
  home.onUnload();
  const hidden = structuredClone(home.data);
  release(media());
  await choosing;
  assert.deepEqual(home.data, hidden);
  assert.equal(home._backgroundPendingPath, '');
  assert.deepEqual(await journalBackgroundService.read(), { imagePath: '', clarity: 55 });
});

test('returning before an old save finishes eventually unlocks the background controls', async (t) => {
  const home = page();
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const realSave = journalBackgroundService.saveImage;
  t.mock.method(journalBackgroundService, 'saveImage', async (path) => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    return realSave(path);
  });
  const choosing = home.chooseBackgroundImage();
  await ready;
  home.onHide();
  home._backgroundVisible = true;
  await home.loadBackground();
  release();
  await choosing;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(home.data.isBackgroundSaving, false);
  assert.match(home.data.backgroundImagePath, /\/journal-background\//u);
});

test('hiding during a save keeps the callback from changing hidden UI and next load recovers committed background', async (t) => {
  const home = page();
  let release;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const realSave = journalBackgroundService.saveImage;
  t.mock.method(journalBackgroundService, 'saveImage', async (path) => {
    started();
    await new Promise((resolve) => {
      release = resolve;
    });
    return realSave(path);
  });
  const choosing = home.chooseBackgroundImage();
  await ready;
  home.onHide();
  const hidden = structuredClone(home.data);
  release();
  await choosing;
  assert.deepEqual(home.data, hidden);
  assert.equal(toasts.length, 0);
  home._backgroundVisible = true;
  await home.loadBackground();
  assert.match(home.data.backgroundImagePath, /\/journal-background\//u);
  assert.equal(home.data.isBackgroundSaving, false);
  assert.equal(home.data.pendingBackgroundPath, '');
});
