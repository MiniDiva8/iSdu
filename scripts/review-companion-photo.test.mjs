import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { companionService } from '../miniprogram/services/companion-service.ts';
import { createCompanionState } from '../miniprogram/utils/companion-engine.ts';

let definition;
globalThis.Page = (value) => {
  definition = value;
};
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageInfoSync: () => ({ keys: [] }),
  getStorageSync: () => '',
};
await import('../miniprogram/pages/companion/photo/index.ts');

let saveRequests;
let exports;
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function page() {
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}
beforeEach(() => {
  saveRequests = [];
  exports = [];
  companionService.read = () => createCompanionState('2026-10-29T00:00:00Z');
  const context = new Proxy(
    {},
    {
      get: (object, key) => object[key] ?? (() => {}),
      set: (object, key, value) => ((object[key] = value), true),
    },
  );
  const canvas = {
    getContext: () => context,
    createImage: () => ({
      set src(value) {
        queueMicrotask(() => this.onload?.());
      },
    }),
  };
  wx.createSelectorQuery = () => ({
    in() {
      return this;
    },
    select() {
      return this;
    },
    fields() {
      return this;
    },
    exec(callback) {
      callback([{ node: canvas }]);
    },
  });
  wx.canvasToTempFilePath = (options) => exports.push(options);
  wx.saveImageToPhotosAlbum = (options) => saveRequests.push(options);
});

for (const outcome of ['success', 'fail']) {
  test(`an old album save ${outcome} cannot clear a newer photo generation after return`, async () => {
    const p = page();
    p.onShow();
    p.onReady();
    await flush();
    exports[0].success({ tempFilePath: 'wxfile://first' });
    await flush();
    const saving = p.savePhoto();
    p.onHide();
    p.onShow();
    await flush();
    assert.equal(exports.length, 2);
    assert.equal(p.data.busy, true);
    const currentMessage = p.data.actionMessage;
    saveRequests[0][outcome]();
    await saving;
    assert.equal(p.data.busy, true, 'the current generation still owns the busy state');
    assert.equal(p.data.actionMessage, currentMessage);
    exports[1].success({ tempFilePath: 'wxfile://second' });
    await flush();
    assert.equal(p.data.busy, false);
    assert.equal(p.data.imagePath, 'wxfile://second');
    p.onUnload();
  });
}
