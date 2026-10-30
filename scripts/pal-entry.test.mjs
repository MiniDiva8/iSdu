import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { test, beforeEach } from 'node:test';
let definition;
let requests = [];
globalThis.wx = {
  navigateTo: (options) => {
    requests.push(options);
  },
};
globalThis.Page = (page) => {
  definition = page;
};
async function page() {
  assert.ok(
    existsSync(new URL('../miniprogram/pages/pal/index.ts', import.meta.url)),
    'Pal tab entry must exist',
  );
  await import('../miniprogram/pages/pal/index.ts');
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}
beforeEach(() => {
  requests = [];
});

test('Pal adds a main-package native tab without removing the four original destinations or the companion subpackage', () => {
  const app = JSON.parse(readFileSync(new URL('../miniprogram/app.json', import.meta.url), 'utf8'));
  assert.deepEqual(
    app.tabBar.list.map((tab) => tab.pagePath),
    [
      'pages/journal/index',
      'pages/map/index',
      'pages/timeline/index',
      'pages/pal/index',
      'pages/profile/index',
    ],
  );
  const pal = app.tabBar.list[3];
  assert.equal(pal.text, 'Pal');
  assert.ok(app.pages.includes(pal.pagePath));
  assert.ok(app.subPackages.some((p) => p.root === 'pages/companion' && p.pages.includes('index')));
  for (const key of ['iconPath', 'selectedIconPath']) {
    const png = readFileSync(new URL('../miniprogram/' + pal[key], import.meta.url));
    assert.equal(png.readUInt32BE(16), 81);
    assert.equal(png.readUInt32BE(20), 81);
  }
});

test('first Pal display opens the existing home once even when tab tap follows onShow', async () => {
  const p = await page();
  p.onShow();
  p.onTabItemTap();
  p.openHome();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/pages/companion/index');
  assert.equal(p.data.opening, true);
});

test('tab tap before first onShow is queued and opens exactly once', async () => {
  const p = await page();
  p.onTabItemTap();
  assert.equal(requests.length, 0);
  p.onShow();
  assert.equal(requests.length, 1);
});

test('returning from home stays on Pal, while selecting Pal again opens home', async () => {
  const p = await page();
  p.onShow();
  p.onHide();
  requests[0].success();
  p.onShow();
  assert.equal(requests.length, 1);
  assert.equal(p.data.opening, false);
  p.onTabItemTap();
  assert.equal(requests.length, 2);
});

test('switching away then selecting Pal works with either native tab/show event order', async () => {
  for (const order of ['tap-first', 'show-first']) {
    requests = [];
    const p = await page();
    p.onShow();
    p.onHide();
    requests[0].success();
    p.onShow();
    p.onHide();
    if (order === 'tap-first') {
      p.onTabItemTap();
      p.onShow();
    } else {
      p.onShow();
      p.onTabItemTap();
    }
    assert.equal(requests.length, 2, order);
    p.onTabItemTap();
    assert.equal(requests.length, 2, order);
  }
});

test('navigation failure displays a retry and repeated retries stay single-flight', async () => {
  const p = await page();
  p.onShow();
  requests[0].fail();
  assert.equal(p.data.opening, false);
  assert.ok(p.data.errorMessage);
  p.openHome();
  p.openHome();
  assert.equal(requests.length, 2);
  assert.equal(p.data.errorMessage, '');
});

test('failure after hiding/unloading does not repaint a stale entry', async () => {
  for (const lifecycle of ['onHide', 'onUnload']) {
    requests = [];
    const p = await page();
    p.onShow();
    p[lifecycle]();
    const before = structuredClone(p.data);
    requests[0].fail();
    assert.deepEqual(p.data, before, lifecycle);
  }
});

test('a callback from the preceding navigation cannot overwrite a newer attempt after returning', async () => {
  const p = await page();
  p.onShow();
  const old = requests[0];
  p.onHide();
  p.onShow();
  p.openHome();
  assert.equal(requests.length, 2);
  const before = structuredClone(p.data);
  old.fail();
  assert.deepEqual(p.data, before);
});

test('selecting Pal still opens home after another route bypasses the Pal return page', async () => {
  for (const order of ['tap-first', 'show-first']) {
    requests = [];
    const p = await page();
    p.onShow();
    p.onHide();
    requests[0].success();
    // A home/editor fallback switched to a different tab without returning through Pal.
    if (order === 'tap-first') {
      p.onTabItemTap();
      p.onShow();
    } else {
      p.onShow();
      p.onTabItemTap();
    }
    assert.equal(requests.length, 2, order);
  }
});
