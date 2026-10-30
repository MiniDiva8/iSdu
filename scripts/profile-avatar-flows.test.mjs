import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
let definition;
const reads = [],
  prompts = [],
  navigation = [];
globalThis.Page = (value) => {
  definition = value;
};
globalThis.wx = {
  getPrivacySetting: (options) => reads.push(options),
  requirePrivacyAuthorize: (options) => prompts.push(options),
  navigateTo: (options) => navigation.push(options.url),
};
await import('../miniprogram/pages/profile/index.ts');
function profile() {
  let profileLoads = 0,
    insightLoads = 0;
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
    loadProfile() {
      profileLoads += 1;
      return Promise.resolve();
    },
    loadInsights() {
      insightLoads += 1;
      return Promise.resolve();
    },
    loads() {
      return [profileLoads, insightLoads];
    },
  };
}
beforeEach(() => {
  reads.length = 0;
  prompts.length = 0;
  navigation.length = 0;
});
test('showing my profile activates only its avatar after platform privacy is allowed', () => {
  const p = profile();
  p.onShow();
  assert.equal(p.data.avatarActive, true);
  assert.equal(p.data.avatarMotionEnabled, false);
  assert.equal(reads.length, 1);
  reads[0].success({ needAuthorization: false });
  assert.equal(p.data.avatarMotionEnabled, true);
  assert.deepEqual(p.loads(), [1, 1]);
});
test('without an existing privacy grant the profile stays static and never starts an incomplete consent request', () => {
  const p = profile();
  p.onShow();
  assert.equal(reads.length, 1);
  reads[0].success({ needAuthorization: true });
  assert.equal(prompts.length, 0);
  assert.equal(p.data.avatarMotionEnabled, false);
});

test('hide and unload invalidate delayed privacy reads', () => {
  const p = profile();
  p.onShow();
  assert.equal(reads.length, 1);
  const first = reads[0];
  p.onHide();
  first.success({ needAuthorization: false });
  assert.equal(p.data.avatarActive, false);
  assert.equal(p.data.avatarMotionEnabled, false);
  p.onShow();
  const pending = reads.at(-1);
  p.onUnload();
  pending.success({ needAuthorization: false });
  assert.equal(p._active, false);
  assert.equal(p.data.avatarMotionEnabled, false);
});

test('a privacy result from an earlier visit cannot enable a newer profile visit', () => {
  const p = profile();
  p.onShow();
  assert.equal(reads.length, 1);
  const old = reads[0];
  p.onHide();
  p.onShow();
  old.success({ needAuthorization: false });
  assert.equal(p.data.avatarMotionEnabled, false);
  reads.at(-1).success({ needAuthorization: false });
  assert.equal(p.data.avatarMotionEnabled, true);
});
test('privacy failure or missing consent leaves the same static clickable avatar', () => {
  const p = profile();
  p.onShow();
  assert.equal(reads.length, 1);
  reads[0].fail();
  assert.equal(p.data.avatarMotionEnabled, false);
  p.openSection({ currentTarget: { dataset: { page: 'profile-edit' } } });
  assert.equal(navigation.at(-1), '/pages/profile-edit/index');
  p.onShow();
  reads.at(-1).success({ needAuthorization: true });
  assert.equal(prompts.length, 0);
  assert.equal(p.data.avatarMotionEnabled, false);
  assert.equal(p.data.errorMessage, '');
});
test('hardware unavailability clears avatar motion without changing profile content', () => {
  const p = profile();
  p.onShow();
  assert.equal(reads.length, 1);
  reads[0].success({ needAuthorization: false });
  p.data.entryCount = 17;
  p.data.displayName = '同学';
  p.handleAvatarMotionState({ detail: { status: 'unavailable' } });
  assert.equal(p.data.avatarMotionEnabled, false);
  assert.equal(p.data.entryCount, 17);
  assert.equal(p.data.displayName, '同学');
});

test('missing privacy APIs keep a visible static profile without breaking the old loaders', () => {
  const original = wx.getPrivacySetting;
  delete wx.getPrivacySetting;
  try {
    const p = profile();
    p.onShow();
    assert.equal(p.data.avatarActive, true);
    assert.equal(p.data.avatarMotionEnabled, false);
    assert.deepEqual(p.loads(), [1, 1]);
  } finally {
    wx.getPrivacySetting = original;
  }
});
test('synchronous privacy API errors leave the avatar static and the profile usable', () => {
  const original = wx.getPrivacySetting;
  wx.getPrivacySetting = () => {
    throw new Error('platform unavailable');
  };
  try {
    const p = profile();
    assert.doesNotThrow(() => p.onShow());
    assert.equal(p.data.avatarMotionEnabled, false);
  } finally {
    wx.getPrivacySetting = original;
  }
});
