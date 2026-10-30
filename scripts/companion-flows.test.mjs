import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { companionService } from '../miniprogram/services/companion-service.ts';
import {
  createCompanionState,
  applyCompanionCommand,
} from '../miniprogram/utils/companion-engine.ts';
import { EMPTY_COMPANION_FACTS } from '../miniprogram/models/companion.ts';
import { cloudCompanionRepository } from '../miniprogram/services/repository/cloud-companion-repository.ts';
import { companionTopInset } from '../miniprogram/services/companion-page.ts';
import { cloudAuthRepository } from '../miniprogram/services/repository/cloud-auth-repository.ts';
import { cloudModeService } from '../miniprogram/services/cloud/cloud-mode-service.ts';
import { worldToScreen } from '../miniprogram/utils/companion-scene.ts';
const defs = new Map();
let name = '';
let state;
let saved = [];
let frameCallbacks;
let stopped;
let delayedFacts;
let navigate = [];
let visitorFetch;
let delayCanvas = false;
let canvasQueries = [];
let canvasThrows = false;
let exportRequests = [];
let paintedAssets = [];
let cloudMarked = false;
let visitWrites = 0;
let canvasTranslations = [];
globalThis.Page = (d) => defs.set(name, d);
const ctx = new Proxy(
  {
    translate(x, y) {
      canvasTranslations.push([x, y]);
    },
    drawImage(image) {
      paintedAssets.push(image?._src ?? 'cache');
    },
  },
  { get: (o, k) => o[k] ?? (() => {}), set: (o, k, v) => ((o[k] = v), true) },
);
const canvas = {
  width: 0,
  height: 0,
  getContext: () => {
    if (canvasThrows) throw Error('native canvas failed');
    return ctx;
  },
  requestAnimationFrame(cb) {
    frameCallbacks.set(frameCallbacks.size + 1, cb);
    return frameCallbacks.size;
  },
  cancelAnimationFrame(id) {
    frameCallbacks.delete(id);
    stopped++;
  },
  createImage: () => ({
    set src(value) {
      this._src = value;
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
  getStorageInfoSync: () => ({ keys: [] }),
  getStorageSync: () => '',
  navigateTo: (o) => navigate.push(o.url),
  switchTab: (o) => navigate.push(o.url),
  navigateBack() {},
  showToast() {},
  vibrateShort() {},
  showModal: (o) => o.success({ confirm: false }),
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
    exec(cb) {
      const invoke = () => cb([{ node: canvas, width: 390, height: 844, left: 0, top: 0 }]);
      if (delayCanvas) canvasQueries.push(invoke);
      else invoke();
    },
  }),
};
for (const module of [
  'companion',
  'companion-tasks',
  'companion-collection',
  'companion-mail',
  'companion-card',
  'companion-photo',
]) {
  name = module;
  await import(
    '../miniprogram/pages/' +
      (module === 'companion' ? module : 'companion/' + module.slice(10)) +
      '/index.ts'
  );
}
function page(module) {
  const d = defs.get(module);
  return {
    ...d,
    data: structuredClone(d.data),
    setData(p, cb) {
      Object.assign(this.data, p);
      cb?.();
    },
  };
}
beforeEach(() => {
  state = applyCompanionCommand(
    createCompanionState('2026-10-26T08:00:00Z'),
    { type: 'adopt', name: '伙伴' },
    EMPTY_COMPANION_FACTS,
    '2026-10-26T08:00:00Z',
    () => 0,
  ).state;
  saved = [];
  frameCallbacks = new Map();
  stopped = 0;
  navigate = [];
  delayCanvas = false;
  canvasQueries = [];
  canvasThrows = false;
  exportRequests = [];
  paintedAssets = [];
  wx.canvasToTempFilePath = (options) => exportRequests.push(options);
  delayedFacts = null;
  cloudMarked = false;
  visitWrites = 0;
  canvasTranslations = [];
  companionService.cloudWasUsed = () => cloudMarked;
  companionService.markCloudUsed = () => {
    cloudMarked = true;
  };
  cloudCompanionRepository.visitHome = async () => {
    visitWrites++;
    return { visited: true, duplicate: false };
  };
  companionService.read = () => structuredClone(state);
  companionService.facts = () =>
    delayedFacts ??
    Promise.resolve({
      ...EMPTY_COMPANION_FACTS,
      totalEntries: 1,
      entriesToday: 1,
      recordedDays: 1,
    });
  companionService.dispatch = async (command) => {
    saved.push(command);
    const result = applyCompanionCommand(
      state,
      command,
      { ...EMPTY_COMPANION_FACTS, totalEntries: 1, entriesToday: 1, recordedDays: 1 },
      '2026-10-26T08:00:00Z',
      () => 0,
    );
    state = result.state;
    return result;
  };
  cloudCompanionRepository.listVisits = async () => ({ visits: [], visitorCount: 0 });
  visitorFetch = null;
  cloudCompanionRepository.getHome = async () => {
    if (visitorFetch) return visitorFetch;
    throw Error('not friends');
  };
});
test('home follows hide/unload cleanup and caps the actual canvas backing scale', async () => {
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  p.onReady();
  assert.equal(canvas.width, 780);
  assert.equal(canvas.height, 1688);
  p.onCanvasTouchStart({ touches: [{ x: 210, y: 650 }] });
  p.onCanvasTouchEnd({ changedTouches: [{ x: 210, y: 650 }], touches: [] });
  assert.ok(frameCallbacks.size > 0);
  p.onHide();
  assert.equal(frameCallbacks.size, 0);
  assert.ok(stopped > 0);
  p.onUnload();
});
test('late visitor response cannot repaint a hidden home or grant a local visit task', async () => {
  let resolve;
  visitorFetch = new Promise((r) => {
    resolve = r;
  });
  const p = page('companion');
  p.onLoad({ targetUserId: 'usr_friend' });
  const pending = p.onShow();
  p.onHide();
  resolve({
    snapshot: {
      name: 'friend',
      skinId: 'sky',
      accessoryId: 'none',
      theme: 'meadow',
      placements: [],
    },
    owner: { userId: 'usr_friend', displayName: 'friend' },
    revision: 1,
    visibility: 'friends',
    updatedAt: '2026-10-26T08:00:00.000Z',
  });
  await pending;
  assert.notEqual(p.data.title, 'friend的小屋');
  assert.equal(saved.filter((c) => c.type === 'visited').length, 0);
  p.onUnload();
});
test('tasks reject repeated in-flight claims and refresh the saved balance', async () => {
  const p = page('companion-tasks');
  await p.onShow();
  await Promise.all([
    p.claimTask({ currentTarget: { dataset: { id: 'write' } } }),
    p.claimTask({ currentTarget: { dataset: { id: 'write' } } }),
  ]);
  assert.equal(saved.filter((c) => c.type === 'claim').length, 1);
  assert.equal(p.data.state.crystals, 110);
  p.onHide();
});
test('inventory equip and paid draw operate through the same atomic command service', async () => {
  const p = page('companion-collection');
  p.onLoad({ tab: 'skins' });
  await p.onShow();
  await p.drawSkin();
  assert.equal(state.crystals, 20);
  assert.equal(state.shards, 5);
  assert.ok(p.data.actionMessage.includes('星屑'));
  p.onHide();
});
test('opening a letter marks only that letter read, while load itself does not write', async () => {
  const p = page('companion-mail');
  await p.onShow();
  assert.equal(saved.length, 0);
  await p.openLetter({ currentTarget: { dataset: { id: 'hello' } } });
  assert.ok(state.readLetters.includes('hello'));
  p.onHide();
});
test('card does not replace saved preferences if the persistence operation fails', async () => {
  const p = page('companion-card');
  await p.onShow();
  const before = state.name;
  companionService.dispatch = async () => {
    throw Error('storage full');
  };
  p.setData({ nameInput: '新名字' });
  await p.savePreferences();
  assert.equal(state.name, before);
  assert.ok(p.data.actionMessage.includes('storage full'));
  p.onHide();
});
test('all four original tabs and memory bottle remain alongside the new Pal entry', async () => {
  const { readFileSync } = await import('node:fs');
  const app = JSON.parse(readFileSync(new URL('../miniprogram/app.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    app.tabBar.list.map((i) => i.pagePath),
    [
      'pages/journal/index',
      'pages/map/index',
      'pages/timeline/index',
      'pages/pal/index',
      'pages/profile/index',
    ],
  );
  assert.ok(app.pages.includes('pages/memory-bottle/index'));
  assert.ok(app.subPackages.some((p) => p.root === 'pages/companion' && p.pages.includes('index')));
});

test('an asynchronous native canvas failure falls back without an uncaught callback', async () => {
  delayCanvas = true;
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  p.onReady();
  canvasThrows = true;
  assert.ok(canvasQueries.length > 0);
  for (const callback of canvasQueries) assert.doesNotThrow(callback);
  assert.equal(p.data.canvasUnavailable, true);
  p.onUnload();
});
test('returning while photo export is pending regenerates and ignores the old image', async () => {
  const p = page('companion-photo');
  p.onLoad();
  p.onShow();
  p.onReady();
  await new Promise(setImmediate);
  assert.equal(exportRequests.length, 1);
  p.onHide();
  p.onShow();
  await new Promise(setImmediate);
  assert.equal(exportRequests.length, 2);
  exportRequests[0].success({ tempFilePath: 'wxfile://old' });
  exportRequests[1].success({ tempFilePath: 'wxfile://new' });
  await new Promise(setImmediate);
  assert.equal(p.data.imagePath, 'wxfile://new');
  p.onUnload();
});

function publishedFixture() {
  return {
    snapshot: {
      name: '好友伙伴',
      skinId: 'sky',
      accessoryId: 'none',
      theme: 'meadow',
      placements: [],
    },
    owner: { userId: 'usr_friend', displayName: '好友' },
    revision: 1,
    visibility: 'friends',
    updatedAt: '2026-10-26T08:00:00.000Z',
  };
}
test('a visitor-only write marks cloud usage before uncertain outcomes', async () => {
  visitorFetch = Promise.resolve(publishedFixture());
  cloudCompanionRepository.visitHome = async () => {
    assert.equal(cloudMarked, true);
    visitWrites++;
    throw Error('reply lost after server write');
  };
  const p = page('companion');
  p.onLoad({ targetUserId: 'usr_friend' });
  await p.onShow();
  assert.equal(visitWrites, 1);
  assert.equal(cloudMarked, true);
  p.onUnload();
});
test('permission revocation clears and hides a previously visible visitor scene', async () => {
  visitorFetch = Promise.resolve(publishedFixture());
  const p = page('companion');
  p.onLoad({ targetUserId: 'usr_friend' });
  await p.onShow();
  p.onReady();
  p.onHide();
  visitorFetch = null;
  await p.onShow();
  assert.equal(p.data.sceneVisible, false);
  assert.equal(p.data.ownerName, '');
  assert.notEqual(p.data.title, '好友伙伴的小屋');
  p.onUnload();
});
test('tasks recover after a hidden completion and block a second pending claim after return', async () => {
  const p = page('companion-tasks');
  await p.onShow();
  let resolve;
  companionService.dispatch = () =>
    new Promise((r) => {
      resolve = r;
    });
  const pending = p.claimTask({ currentTarget: { dataset: { id: 'write' } } });
  p.onHide();
  await p.onShow();
  const before = saved.length;
  await p.claimTask({ currentTarget: { dataset: { id: 'write' } } });
  assert.equal(saved.length, before);
  p.onHide();
  resolve({ state, message: 'done' });
  await pending;
  await p.onShow();
  assert.equal(p.data.busy, false);
  p.onHide();
});
test('fallback can select, rotate and withdraw furniture and retry the canvas', async () => {
  canvasThrows = true;
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  p.onReady();
  assert.equal(p.data.canvasUnavailable, true);
  p.selectFallbackFurniture({ currentTarget: { dataset: { id: 'starter-bench' } } });
  await p.rotateFurniture();
  assert.equal(state.placements.find((p) => p.id === 'starter-bench').rotation, 90);
  await p.removeFurniture();
  assert.ok(!state.placements.some((p) => p.id === 'starter-bench'));
  canvasThrows = false;
  p.retryCanvas();
  assert.equal(p.data.canvasUnavailable, false);
  p.onUnload();
});

test('onboarding advances repeatedly without retaining the action lease', async () => {
  state.tutorialStep = 0;
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  await p.advanceGuide();
  await p.advanceGuide();
  assert.equal(p.data.guideStep, 2);
  assert.equal(p.data.busy, false);
  p.onUnload();
});
test('haptic feedback is consumed only when enabled in the companion preferences', async () => {
  let buzz = 0;
  wx.vibrateShort = () => {
    buzz++;
  };
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  await p.interactWithCompanion();
  assert.equal(buzz, 0);
  state.haptics = true;
  await p.onShow();
  await p.interactWithCompanion();
  assert.equal(buzz, 1);
  p.onUnload();
});

test('24 local inspiration cards cycle without spending money or reading/writing diaries; writing is user initiated', async () => {
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  const before = structuredClone(state);
  p.showInspiration();
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    seen.add(p.data.inspiration.id);
    p.nextInspiration();
  }
  assert.equal(seen.size, 24);
  assert.equal(p.data.inspirationOpen, true);
  assert.deepEqual(state, before);
  assert.deepEqual(saved, []);
  assert.deepEqual(navigate, []);
  p.writeFromInspiration();
  assert.match(
    navigate.at(-1),
    /^\/pages\/editor\/index\?source=journal&companionPrompt=prompt_\d{2}$/,
  );
  p.onUnload();
});

test('static pose controls remain local, reject visitor actions and stop safely on hide', async () => {
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  p.onReady();
  for (const pose of ['happy', 'recording', 'resting', 'gift'])
    p.choosePose({ currentTarget: { dataset: { pose } } });
  assert.equal(p.data.activePose, 'gift');
  assert.deepEqual(saved, []);
  p.onHide();
  assert.equal(frameCallbacks.size, 0);
  p.onUnload();
  visitorFetch = Promise.resolve(publishedFixture());
  const v = page('companion');
  v.onLoad({ targetUserId: 'usr_friend' });
  await v.onShow();
  v.showInspiration();
  assert.equal(v.data.inspirationOpen, false);
  v.onUnload();
});

test('choosing a static pose immediately after greeting replaces the transient happy image', async () => {
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  p.onReady();
  await new Promise(setImmediate);
  await p.interactWithCompanion();
  paintedAssets = [];
  p.choosePose({ currentTarget: { dataset: { pose: 'resting' } } });
  assert.equal(p.data.activePose, 'resting');
  assert.ok(
    paintedAssets.some((src) => src.endsWith('tutu_resting.png')),
    paintedAssets.join(','),
  );
  assert.equal(
    paintedAssets.some((src) => src.endsWith('tutu_happy.png')),
    false,
  );
  p.onUnload();
});

test('claimAll refreshes all derived task controls once after the successful durable claim', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T08:00:00Z') });
  const p = page('companion-tasks');
  await p.onShow();
  assert.ok(p.data.claimableCount > 0);
  const expected = p.data.state.crystals + p.data.claimableReward;
  const reload = t.mock.method(p, 'reload', p.reload.bind(p));
  await p.claimAllTasks();
  assert.equal(p.data.state.crystals, expected);
  assert.equal(p.data.claimableCount, 0);
  assert.equal(p.data.claimableReward, 0);
  assert.ok(p.data.completed > 0);
  assert.equal(p.data.tasks.filter((t) => t.eligible && !t.claimed).length, 0);
  assert.equal(p.data.busy, false);
  assert.equal(reload.mock.callCount(), 1);
});
test('checkin refreshes the checked day and cannot leave a stale claimable checkin button', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T08:00:00Z') });
  const p = page('companion-tasks');
  await p.onShow();
  assert.equal(p.data.checkedToday, false);
  await p.checkin();
  assert.equal(p.data.checkedToday, true);
  assert.ok(p.data.week.some((day) => day.label === '今天' && day.checked));
});

test('companion headers clear the native menu on both iOS and Android', async () => {
  const originalWindow = wx.getWindowInfo;
  const originalMenu = wx.getMenuButtonBoundingClientRect;
  try {
    for (const device of [
      {
        statusBarHeight: 59,
        menu: { left: 296, right: 383, top: 63, bottom: 95, width: 87, height: 32 },
      },
      {
        statusBarHeight: 24,
        menu: { left: 263, right: 350, top: 32, bottom: 64, width: 87, height: 32 },
      },
    ]) {
      wx.getWindowInfo = () => ({ ...originalWindow(), statusBarHeight: device.statusBarHeight });
      wx.getMenuButtonBoundingClientRect = () => device.menu;
      for (const module of defs.keys()) {
        const p = page(module);
        try {
          p.onLoad?.({});
          await p.onShow();
          assert.ok(
            p.data.topInset >= device.menu.bottom + 8,
            `${module}: custom header at ${p.data.topInset} overlaps native menu ending at ${device.menu.bottom}`,
          );
        } finally {
          p.onUnload?.();
        }
      }
    }
  } finally {
    wx.getWindowInfo = originalWindow;
    wx.getMenuButtonBoundingClientRect = originalMenu;
  }
});

test('missing or unusable menu geometry still reserves the navigation band', () => {
  const originalMenu = wx.getMenuButtonBoundingClientRect;
  try {
    for (const menu of [
      undefined,
      () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 }),
      () => ({ left: 296, right: 383, top: 28, bottom: NaN, width: 87, height: 32 }),
      () => {
        throw Error('native menu unavailable');
      },
    ]) {
      wx.getMenuButtonBoundingClientRect = menu;
      assert.ok(companionTopInset() >= 68, 'status bar alone does not clear native navigation');
    }
  } finally {
    wx.getMenuButtonBoundingClientRect = originalMenu;
  }
});

function publicationMocks(t) {
  t.mock.method(wx, 'showModal', (o) => o.success({ confirm: true }));
  t.mock.method(cloudModeService, 'acceptPrivacy', () => ({}));
  t.mock.method(cloudAuthRepository, 'bootstrap', async () => ({}));
  t.mock.method(cloudCompanionRepository, 'getMine', async () => ({
    userId: 'usr_owner',
    home: null,
  }));
}
function ownPublished(visibility = 'friends', revision = 1) {
  return {
    snapshot: {
      name: state.name,
      skinId: state.skinId,
      accessoryId: state.accessoryId,
      theme: state.theme,
      placements: structuredClone(state.placements),
    },
    visibility,
    revision,
    updatedAt: '2026-10-28T09:00:00Z',
    owner: { userId: 'usr_owner', displayName: '同学' },
  };
}
test('opening a home immediately shows an inline pending state until a server reply arrives', async (t) => {
  publicationMocks(t);
  let finish;
  t.mock.method(
    cloudCompanionRepository,
    'publishHome',
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  const p = page('companion-card');
  await p.onShow();
  const pending = p.publishHome();
  await new Promise(setImmediate);
  assert.equal(p.data.busy, true);
  assert.equal(p.data.cloudPhase, 'opening');
  assert.match(p.data.cloudStatus, /正在开放/);
  finish(ownPublished());
  await pending;
  assert.equal(p.data.cloudPhase, 'open');
  assert.match(p.data.cloudStatus, /已开放/);
  assert.equal(p.data.cloudKnown, true);
  assert.equal(p.data.visibility, 'friends');
  assert.equal(state.cloudVisibility, 'friends');
  assert.equal(p.data.busy, false);
});
test('failed opening shows an unknown inline result and retry only checks server state', async (t) => {
  publicationMocks(t);
  cloudCompanionRepository.getMine = async () => {
    throw Object.assign(Error('offline'), { code: 'FUNCTION_CALL_FAILED' });
  };
  const write = t.mock.method(cloudCompanionRepository, 'publishHome', async () => ownPublished());
  const p = page('companion-card');
  await p.onShow();
  await p.publishHome();
  assert.equal(p.data.cloudKnown, false);
  assert.equal(p.data.cloudPhase, 'unknown');
  assert.match(p.data.cloudStatus, /未能确认/);
  assert.match(p.data.cloudError, /未确认开放成功/);
  assert.equal(write.mock.callCount(), 0);
  cloudCompanionRepository.getMine = async () => ({ userId: 'usr_owner', home: null });
  await p.refreshCloudStatus();
  assert.equal(p.data.cloudKnown, true);
  assert.equal(p.data.cloudPhase, 'closed');
  assert.match(p.data.cloudStatus, /未开放|已关闭/);
  assert.equal(p.data.cloudError, '');
  assert.equal(write.mock.callCount(), 0, 'refresh cannot publish or upload a snapshot');
});
test('missing companion service is explained next to the openness control', async (t) => {
  publicationMocks(t);
  cloudCompanionRepository.getMine = async () => {
    throw Object.assign(Error('missing'), { code: 'FUNCTION_NOT_FOUND' });
  };
  const p = page('companion-card');
  await p.onShow();
  await p.publishHome();
  assert.equal(p.data.cloudPhase, 'unknown');
  assert.match(p.data.cloudError, /尚未开通/);
  assert.equal(state.cloudVisibility, 'private');
});
test('failed publish with a lost response never claims the old closed state and readback can recover', async (t) => {
  publicationMocks(t);
  const confirmed = ownPublished();
  t.mock.method(cloudCompanionRepository, 'publishHome', async () => {
    throw Object.assign(Error('response lost'), { code: 'FUNCTION_CALL_FAILED' });
  });
  const p = page('companion-card');
  await p.onShow();
  await p.publishHome();
  assert.equal(p.data.cloudPhase, 'unknown');
  assert.equal(p.data.cloudKnown, false);
  assert.equal(state.cloudVisibility, 'private');
  cloudCompanionRepository.getMine = async () => ({ userId: 'usr_owner', home: confirmed });
  await p.refreshCloudStatus();
  assert.equal(p.data.cloudPhase, 'open');
  assert.equal(p.data.visibility, 'friends');
  assert.match(p.data.cloudStatus, /已开放/);
});
test('confirmed server success remains visible if the local publication marker cannot be saved', async (t) => {
  publicationMocks(t);
  t.mock.method(cloudCompanionRepository, 'publishHome', async () => ownPublished());
  const dispatch = companionService.dispatch;
  t.mock.method(companionService, 'dispatch', async (command) => {
    if (command.type === 'publication') throw Error('storage full');
    return dispatch(command);
  });
  const p = page('companion-card');
  await p.onShow();
  await p.publishHome();
  assert.equal(p.data.cloudKnown, true);
  assert.equal(p.data.visibility, 'friends');
  assert.equal(p.data.cloudPhase, 'open');
  assert.match(p.data.cloudStatus, /已开放/);
  assert.match(p.data.cloudError, /本机.*保存失败/);
});
test('a late initial status read cannot overwrite a newer successful opening', async (t) => {
  publicationMocks(t);
  cloudMarked = true;
  let finishInitial;
  let reads = 0;
  cloudCompanionRepository.getMine = () =>
    ++reads === 1
      ? new Promise((r) => {
          finishInitial = r;
        })
      : Promise.resolve({ userId: 'usr_owner', home: null });
  t.mock.method(cloudCompanionRepository, 'publishHome', async () => ownPublished());
  const p = page('companion-card');
  const initial = p.onShow();
  await p.publishHome();
  finishInitial({ userId: 'usr_owner', home: null });
  await initial;
  assert.equal(p.data.cloudPhase, 'open');
  assert.equal(p.data.visibility, 'friends');
});
test('closing an open home displays an explicit confirmed closed state', async (t) => {
  publicationMocks(t);
  cloudMarked = true;
  cloudCompanionRepository.getMine = async () => ({ userId: 'usr_owner', home: ownPublished() });
  const write = t.mock.method(
    cloudCompanionRepository,
    'publishHome',
    async (_, visibility, revision) => ownPublished(visibility, revision + 1),
  );
  const p = page('companion-card');
  await p.onShow();
  assert.equal(p.data.cloudPhase, 'open');
  await p.publishHome();
  assert.equal(write.mock.calls[0].arguments[1], 'private');
  assert.equal(p.data.cloudPhase, 'closed');
  assert.match(p.data.cloudStatus, /已关闭/);
  assert.equal(p.data.visibility, 'private');
  assert.equal(state.cloudVisibility, 'private');
});
test('openness check ignores responses delivered after the settings page was hidden', async (t) => {
  publicationMocks(t);
  let finish;
  cloudCompanionRepository.getMine = () =>
    new Promise((r) => {
      finish = r;
    });
  const p = page('companion-card');
  await p.onShow();
  const pending = p.refreshCloudStatus();
  await new Promise(setImmediate);
  p.onHide();
  const before = structuredClone(p.data);
  finish({ userId: 'usr_owner', home: ownPublished() });
  await pending;
  assert.deepEqual(p.data, before);
});

test('deleting a published home invalidates any older status read', async (t) => {
  publicationMocks(t);
  cloudMarked = true;
  let finishInitial;
  cloudCompanionRepository.getMine = () =>
    new Promise((r) => {
      finishInitial = r;
    });
  t.mock.method(cloudCompanionRepository, 'deleteMyData', async () => {});
  t.mock.method(companionService, 'clearCloudMarker', () => {
    cloudMarked = false;
  });
  const p = page('companion-card');
  const initial = p.onShow();
  await p.deletePublishedHome();
  finishInitial({ userId: 'usr_owner', home: ownPublished() });
  await initial;
  assert.equal(p.data.cloudPhase, 'closed');
  assert.equal(p.data.visibility, 'private');
  assert.match(p.data.cloudStatus, /已删除/);
});

function canvasTouch(world) {
  return worldToScreen(world, { x: 0, y: 0, zoom: 1 }, { width: 390, height: 844 });
}
function finishWalkingFrames() {
  let time = 0;
  for (let count = 0; frameCallbacks.size && count < 800; count++) {
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    time += 1000 / 60;
    for (const callback of callbacks) callback(time);
  }
  assert.equal(frameCallbacks.size, 0, 'walking must arrive and stop requesting frames');
}

test('tapping a wall projects walking onto each theme floor and never rewrites saved placement coordinates', async () => {
  for (const [theme, minimum] of [
    ['meadow', 0.54],
    ['dusk', 0.52],
    ['blossom', 0.58],
  ]) {
    state.theme = theme;
    state.placements[0].y = 0.2;
    const before = structuredClone(state);
    const p = page('companion');
    p.onLoad({});
    await p.onShow();
    p.onReady();
    await new Promise(setImmediate);
    const touch = canvasTouch({ x: 0.88, y: 0.2 });
    p.onCanvasTouchStart({ touches: [touch] });
    await p.onCanvasTouchEnd({ changedTouches: [touch], touches: [] });
    finishWalkingFrames();
    const origin = canvasTranslations.findLast(([x, y]) => Math.abs(x - 704) < 1e-8 && y > 0);
    assert.ok(origin, 'the pet must arrive at the selected horizontal destination');
    assert.ok(
      Math.abs(origin[1] - minimum * 1100) < 1e-8,
      'wall clicks must end at the floor boundary',
    );
    assert.deepEqual(state, before, 'walking and loading must not migrate old saves');
    assert.equal(saved.length, 0);
    p.onUnload();
  }
});

test('dragging floor furniture clamps its new position while wall decorations retain their wall range', async () => {
  for (const [itemId, expected] of [
    ['bench', 0.54],
    ['picnic', 0.54],
    ['sign', 0.2],
  ]) {
    state.furniture[itemId] = 1;
    state.placements = [{ id: 'drag-test', itemId, x: 0.5, y: 0.72, rotation: 0 }];
    const p = page('companion');
    p.onLoad({});
    await p.onShow();
    p.onReady();
    p.toggleEditing();
    const start = canvasTouch({ x: 0.5, y: 0.7 }),
      end = canvasTouch({ x: 0.5, y: 0.2 });
    p.onCanvasTouchStart({ touches: [start] });
    p.onCanvasTouchMove({ touches: [end] });
    await p.onCanvasTouchEnd({ changedTouches: [end], touches: [] });
    const moved = saved.findLast((command) => command.type === 'move');
    assert.ok(moved);
    assert.ok(Math.abs(moved.y - expected) < 1e-8, itemId + ' floor/wall bounds');
    p.onUnload();
  }
});

test('fallback furniture nudges obey the same floor boundary without moving untouched old furniture', async () => {
  state.theme = 'blossom';
  state.placements = [{ id: 'old-bench', itemId: 'bench', x: 0.5, y: 0.2, rotation: 0 }];
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  assert.equal(state.placements[0].y, 0.2);
  p.selectFallbackFurniture({ currentTarget: { dataset: { id: 'old-bench' } } });
  await p.nudgeFurniture({ currentTarget: { dataset: { dx: 0, dy: -1 } } });
  assert.equal(state.placements[0].y, 0.58);
  p.onUnload();
});

test('pet greeting uses its smaller distant and larger foreground touch radius', async () => {
  const p = page('companion');
  p.onLoad({});
  await p.onShow();
  p.onReady();
  const tap = async (world) => {
    const touch = canvasTouch(world);
    p.onCanvasTouchStart({ touches: [touch] });
    await p.onCanvasTouchEnd({ changedTouches: [touch], touches: [] });
  };
  await tap({ x: 0.78, y: 0.54 });
  finishWalkingFrames();
  await tap({ x: 0.78 - 60 / 800, y: 0.54 });
  assert.equal(saved.filter((command) => command.type === 'interact').length, 0);
  finishWalkingFrames();
  await tap({ x: 0.7, y: 0.9 });
  finishWalkingFrames();
  await tap({ x: 0.7 - 75 / 800, y: 0.9 });
  assert.equal(saved.filter((command) => command.type === 'interact').length, 1);
  p.onUnload();
});
