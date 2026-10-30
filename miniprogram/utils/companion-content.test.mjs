import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  COMPANION_SKINS,
  COMPANION_FURNITURE,
  COMPANION_ACCESSORIES,
  COMPANION_THEMES,
} from '../data/companion-catalog.ts';
import * as assets from '../data/companion-assets.ts';
import {
  COMPANION_CLOUD_SKINS,
  COMPANION_CLOUD_FURNITURE,
  parseHomeSnapshot,
} from '../models/companion-cloud.ts';
import {
  createCompanionState,
  parseCompanionState,
  applyCompanionCommand,
  buildCompanionTasks,
} from './companion-engine.ts';
import { EMPTY_COMPANION_FACTS } from '../models/companion.ts';
import { createCompanionSceneRenderer, companionImageSources } from './companion-artwork.ts';
const NOW = '2026-10-26T08:00:00Z';

test('each stable theme loads its own packaged scene and paints it beneath separate objects', () => {
  const sceneSources = new Set();
  for (const theme of COMPANION_THEMES) {
    assert.equal(typeof assets.companionThemeBackground, 'function');
    const background = assets.companionThemeBackground(theme.id);
    assert.ok(existsSync('miniprogram' + background.src), background.src);
    sceneSources.add(background.src);
    const snapshot = {
      name: '途途',
      skinId: 'sprout',
      accessoryId: 'none',
      theme: theme.id,
      placements: [{ id: 'chair', itemId: 'bench', x: 0.7, y: 0.8, rotation: 0 }],
    };
    const sources = companionImageSources(snapshot);
    assert.ok(sources.includes(background.src), theme.id + ' must preload its scene');
    const calls = [];
    const ctx = new Proxy(
      {
        drawImage(image, ...args) {
          calls.push({ src: image.src, args });
        },
      },
      { get: (o, k) => o[k] ?? (() => {}), set: (o, k, v) => ((o[k] = v), true) },
    );
    const renderer = createCompanionSceneRenderer(
      snapshot,
      { width: 390, height: 844 },
      1,
      new Map(sources.map((src) => [src, { src }])),
    );
    renderer.draw(ctx, { x: 0.5, y: 0.7, facing: 1, moving: false }, { x: 0, y: 0, zoom: 1 }, 0);
    assert.equal(calls[0].src, background.src, 'scene must paint before furniture/pet');
    const [sx, sy, sw, sh, dx, dy, dw, dh] = calls[0].args;
    assert.ok(
      sx >= 0 &&
        sy >= 0 &&
        sx + sw <= background.width + 0.01 &&
        sy + sh <= background.height + 0.01,
      'crop stays in the actual image',
    );
    assert.ok(Math.abs(sw / sh - 800 / 1100) < 0.001, 'background is cropped, never stretched');
    assert.deepEqual([dx, dy, dw, dh], [0, 0, 800, 1100]);
    assert.ok(calls.some((c) => c.src.endsWith('tutu_map.png')));
    assert.ok(calls.some((c) => c.src.endsWith('ginkgo_reading_chair.png')));
    renderer.dispose();
  }
  assert.equal(sceneSources.size, 3, 'all three themes have independent artwork');
});

test('playable reading room and courtyard retain the full portrait environment in the world', () => {
  for (const theme of ['meadow', 'dusk']) {
    const background = assets.companionThemeBackground(theme);
    const calls = [];
    const ctx = new Proxy(
      { drawImage: (image, ...args) => calls.push({ image, args }) },
      { get: (o, k) => o[k] ?? (() => {}), set: (o, k, v) => ((o[k] = v), true) },
    );
    const scene = { name: '途途', skinId: 'sprout', accessoryId: 'none', theme, placements: [] };
    const image = { src: background.src };
    const renderer = createCompanionSceneRenderer(
      scene,
      { width: 390, height: 844 },
      1,
      new Map([[background.src, image]]),
    );
    renderer.draw(ctx, { x: 0.5, y: 0.72, facing: 1, moving: false }, { x: 0, y: 0, zoom: 1 }, 0);
    const paint = calls.find((call) => call.image === image);
    assert.ok(paint, theme + ' background must actually render');
    const [, , width, height] = paint.args;
    assert.ok(
      (width * height) / (background.width * background.height) > 0.98,
      theme + ' must preserve the environment instead of enlarging a narrow strip of a landscape',
    );
    renderer.dispose();
  }
});

test('all eight finished campus characters and 22 SDU furnishings use real runtime artwork', () => {
  assert.deepEqual(
    COMPANION_SKINS.map((i) => i.id),
    [...COMPANION_CLOUD_SKINS],
  );
  assert.deepEqual(
    COMPANION_FURNITURE.map((i) => i.id),
    [...COMPANION_CLOUD_FURNITURE],
  );
  for (const i of COMPANION_SKINS) {
    const a = assets.resolveCompanionAsset('skin', i.id);
    assert.equal(a.placeholder, false, i.id);
    assert.ok(existsSync('miniprogram' + a.src), a.src);
  }
  assert.equal(COMPANION_FURNITURE.filter((i) => !i.legacy).length, 22);
  for (const kind of ['furniture', 'accessory']) {
    for (const i of kind === 'furniture'
      ? COMPANION_FURNITURE
      : COMPANION_ACCESSORIES.filter((i) => i.id !== 'none')) {
      const a = assets.resolveCompanionAsset(kind, i.id);
      assert.ok(a.src && existsSync('miniprogram' + a.src), kind + ':' + i.id);
    }
  }
  const m = JSON.parse(readFileSync('docs/COMPANION_ART_MANIFEST.json', 'utf8'));
  assert.equal(m.assets.length, 25);
  assert.ok(m.assets.reduce((n, a) => n + statSync('miniprogram' + a.runtime).size, 0) < 950000);
});

test('all old saves retain custom names, wallet, inventory, placements, receipts and cloud compatibility', () => {
  const s = createCompanionState(NOW);
  Object.assign(s, {
    name: '旧存档豆芽',
    adoptedAt: NOW,
    crystals: 1234,
    shards: 77,
    ownedSkins: COMPANION_SKINS.map((i) => i.id),
    ownedAccessories: COMPANION_ACCESSORIES.map((i) => i.id),
    receipts: [{ key: 'existing-command', message: '已有回执' }],
  });
  s.furniture = Object.fromEntries(COMPANION_FURNITURE.slice(0, 12).map((i) => [i.id, 2]));
  s.placements = COMPANION_FURNITURE.slice(0, 12).map((i, n) => ({
    id: 'old-' + n,
    itemId: i.id,
    x: 0.4,
    y: 0.6,
    rotation: 90,
  }));
  assert.deepEqual(parseCompanionState(JSON.stringify(s), NOW), s);
  assert.equal(parseHomeSnapshot(s).placements.length, 12);
  const next = applyCompanionCommand(
    s,
    { type: 'equipSkin', itemId: 'sky' },
    EMPTY_COMPANION_FACTS,
    NOW,
    () => 0,
  ).state;
  for (const key of ['name', 'crystals', 'shards', 'furniture', 'placements', 'receipts'])
    assert.deepEqual(next[key], s[key]);
});

test('new adopters start with Tutu and the default name cannot automatically earn naming reward', () => {
  const s = createCompanionState(NOW);
  assert.equal(s.name, '途途');
  const adopted = applyCompanionCommand(
    s,
    { type: 'adopt', name: s.name },
    EMPTY_COMPANION_FACTS,
    NOW,
    () => 0,
  ).state;
  assert.equal(
    buildCompanionTasks(adopted, EMPTY_COMPANION_FACTS, NOW).find((t) => t.id === 'name').eligible,
    false,
  );
});

test('Tutu gets four distinct static poses while other characters keep their own identity', () => {
  assert.equal(typeof assets.companionPoseAsset, 'function');
  const paths = ['recording', 'happy', 'resting', 'gift'].map(
    (p) => assets.companionPoseAsset('sprout', p).src,
  );
  assert.equal(new Set(paths).size, 4);
  for (const path of paths) assert.ok(existsSync('miniprogram' + path));
  assert.equal(
    assets.companionPoseAsset('sky', 'gift').src,
    assets.resolveCompanionAsset('skin', 'sky').src,
  );
});

test('rendering uses the actual background, then rug and wall items before depth-sorted foreground', () => {
  const s = createCompanionState(NOW);
  s.placements = [
    { id: 'rug', itemId: 'picnic', x: 0.5, y: 0.95, rotation: 0 },
    { id: 'wall', itemId: 'sign', x: 0.5, y: 0.9, rotation: 0 },
    { id: 'chair', itemId: 'bench', x: 0.5, y: 0.8, rotation: 0 },
  ];
  const sources = companionImageSources(s);
  assert.ok(sources.includes(assets.companionThemeBackground(s.theme).src));
  const images = new Map(sources.map((src) => [src, { src }]));
  const calls = [];
  const ctx = new Proxy(
    {
      drawImage(i) {
        calls.push(i.src);
      },
    },
    { get: (o, k) => o[k] ?? (() => {}), set: (o, k, v) => ((o[k] = v), true) },
  );
  const renderer = createCompanionSceneRenderer(s, { width: 390, height: 844 }, 1, images);
  renderer.draw(ctx, { x: 0.5, y: 0.7, facing: 1, moving: false }, { x: 0, y: 0, zoom: 1 }, 0);
  const base = assets.resolveCompanionAsset('skin', 'sprout').src;
  assert.ok(
    calls.indexOf(assets.resolveCompanionAsset('furniture', 'picnic').src) < calls.indexOf(base),
  );
  assert.ok(
    calls.indexOf(assets.resolveCompanionAsset('furniture', 'sign').src) < calls.indexOf(base),
  );
  assert.ok(
    calls.indexOf(base) < calls.indexOf(assets.resolveCompanionAsset('furniture', 'bench').src),
  );
  renderer.dispose();
});
