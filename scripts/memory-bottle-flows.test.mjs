import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { memoryRepository } from '../miniprogram/services/repository/index.ts';
import { createBottleMemories, createBottleParticles } from '../miniprogram/utils/memory-bottle.ts';

const definitions = new Map();
let activePage = 'bottle';
let records = [];
let readRecords;
let rect;
let queryDelay;
let queryResult;
let queryCallbacks;
let frames;
let frameId;
let listeners;
let stopped;
let startOptions;
let deferSensor;
let failSensor;
let navigations;
let navigationFailure;
let canvasError;

const context = new Proxy(
  {},
  {
    get: (object, key) => object[key] ?? (() => {}),
    set: (object, key, value) => {
      object[key] = value;
      return true;
    },
  },
);
const canvas = {
  width: 0,
  height: 0,
  getContext() {
    if (canvasError) throw new Error('canvas unavailable');
    return context;
  },
  requestAnimationFrame(callback) {
    frames.set(++frameId, callback);
    return frameId;
  },
  cancelAnimationFrame(id) {
    frames.delete(id);
  },
};
const motionApis = {
  startAccelerometer(options) {
    startOptions = options;
    if (failSensor) options.fail?.({ errMsg: 'startAccelerometer:fail not supported' });
    else if (!deferSensor) options.success?.({ errMsg: 'startAccelerometer:ok' });
  },
  onAccelerometerChange(listener) {
    listeners.add(listener);
  },
  offAccelerometerChange(listener) {
    listeners.delete(listener);
  },
  stopAccelerometer(options = {}) {
    stopped++;
    options.success?.({ errMsg: 'stopAccelerometer:ok' });
    options.complete?.({ errMsg: 'stopAccelerometer:ok' });
  },
};

globalThis.Page = (definition) => definitions.set(activePage, definition);
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageInfoSync: () => ({ keys: [] }),
  getStorageSync: () => '',
  getWindowInfo: () => ({ pixelRatio: 2 }),
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
      const execute = () => callback([queryResult === null ? null : { ...rect, node: canvas }]);
      if (queryDelay) queryCallbacks.push(execute);
      else execute();
    },
  }),
  navigateTo(options) {
    navigations.push(options.url);
    if (navigationFailure) options.fail?.({ errMsg: 'navigateTo:fail' });
  },
  switchTab(options) {
    navigations.push(options.url);
  },
  stopPullDownRefresh() {},
  ...motionApis,
};

await import('../miniprogram/pages/memory-bottle/index.ts');
let avatarDefinition;
globalThis.Component = (value) => {
  avatarDefinition = value;
};
await import('../miniprogram/components/motion-avatar/index.ts');

function memory(id, overrides = {}) {
  return {
    id,
    text: '这是一段校园回忆',
    imagePaths: [],
    placeName: '图书馆',
    mood: 'happy',
    customMood: '',
    category: 'campus-life',
    customCategory: '',
    mapAssetVersion: 'campus-map-v2',
    mapXRatio: 0.5,
    mapYRatio: 0.5,
    origin: 'user',
    recordedAt: '2026-10-25T08:00:00.000Z',
    createdAt: '2026-10-25T08:00:00.000Z',
    updatedAt: '2026-10-25T08:00:00.000Z',
    ...overrides,
  };
}

function page() {
  const definition = definitions.get('bottle');
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch, callback) {
      Object.assign(this.data, patch);
      callback?.();
    },
  };
}

async function mounted() {
  const instance = page();
  await instance.onShow();
  instance.onReady();
  return instance;
}

function touch(x, y) {
  return { touches: [{ x, y }], changedTouches: [{ x, y }] };
}
function event(id) {
  return { currentTarget: { dataset: { memoryId: id } } };
}

beforeEach(() => {
  records = [memory('old-a'), memory('old-b', { mood: 'sad' })];
  readRecords = async () => structuredClone(records);
  memoryRepository.listMemories = () => readRecords();
  rect = { width: 320, height: 400, left: 10, top: 100 };
  queryDelay = false;
  queryResult = true;
  queryCallbacks = [];
  frames = new Map();
  frameId = 0;
  listeners = new Set();
  stopped = 0;
  startOptions = null;
  deferSensor = false;
  failSensor = false;
  navigations = [];
  navigationFailure = false;
  canvasError = false;
  Object.assign(globalThis.wx, motionApis);
});

test('old personal records load into the bottle and text list without new persistent data', async () => {
  const p = await mounted();
  assert.equal(p.data.totalCount, 2);
  assert.deepEqual(
    p.data.visibleMemories.map((item) => item.id),
    ['old-a', 'old-b'],
  );
  assert.equal(p.data.visibleMemories[1].moodLabel, '难过');
  assert.equal(p.data.isLoading, false);
  assert.equal(p.data.errorMessage, '');
  p.onUnload();
});

test('returning after mood edits and deletion refreshes from the original repository', async () => {
  const p = await mounted();
  const oldColor = p.data.visibleMemories[0].color;
  p.onHide();
  records = [memory('old-a', { mood: 'calm' })];
  await p.onShow();
  assert.equal(p.data.totalCount, 1);
  assert.equal(p.data.visibleMemories[0].moodLabel, '平静');
  assert.notEqual(p.data.visibleMemories[0].color, oldColor);
  p.onUnload();
});

test('more than sixty records remain reachable through bottle pagination', async () => {
  records = Array.from({ length: 121 }, (_, i) => memory('m-' + String(i).padStart(3, '0')));
  const p = await mounted();
  assert.equal(p.data.pageCount, 3);
  const ids = [...p.data.visibleMemories.map((item) => item.id)];
  p.nextBottle();
  ids.push(...p.data.visibleMemories.map((item) => item.id));
  p.nextBottle();
  ids.push(...p.data.visibleMemories.map((item) => item.id));
  p.nextBottle();
  assert.equal(p.data.pageIndex, 2);
  assert.equal(new Set(ids).size, 121);
  p.previousBottle();
  assert.equal(p.data.pageIndex, 1);
  p.onUnload();
});

test('a late read from a hidden page cannot replace the records loaded after returning', async () => {
  let resolveOld;
  readRecords = () =>
    new Promise((resolve) => {
      resolveOld = resolve;
    });
  const p = page();
  const firstLoad = p.onShow();
  p.onHide();
  readRecords = async () => [memory('latest')];
  await p.onShow();
  resolveOld([memory('obsolete')]);
  await firstLoad;
  assert.deepEqual(
    p.data.visibleMemories.map((item) => item.id),
    ['latest'],
  );
  p.onUnload();
});

test('read failure can be retried without silently showing an empty bottle', async () => {
  readRecords = async () => {
    throw new Error('回忆暂时无法读取');
  };
  const p = await mounted();
  assert.match(p.data.errorMessage, /无法读取/u);
  readRecords = async () => [memory('recovered')];
  await p.loadMemories();
  assert.equal(p.data.errorMessage, '');
  assert.equal(p.data.visibleMemories[0].id, 'recovered');
  p.onUnload();
});

test('empty history has a clear state and an action back to the recording map', async () => {
  records = [];
  const p = await mounted();
  assert.equal(p.data.totalCount, 0);
  assert.equal(p.data.errorMessage, '');
  assert.equal(listeners.size, 0);
  p.goToMap();
  assert.deepEqual(navigations, ['/pages/map/index']);
  p.onUnload();
});

test('hiding cancels the animation and removes only this page sensor callback', async () => {
  const unrelatedListener = () => {};
  listeners.add(unrelatedListener);
  const p = await mounted();
  assert.equal(frames.size, 1);
  assert.equal(listeners.size, 2);
  p.onHide();
  assert.equal(frames.size, 0);
  assert.deepEqual([...listeners], [unrelatedListener]);
  assert.ok(stopped >= 1);
  p.onUnload();
});

test('late sensor startup after hiding cannot leave a background listener or animation', async () => {
  deferSensor = true;
  const p = await mounted();
  const pending = startOptions;
  p.onHide();
  pending.success?.({ errMsg: 'startAccelerometer:ok' });
  assert.equal(listeners.size, 0);
  assert.equal(frames.size, 0);
  assert.equal(p.data.hasMotion, false);
  p.onUnload();
});

test('sensor failure preserves button shaking and access through the text list', async () => {
  failSensor = true;
  const p = await mounted();
  assert.equal(p.data.hasMotion, false);
  assert.equal(listeners.size, 0);
  assert.match(p.data.motionHint, /摇一摇/u);
  assert.doesNotThrow(() => p.shakeBottle());
  p.openMemory(event('old-a'));
  assert.equal(navigations[0], '/pages/detail/index?memoryId=old-a');
  p.onUnload();
});

test('missing motion APIs still allow the bottle and fallback controls', async () => {
  globalThis.wx.startAccelerometer = undefined;
  globalThis.wx.onAccelerometerChange = undefined;
  const p = await mounted();
  assert.equal(p.data.hasMotion, false);
  assert.equal(frames.size, 1);
  assert.doesNotThrow(() => p.shakeBottle());
  p.onUnload();
});

test('Canvas absence or initialization failure keeps all records accessible in text', async () => {
  queryResult = null;
  let p = await mounted();
  assert.equal(p.data.isCanvasUnavailable, true);
  assert.equal(p.data.isListOpen, true);
  p.openMemory(event('old-b'));
  assert.equal(navigations[0], '/pages/detail/index?memoryId=old-b');
  p.onUnload();
  queryResult = true;
  canvasError = true;
  p = await mounted();
  assert.equal(p.data.isCanvasUnavailable, true);
  assert.equal(p.data.visibleMemories.length, 2);
  p.onUnload();
});

test('late Canvas queries after unload cannot start a renderer or sensor', async () => {
  queryDelay = true;
  const p = await mounted();
  p.onUnload();
  queryCallbacks.forEach((callback) => callback());
  assert.equal(frames.size, 0);
  assert.equal(listeners.size, 0);
});

test('reinitializing Canvas does not multiply animation loops or sensor listeners', async () => {
  const p = await mounted();
  p.prepareCanvas();
  p.prepareCanvas();
  assert.equal(frames.size, 1);
  assert.equal(listeners.size, 1);
  p.onUnload();
});

test('tapping a scaled Canvas ball opens its original detail rather than an arbitrary record', async () => {
  rect = { width: 640, height: 800, left: 10, top: 100 };
  const p = await mounted();
  const ball = createBottleParticles(createBottleMemories(records))[0];
  p.handleTouchStart(touch(ball.x * 2, ball.y * 2));
  p.handleTouchEnd(touch(ball.x * 2, ball.y * 2));
  assert.equal(navigations[0], '/pages/detail/index?memoryId=' + ball.id);
  p.onUnload();
});

test('client touch coordinates remain correct after the page has scrolled', async () => {
  const p = await mounted();
  p.onPageScroll({ scrollTop: 80 });
  const ball = createBottleParticles(createBottleMemories(records))[0];
  const e = {
    touches: [{ clientX: ball.x + 10, clientY: ball.y + 20 }],
    changedTouches: [{ clientX: ball.x + 10, clientY: ball.y + 20 }],
  };
  p.handleTouchStart(e);
  p.handleTouchEnd(e);
  assert.equal(navigations[0], '/pages/detail/index?memoryId=' + ball.id);
  p.onUnload();
});

test('dragging and touches on empty glass do not open a record', async () => {
  const p = await mounted();
  const ball = createBottleParticles(createBottleMemories(records))[0];
  p.handleTouchStart(touch(ball.x - 60, ball.y));
  p.handleTouchEnd(touch(ball.x, ball.y));
  p.handleTouchStart(touch(160, 80));
  p.handleTouchEnd(touch(160, 80));
  assert.deepEqual(navigations, []);
  p.onUnload();
});

test('stale IDs cannot navigate and navigation failure produces a visible retry hint', async () => {
  const p = await mounted();
  p.openMemory(event('missing'));
  assert.deepEqual(navigations, []);
  navigationFailure = true;
  p.openMemory(event('old-a'));
  assert.match(p.data.actionMessage, /打开|重试/u);
  p.onUnload();
});

test('malformed native sensor samples cannot crash the page or its animation', async () => {
  const p = await mounted();
  for (const sample of [null, {}, { errMsg: 'sensor unavailable' }, { x: NaN, y: 1, z: 0 }]) {
    for (const listener of listeners) assert.doesNotThrow(() => listener(sample));
  }
  assert.equal(frames.size, 1);
  p.onUnload();
});

activePage = 'timeline';
await import('../miniprogram/pages/timeline/index.ts');

test('the timeline memory bottle entry opens the registered personal bottle page', () => {
  const definition = definitions.get('timeline');
  const timeline = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  timeline.openMemoryBottle();
  assert.deepEqual(navigations, ['/pages/memory-bottle/index']);
  navigationFailure = true;
  timeline.openMemoryBottle();
  assert.match(timeline.data.actionMessage, /记忆瓶|打开/u);
});

test('a hidden bottle late startup cannot stop a newer visible bottle sensor', async () => {
  deferSensor = true;
  const first = await mounted();
  const pending = startOptions;
  first.onHide();
  deferSensor = false;
  const second = await mounted();
  try {
    const before = stopped;
    pending.success?.({ errMsg: 'startAccelerometer:ok' });
    assert.equal(stopped, before, 'old startup stopped the new owner');
    assert.equal(second.data.hasMotion, true);
    assert.equal(listeners.size, 1);
  } finally {
    first.onUnload();
    second.onUnload();
  }
});

test('Canvas failure while startup is pending stops an orphaned late sensor success', async () => {
  deferSensor = true;
  const p = await mounted();
  const pending = startOptions;
  p.canvasUnavailable();
  try {
    const before = stopped;
    pending.success?.({ errMsg: 'startAccelerometer:ok' });
    assert.ok(stopped > before, 'orphaned startup was not stopped');
    assert.equal(listeners.size, 0);
    assert.equal(frames.size, 0);
  } finally {
    p.onUnload();
  }
});

test('every 60 Hz animation callback paints rather than skipping alternate frames', async () => {
  let paints = 0;
  const original = context.clearRect;
  context.clearRect = () => {
    paints++;
  };
  const p = await mounted();
  try {
    paints = 0;
    for (let frame = 0; frame < 60; frame++) {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback((frame * 1000) / 60);
    }
    assert.ok(paints >= 58, 'only painted ' + paints + ' out of 60 callbacks');
  } finally {
    p.onUnload();
    context.clearRect = original;
  }
});

test('high refresh rate callbacks keep movement and rendering continuous', async () => {
  let paints = 0;
  const original = context.clearRect;
  context.clearRect = () => {
    paints++;
  };
  const p = await mounted();
  try {
    paints = 0;
    for (let frame = 0; frame < 120; frame++) {
      const [id, callback] = frames.entries().next().value;
      frames.delete(id);
      callback((frame * 1000) / 120);
    }
    assert.ok(paints >= 115, 'high-refresh rendering dropped to ' + paints);
  } finally {
    p.onUnload();
    context.clearRect = original;
  }
});

test('retina backing pixels are bounded without increasing per-frame fill cost beyond 2x', async () => {
  const original = wx.getWindowInfo;
  wx.getWindowInfo = () => ({ pixelRatio: 3 });
  const p = await mounted();
  try {
    assert.equal(canvas.width, rect.width * 2);
    assert.equal(canvas.height, rect.height * 2);
  } finally {
    p.onUnload();
    wx.getWindowInfo = original;
  }
});

test('the merged release keeps all four diary tabs and the latest personal tools', async () => {
  const { readFileSync } = await import('node:fs');
  const config = JSON.parse(
    readFileSync(new URL('../miniprogram/app.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    config.tabBar.list.map((item) => item.pagePath),
    [
      'pages/journal/index',
      'pages/map/index',
      'pages/timeline/index',
      'pages/pal/index',
      'pages/profile/index',
    ],
  );
  for (const route of [
    'pages/journal/index',
    'pages/album/index',
    'pages/location-picker/index',
    'pages/selection-wheel/index',
    'pages/memory-bottle/index',
  ]) {
    assert.ok(config.pages.includes(route), 'lost route ' + route);
  }
  activePage = 'profile';
  await import('../miniprogram/pages/profile/index.ts');
  const definition = definitions.get('profile');
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
  p.openSection({ currentTarget: { dataset: { page: 'memory-bottle' } } });
  assert.equal(navigations.at(-1), '/pages/memory-bottle/index');
  assert.equal(typeof p.openMoodDefaults, 'function');
  assert.equal(typeof p.openCategoryDefaults, 'function');
  assert.equal(typeof p.toggleHaptics, 'function');
});

function mountedAvatar() {
  const defaults = Object.fromEntries(
    Object.entries(avatarDefinition.properties).map(([key, prop]) => [key, prop.value]),
  );
  const avatar = {
    data: { ...structuredClone(avatarDefinition.data), ...defaults, motionEnabled: true },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    triggerEvent() {},
  };
  for (const [name, method] of Object.entries(avatarDefinition.methods))
    avatar[name] = method.bind(avatar);
  avatarDefinition.lifetimes.attached.call(avatar);
  return avatar;
}
test('hiding the bottle does not stop a visible profile avatar subscription', async () => {
  const avatar = mountedAvatar();
  const bottle = await mounted();
  try {
    const before = stopped;
    bottle.onHide();
    assert.equal(stopped, before, 'bottle stopped the visible avatar sensor');
    assert.equal(avatar.data.motionStatus, 'running');
    assert.equal(listeners.size, 1);
  } finally {
    bottle.onUnload();
    avatarDefinition.lifetimes.detached.call(avatar);
  }
});
test('an old bottle startup cannot stop a newer profile avatar', async () => {
  deferSensor = true;
  const bottle = await mounted();
  const pending = startOptions;
  bottle.onHide();
  deferSensor = false;
  const avatar = mountedAvatar();
  try {
    const before = stopped;
    pending.success?.({ errMsg: 'startAccelerometer:ok' });
    assert.equal(stopped, before, 'late bottle start stopped the profile avatar');
    assert.equal(avatar.data.motionStatus, 'running');
    assert.equal(listeners.size, 1);
  } finally {
    bottle.onUnload();
    avatarDefinition.lifetimes.detached.call(avatar);
  }
});
