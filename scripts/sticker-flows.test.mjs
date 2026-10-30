import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { stickerDraftService } from '../miniprogram/services/sticker-draft-service.ts';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import { localImageService } from '../miniprogram/services/local-image-service.ts';
import { prepareImageForSafety } from '../miniprogram/services/image-safety-service.ts';
import {
  createStickerDocument,
  appendStickerLayer,
  createTextLayer,
} from '../miniprogram/utils/sticker-document.ts';

const definitions = new Map(),
  storage = new Map();
let current, navigation, emissions, exportFail, pendingExport, deferExport, canvasMissing;
let exportOptions, exportedBytes;
const context = new Proxy(
  { getImageData: () => ({ data: new Uint8ClampedArray([53, 64, 46, 255]) }) },
  { get: (o, k) => o[k] ?? (() => {}) },
);
const canvas = {
  getContext: () => context,
  requestAnimationFrame: (callback) => setTimeout(callback, 0),
  cancelAnimationFrame: clearTimeout,
};
globalThis.Page = (value) => definitions.set(current, value);
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageInfoSync: () => ({ keys: [...storage.keys()] }),
  getStorageSync: (k) => storage.get(k) ?? '',
  setStorageSync: (k, v) => storage.set(k, v),
  removeStorageSync: (k) => storage.delete(k),
  getWindowInfo: () => ({ windowWidth: 390, pixelRatio: 2 }),
  enableAlertBeforeUnload() {},
  disableAlertBeforeUnload() {},
  showToast() {},
  showModal: (o) => o.success?.({ confirm: true, cancel: false }),
  navigateTo: (options) => {
    navigation.push(options);
    options.success?.({});
  },
  navigateBack: (options) => {
    navigation.push({ url: 'back' });
    options?.success?.({});
  },
  switchTab: (options) => navigation.push(options),
  createSelectorQuery: () => ({
    in() {
      return this;
    },
    select() {
      this.all = false;
      return this;
    },
    selectAll() {
      this.all = true;
      return this;
    },
    fields() {
      return this;
    },
    exec(callback) {
      callback([
        this.all
          ? []
          : canvasMissing
            ? {}
            : { node: canvas, width: 300, height: 300, left: 20, top: 50 },
      ]);
    },
  }),
  canvasToTempFilePath: (options) => {
    exportOptions = options;
    const complete = () =>
      exportFail
        ? options.fail({ errMsg: 'export failed' })
        : options.success({ tempFilePath: 'wxfile://tmp_sticker.png' });
    if (deferExport) pendingExport = complete;
    else complete();
  },
  getFileSystemManager: () => ({
    getFileInfo: (options) => options.success({ size: exportedBytes }),
  }),
  getImageInfo: (options) =>
    options.success({
      width: exportOptions.destWidth,
      height: exportOptions.destHeight,
      type: 'png',
    }),
  compressImage: (options) => options.success({ tempFilePath: 'compressed.jpg' }),
};
globalThis.getCurrentPages = () => [];
for (const name of ['editor', 'sticker-studio']) {
  current = name;
  try {
    await import('../miniprogram/pages/' + name + '/index.ts');
  } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
}
function page(name) {
  const d = definitions.get(name);
  assert.ok(d, name + ' must register a page');
  return {
    ...d,
    data: structuredClone(d.data),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      callback?.();
    },
    getOpenerEventChannel: () => ({ emit: (name, value) => emissions.push({ name, value }) }),
  };
}
function studio() {
  const p = page('sticker-studio');
  p.onLoad({});
  p.onShow?.();
  p.onReady();
  return p;
}
function editor() {
  const p = page('editor');
  p.onLoad({ source: 'journal', date: '2026-10-28' });
  p.onShow();
  return p;
}
beforeEach(() => {
  storage.clear();
  navigation = [];
  emissions = [];
  exportFail = false;
  pendingExport = null;
  deferExport = false;
  canvasMissing = false;
  exportOptions = null;
  exportedBytes = 80000;
});

test('hidden diary opener accepts its artwork exactly once and retains selected photos', () => {
  const p = editor();
  p.data.images = [
    { id: 'photo', path: 'wxfile://tmp_photo.jpg', isTemporary: true, loadFailed: false },
  ];
  assert.equal(typeof p.openStickerStudio, 'function');
  p.openStickerStudio();
  p.onHide();
  const event = navigation[0].events.stickerCreated;
  event({ path: 'wxfile://tmp_sticker.png' });
  event({ path: 'wxfile://tmp_sticker.png' });
  assert.deepEqual(
    p.data.images.map((i) => i.path),
    ['wxfile://tmp_photo.jpg', 'wxfile://tmp_sticker.png'],
  );
  assert.equal(p.data.isDirty, true);
  p.onUnload();
});
test('full capacity, saving and unloaded editors cannot receive artwork', () => {
  const p = editor();
  p.openStickerStudio();
  const event = navigation[0].events.stickerCreated;
  p.data.images = Array.from({ length: 3 }, (_, i) => ({ path: 'photo-' + i }));
  event({ path: 'wxfile://tmp_art.png' });
  assert.equal(p.data.images.length, 3);
  assert.match(p.data.formError, /3|三/);
  p.data.images = [];
  p.onShow();
  p.openStickerStudio();
  const late = navigation.at(-1).events.stickerCreated;
  p.onUnload();
  late({ path: 'wxfile://tmp_late.png' });
  assert.equal(p.data.images.length, 0);
});
test('untrusted paths and old navigation callbacks never append images', () => {
  const p = editor();
  p.openStickerStudio();
  const old = navigation[0].events.stickerCreated;
  old({ path: 'https://example.com/art.png' });
  assert.equal(p.data.images.length, 0);
  p.onShow();
  p.openStickerStudio();
  old({ path: 'wxfile://tmp_old.png' });
  assert.equal(p.data.images.length, 0);
  p.onUnload();
});
test('sticker alone saves and reopens through the real diary repository', async () => {
  const original = localImageService.persistTempImages;
  localImageService.persistTempImages = async () => ['wxfile://usr/sdu-memory/images/sticker.png'];
  try {
    const p = editor();
    p.openStickerStudio();
    navigation[0].events.stickerCreated({ path: 'wxfile://tmp_art.png' });
    await p.saveMemory();
    p.onUnload();
    const saved = await memoryRepository.getMemoryById(p.data.memoryId);
    assert.equal(saved.text, '');
    assert.deepEqual(saved.imagePaths, ['wxfile://usr/sdu-memory/images/sticker.png']);
    const reopened = editor();
    await reopened.loadMemory(saved.id);
    assert.equal(reopened.data.images.length, 1);
    reopened.onUnload();
  } finally {
    localImageService.persistTempImages = original;
  }
});
test('blank canvas cannot export; adding text produces one PNG event and preserves draft', async () => {
  const p = studio();
  await p.addToDiary();
  assert.equal(emissions.length, 0);
  p.handleTextInput({ detail: { value: '图书馆的傍晚' } });
  p.addText();
  await p.addToDiary();
  assert.equal(emissions.length, 1);
  assert.equal(emissions[0].name, 'stickerCreated');
  assert.equal(emissions[0].value.path, 'wxfile://tmp_sticker.png');
  assert.equal(stickerDraftService.read().layers[0].text, '图书馆的傍晚');
  p.onUnload();
});
test('draft restore, undo and redo update actual persisted document', () => {
  stickerDraftService.save(
    appendStickerLayer(createStickerDocument(), createTextLayer('上次未画完', '#35402e')),
  );
  const p = studio();
  assert.equal(p.data.layerCount, 1);
  p.addStamp({ currentTarget: { dataset: { id: 'book' } } });
  assert.equal(stickerDraftService.read().layers.length, 2);
  p.undo();
  assert.equal(stickerDraftService.read().layers.length, 1);
  p.redo();
  assert.equal(stickerDraftService.read().layers.length, 2);
  p.onUnload();
});
test('one touch gesture is one undoable stroke, cancel does not commit', () => {
  const p = studio();
  p.chooseTool({ currentTarget: { dataset: { tool: 'pen' } } });
  p.touchStart({ touches: [{ x: 25, y: 30 }] });
  p.touchMove({ touches: [{ x: 100, y: 110 }] });
  p.touchEnd({ changedTouches: [{ x: 150, y: 150 }] });
  const draft = stickerDraftService.read();
  assert.equal(draft.layers.length, 1);
  assert.ok(draft.layers[0].points.length >= 2);
  p.touchStart({ touches: [{ x: 80, y: 90 }] });
  p.touchCancel();
  assert.equal(stickerDraftService.read().layers.length, 1);
  p.undo();
  assert.equal(stickerDraftService.read().layers.length, 0);
  p.onUnload();
});
test('export failure and storage failure preserve current editable artwork', async () => {
  const p = studio();
  p.addStamp({ currentTarget: { dataset: { id: 'flower' } } });
  exportFail = true;
  await p.addToDiary();
  assert.equal(emissions.length, 0);
  assert.equal(p.data.layerCount, 1);
  assert.equal(p.data.isExporting, false);
  assert.match(p.data.notice, /失败|重试/);
  const original = stickerDraftService.save;
  stickerDraftService.save = () => {
    throw Error('满了');
  };
  try {
    p.addStamp({ currentTarget: { dataset: { id: 'sun' } } });
    assert.equal(p.data.layerCount, 2);
    assert.match(p.data.draftNotice, /未|失败/);
  } finally {
    stickerDraftService.save = original;
  }
  p.onUnload();
});
test('late export callbacks after hide or unload do not emit or navigate', async () => {
  const p = studio();
  p.addStamp({ currentTarget: { dataset: { id: 'heart' } } });
  deferExport = true;
  const pending = p.addToDiary();
  p.onHide();
  pendingExport();
  await pending;
  assert.equal(emissions.length, 0);
  assert.equal(navigation.length, 0);
  p.onUnload();
});
test('unavailable Canvas offers retry without losing a restored draft', () => {
  stickerDraftService.save(
    appendStickerLayer(createStickerDocument(), createTextLayer('仍然保留', '#35402e')),
  );
  canvasMissing = true;
  const p = studio();
  assert.equal(p.data.ready, false);
  assert.match(p.data.notice, /画布|重试/);
  canvasMissing = false;
  p.initCanvas();
  assert.equal(p.data.ready, true);
  assert.equal(p.data.layerCount, 1);
  p.onUnload();
});

test('resize cancels an in-flight export and leaves controls available for retry', async () => {
  const p = studio();
  p.addStamp({ currentTarget: { dataset: { id: 'tea' } } });
  deferExport = true;
  const pending = p.addToDiary();
  p.onResize();
  pendingExport();
  await pending;
  assert.equal(p.data.ready, true);
  assert.equal(p.data.isExporting, false);
  assert.equal(p.data.layerCount, 1);
  assert.equal(emissions.length, 0);
  deferExport = false;
  await p.addToDiary();
  assert.equal(emissions.length, 1);
  p.onUnload();
});

test('client-coordinate dragging remains correct after page scrolling', () => {
  const p = studio();
  p.addStamp({ currentTarget: { dataset: { id: 'book' } } });
  p.onPageScroll({ scrollTop: 100 });
  p.touchStart({ touches: [{ clientX: 170, clientY: 100 }] });
  p.touchMove({ touches: [{ clientX: 190, clientY: 120 }] });
  p.touchEnd({ touches: [] });
  const stamp = stickerDraftService.read().layers[0];
  assert.equal(stamp.x, 204);
  assert.equal(stamp.y, 204);
  p.onUnload();
});

test('pinch scaling and rotation commit as one undoable object change', () => {
  const p = studio();
  p.addStamp({ currentTarget: { dataset: { id: 'heart' } } });
  p.touchStart({
    touches: [
      { x: 125, y: 150 },
      { x: 175, y: 150 },
    ],
  });
  p.touchMove({
    touches: [
      { x: 150, y: 100 },
      { x: 150, y: 200 },
    ],
  });
  p.touchEnd({ touches: [] });
  const transformed = stickerDraftService.read().layers[0];
  assert.equal(transformed.scale, 2);
  assert.equal(transformed.rotation, 90);
  p.undo();
  assert.equal(stickerDraftService.read().layers[0].scale, 1);
  p.onUnload();
});

test('exported transparent PNG passes existing cloud safety preparation unchanged', async () => {
  const p = studio();
  p.addStamp({ currentTarget: { dataset: { id: 'flower' } } });
  await p.addToDiary();
  const path = emissions[0].value.path;
  assert.equal(await prepareImageForSafety(path), path);
  assert.equal(exportOptions.fileType, 'png');
  p.onUnload();
});

test('oversized artwork does not enter the JPEG photo-compression path', async () => {
  const p = studio();
  p.addStamp({ currentTarget: { dataset: { id: 'cat' } } });
  exportedBytes = 950 * 1024;
  await p.addToDiary();
  assert.equal(emissions.length, 0);
  assert.equal(p.data.layerCount, 1);
  assert.equal(p.data.isExporting, false);
  p.onUnload();
});
