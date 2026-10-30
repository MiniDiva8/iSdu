import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
const defs = new Map();
let current = '';
let redirects = [];
let tabs = [];
globalThis.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
  getStorageSync: () => '',
  getStorageInfoSync: () => ({ keys: [] }),
  redirectTo: (o) => redirects.push(o),
  switchTab: (o) => tabs.push(o.url),
  navigateBack: (o) => o.fail?.(),
};
globalThis.Page = (d) => defs.set(current, d);
for (const section of ['tasks', 'collection', 'mail', 'card', 'photo']) {
  current = section;
  await import('../miniprogram/pages/companion-' + section + '/index.ts');
}
function page(section) {
  const d = defs.get(section);
  return {
    ...d,
    data: structuredClone(d.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}
beforeEach(() => {
  redirects = [];
  tabs = [];
});
test('old subpage entry URLs redirect to actual subpackage pages and retain only supported warehouse filters', () => {
  for (const section of defs.keys()) {
    const p = page(section);
    assert.equal(typeof p.onLoad, 'function');
    p.onLoad({ tab: 'furniture', mode: 'shop', ownerId: 'forged', targetUserId: 'forged' });
    const url = redirects.at(-1).url;
    assert.ok(url.startsWith('/pages/companion/' + section + '/index'));
    assert.equal(url.includes('forged'), false);
    if (section === 'collection') {
      assert.ok(url.includes('tab=furniture'));
      assert.ok(url.includes('mode=shop'));
    }
    p.onUnload();
  }
});
test('failed subpackage navigation can retry, then return to journal without duplicate pending redirects', () => {
  const p = page('collection');
  p.onLoad({ tab: 'furniture' });
  assert.equal(redirects.length, 1);
  p.retry();
  assert.equal(redirects.length, 1);
  redirects[0].fail();
  assert.ok(p.data.errorMessage);
  p.retry();
  assert.equal(redirects.length, 2);
  p.back();
  assert.equal(tabs.at(-1), '/pages/journal/index');
  p.onUnload();
});
test('late redirect failure after leaving the compatibility page cannot repaint it', () => {
  const p = page('photo');
  p.onLoad({});
  assert.equal(redirects.length, 1);
  p.onUnload();
  redirects[0].fail();
  assert.equal(p.data.errorMessage, '');
});
