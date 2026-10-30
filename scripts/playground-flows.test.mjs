import assert from 'node:assert/strict';
import { beforeEach, afterEach, test, mock } from 'node:test';
import { CompanionService, companionService } from '../miniprogram/services/companion-service.ts';

let definition;
let service;
let storage;
let listResult;
let storageFails;
let navigate;
let frames;
let delayedQueries;
let canvasFails;
let imageSources;
let pageStack;
let backCalls;
let lastNavigation;
let canvasTop;
let canvasWidth;
let canvasHeight;
let scrollRequests;
let pages;
const originalRandom = Math.random;
const context = new Proxy(
  { createLinearGradient: () => ({ addColorStop() {} }) },
  { get: (o, k) => o[k] ?? (() => {}) },
);
const canvas = {
  getContext() {
    if (canvasFails) throw Error('canvas unavailable');
    return context;
  },
  requestAnimationFrame(callback) {
    const id = (this.serial = (this.serial ?? 0) + 1);
    frames.set(id, callback);
    return id;
  },
  cancelAnimationFrame(id) {
    frames.delete(id);
  },
  createImage: () => ({
    set src(value) {
      imageSources.push(value);
      queueMicrotask(() => this.onload?.());
    },
  }),
};
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getWindowInfo: () => ({
    statusBarHeight: 24,
    windowWidth: 390,
    windowHeight: 844,
    pixelRatio: 3,
  }),
  getMenuButtonBoundingClientRect: () => ({ top: 28, bottom: 60, width: 87, height: 32 }),
  getStorageInfoSync: () => ({ keys: [] }),
  getStorageSync: () => '',
  navigateTo: (options) => {
    lastNavigation = options;
    navigate.push(options.url);
  },
  switchTab: (options) => navigate.push(options.url),
  navigateBack: (options) => backCalls.push(options?.delta ?? 1),
  pageScrollTo: (options) => scrollRequests.push(options),
  createSelectorQuery: () => ({
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
      const invoke = () =>
        callback([
          { node: canvas, width: canvasWidth, height: canvasHeight, left: 30, top: canvasTop },
        ]);
      if (delayedQueries) delayedQueries.push(invoke);
      else invoke();
    },
  }),
};
globalThis.Page = (value) => {
  definition = value;
};
globalThis.getCurrentPages = () => pageStack;
await import('../miniprogram/pages/companion/playground/index.ts');

function page() {
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch, done) {
      Object.assign(this.data, patch);
      done?.();
    },
  };
  pages.push(p);
  return p;
}
const choose = (p, id) => p.selectPartner({ currentTarget: { dataset: { id } } });
beforeEach(async () => {
  mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.parse('2026-10-28T08:00:00Z') });
  // Keep the first partner lucky while letting the real request-ID factory stay unique.
  let randomSerial = 0;
  Math.random = () => ++randomSerial / 1000000;
  storage = new Map();
  storageFails = false;
  listResult = null;
  navigate = [];
  frames = new Map();
  delayedQueries = null;
  canvasFails = false;
  imageSources = [];
  pageStack = [];
  backCalls = [];
  lastNavigation = null;
  canvasTop = 210;
  canvasWidth = 390;
  canvasHeight = 844;
  scrollRequests = [];
  pages = [];
  service = new CompanionService(
    {
      has: (key) => storage.has(key),
      read: (key) => storage.get(key),
      remove: (key) => storage.delete(key),
      write(key, value) {
        if (storageFails) throw Error('storage full');
        storage.set(key, value);
      },
    },
    () => listResult ?? Promise.resolve([]),
  );
  for (const method of ['read', 'facts', 'dispatch'])
    companionService[method] = service[method].bind(service);
  await service.dispatch({ type: 'adopt', name: '途途' });
});
afterEach(() => {
  for (const p of pages) p.onUnload();
  Math.random = originalRandom;
  mock.timers.reset();
});

test('ordinary notes navigate to the real journal without marking a task or changing the wallet', async () => {
  const p = page();
  await p.onShow();
  const before = JSON.stringify(service.read());
  await choose(p, 'sunshine');
  assert.equal(p.data.selectedNote.task.id, 'write');
  await p.performNoteAction();
  assert.deepEqual(navigate, ['/pages/journal/index']);
  assert.equal(JSON.stringify(service.read()), before);
});

test('lucky find records real interaction, and claiming then replaying cannot award another ten points', async () => {
  await service.dispatch({ type: 'claim', taskId: 'welcome' });
  const p = page();
  await p.onShow();
  const before = service.read().crystals;
  await choose(p, 'sprout');
  assert.equal(p.data.won, true);
  assert.equal(service.read().crystals, before);
  assert.equal(p.data.selectedNote.task.id, 'play');
  await p.performNoteAction();
  assert.equal(service.read().crystals, before + 10);
  p.restart();
  await choose(p, 'sprout');
  assert.equal(service.read().crystals, before + 10);
  await assert.rejects(
    service.dispatch({ type: 'claim', taskId: 'play' }),
    (error) => error.code === 'ALREADY_CLAIMED',
  );
});

test('the active lucky countdown opens tasks once; cancel, restart and hide prevent automatic navigation', async () => {
  const p = page();
  await p.onShow();
  await choose(p, 'sprout');
  assert.equal(p.data.countdown, 5);
  p.cancelCountdown();
  mock.timers.tick(6000);
  assert.deepEqual(navigate, []);
  p.restart();
  await choose(p, 'sprout');
  p.restart();
  mock.timers.tick(6000);
  assert.deepEqual(navigate, []);
  await choose(p, 'sprout');
  p.onHide();
  mock.timers.tick(6000);
  assert.deepEqual(navigate, []);
  await p.onShow();
  assert.equal(p.data.countdown, 0);
  p.restart();
  await choose(p, 'sprout');
  for (let i = 0; i < 6; i++) mock.timers.tick(1000);
  assert.deepEqual(navigate, ['/pages/companion/tasks/index']);
});

test('canvas failure keeps every partner available in the native list and hide cancels animation', async () => {
  const p = page();
  await p.onShow();
  canvasFails = true;
  p.onReady();
  assert.equal(p.data.canvasUnavailable, true);
  assert.equal(p.data.listOpen, true);
  assert.equal(p.data.notes.length, 8);
  await choose(p, 'cocoa');
  assert.equal(p.data.selectedNote.task.id, 'letter');
  p.closeNote();
  canvasFails = false;
  p.retryCanvas();
  assert.ok(frames.size > 0);
  assert.equal(canvas.width, 780);
  p.toggleMotion();
  assert.equal(frames.size, 0);
  p.toggleMotion();
  assert.ok(frames.size > 0);
  p.onHide();
  assert.equal(frames.size, 0);
});

test('late fact and canvas replies after hide cannot repaint the page', async () => {
  const p = page();
  await p.onShow();
  delayedQueries = [];
  p.onReady();
  p.onHide();
  const before = structuredClone(p.data);
  delayedQueries.forEach((invoke) => invoke());
  assert.deepEqual(p.data, before);
  let release;
  listResult = new Promise((resolve) => {
    release = resolve;
  });
  const showing = p.onShow();
  p.onHide();
  const hidden = structuredClone(p.data);
  release([]);
  await showing;
  assert.deepEqual(p.data, hidden);
});

test('failed facts block task actions and recover with a real reread', async () => {
  listResult = Promise.reject(Error('memory unavailable'));
  const p = page();
  await p.onShow();
  assert.equal(p.data.tasksReady, false);
  assert.match(p.data.actionMessage, /memory unavailable/);
  const before = service.read().crystals;
  await choose(p, 'sprout');
  await p.performNoteAction();
  assert.equal(service.read().crystals, before);
  assert.deepEqual(navigate, []);
  listResult = null;
  await p.reload();
  assert.equal(p.data.tasksReady, true);
});

test('a failed interaction write cannot show a saved reward or start the countdown', async () => {
  const p = page();
  await p.onShow();
  storageFails = true;
  await choose(p, 'sprout');
  assert.equal(p.data.countdown, 0);
  assert.match(p.data.actionMessage, /storage full/);
  assert.equal(service.read().events.play.length, 0);
  assert.equal(p.data.busy, false);
});

test('a claim finishing across hide and show releases the action lock and refreshes the actual wallet', async () => {
  await service.dispatch({ type: 'claim', taskId: 'welcome' });
  const p = page();
  await p.onShow();
  await choose(p, 'sprout');
  const before = service.read().crystals;
  let release;
  listResult = new Promise((resolve) => {
    release = resolve;
  });
  const claiming = p.performNoteAction();
  p.onHide();
  const showing = p.onShow();
  release([]);
  await Promise.all([claiming, showing]);
  assert.equal(p.data.busy, false);
  assert.equal(p.data.state.crystals, before + 10);
  assert.equal(p.data.countdown, 0);
});

test('unadopted deep links show the home invitation and cannot record interaction', async () => {
  service.clear();
  const p = page();
  await p.onShow();
  await choose(p, 'sprout');
  assert.equal(p.data.state.adoptedAt, null);
  assert.equal(p.data.notes.length, 0);
  assert.equal(service.read().events.play.length, 0);
  p.goHome();
  assert.deepEqual(navigate, ['/pages/companion/index']);
});

test('retrying failed task facts also loads the character art after the canvas mounted without notes', async () => {
  listResult = Promise.reject(Error('temporary read failure'));
  const p = page();
  await p.onShow();
  p.onReady();
  assert.equal(imageSources.length, 0);
  listResult = null;
  await p.reload();
  assert.equal(imageSources.length, 8);
  assert.ok(imageSources.includes('/assets/companion/tutu_map.png'));
});

test('ordinary notes keep their ordinary identity after the lucky partner was already found', async () => {
  const p = page();
  await p.onShow();
  await choose(p, 'sprout');
  assert.equal(p.data.selectedLucky, true);
  await choose(p, 'sunshine');
  assert.equal(p.data.selectedLucky, false);
  assert.equal(p.data.selectedNote.task.id, 'write');
});

test('a task note stays on the full-screen field without scrolling away from the tapped partner', async () => {
  const p = page();
  await p.onShow();
  await choose(p, 'sunshine');
  assert.deepEqual(scrollRequests, []);
  assert.equal(p.data.stageHeight, 844);
  assert.ok(p.data.paperTop >= 76 && p.data.paperTop + p.data.paperHeight <= 780);
});

test('returning to tasks reuses the page on the navigation stack', async () => {
  const p = page();
  await p.onShow();
  pageStack = [
    { route: 'pages/companion/tasks/index' },
    { route: 'pages/companion/playground/index' },
  ];
  p.goTasks();
  assert.deepEqual(backCalls, [1]);
  assert.deepEqual(navigate, []);
});

test('failed navigation is recoverable and its late failure cannot repaint a hidden playground', async () => {
  const p = page();
  await p.onShow();
  p.toggleMenu();
  p.goTasks();
  assert.equal(p.data.menuOpen, false);
  lastNavigation.fail();
  assert.ok(p.data.actionMessage);
  p.onHide();
  const before = p.data.actionMessage;
  lastNavigation.fail();
  assert.equal(p.data.actionMessage, before);
  await p.onShow();
  p.setData({ actionMessage: 'refreshed page' });
  lastNavigation.fail();
  assert.equal(p.data.actionMessage, 'refreshed page');
});

test('a swipe over a partner does not count as a tap, while a fresh client-coordinate tap after scrolling does', async () => {
  const p = page();
  await p.onShow();
  p.onReady();
  // At the full 390x844 viewport the seeded first partner is approximately (166, 76).
  p.onCanvasTouchStart({ touches: [{ x: 166, y: 76, clientX: 196, clientY: 286 }] });
  p.onCanvasTouchMove({ touches: [{ x: 181, y: 76, clientX: 211, clientY: 286 }] });
  p.onCanvasTouchEnd({ changedTouches: [{ x: 181, y: 76, clientX: 211, clientY: 286 }] });
  assert.equal(p.data.won, false);
  canvasTop = 100;
  p.onCanvasTouchStart({ touches: [{ clientX: 196, clientY: 176 }] });
  p.onCanvasTouchEnd({ changedTouches: [{ clientX: 196, clientY: 176 }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(p.data.selectedId, 'sprout');
  assert.equal(p.data.won, true);
});

test('replay and selection after Beijing midnight reread daily completion without leaving the page', async () => {
  mock.timers.setTime(Date.parse('2026-10-28T15:59:50Z'));
  await service.dispatch({ type: 'claim', taskId: 'welcome' });
  await service.dispatch({ type: 'interact' });
  await service.dispatch({ type: 'claim', taskId: 'play' });
  const seeded = Math.random;
  Math.random = () => 0.9;
  const p = page();
  await p.onShow();
  Math.random = seeded;
  await choose(p, 'sprout');
  assert.equal(p.data.selectedNote.task.claimed, true);
  mock.timers.setTime(Date.parse('2026-10-28T16:00:10Z'));
  await p.restart();
  assert.equal(p.data.notes.find((note) => note.id === 'sprout').task.claimed, false);
  await choose(p, 'sprout');
  assert.equal(p.data.selectedNote.task.claimed, false);
});

test('reopening the lucky note keeps the current recommended task without another interaction or countdown', async () => {
  const seeded = Math.random;
  Math.random = () => 0.5;
  const p = page();
  await p.onShow();
  Math.random = seeded;
  await choose(p, 'sky_1');
  assert.equal(p.data.selectedNote.task.id, 'welcome');
  const before = JSON.stringify(service.read());
  p.closeNote();
  await choose(p, 'sky_1');
  assert.equal(p.data.selectedNote.task.id, 'welcome');
  assert.equal(p.data.selectedNote.task.eligible, true);
  assert.equal(p.data.countdown, 0);
  assert.equal(JSON.stringify(service.read()), before);
});

test('every different paper is keyed for a fresh native flip, and closing removes the paper instance', async () => {
  const p = page();
  await p.onShow();
  await choose(p, 'sunshine');
  const first = p.data.paperCards[0].key;
  await choose(p, 'sky');
  assert.ok(p.data.paperCards[0].key > first);
  p.closeNote();
  assert.deepEqual(p.data.paperCards, []);
});

test('resizing an open paper reanchors it to its character inside the new viewport', async () => {
  const p = page();
  await p.onShow();
  p.onReady();
  await choose(p, 'sunshine');
  canvasWidth = 280;
  canvasHeight = 500;
  p.onResize();
  assert.ok(p.data.paperLeft >= 10 && p.data.paperLeft + p.data.paperWidth <= 270);
  assert.ok(p.data.paperTop >= 76 && p.data.paperTop + p.data.paperHeight <= 436);
});
