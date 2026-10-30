import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { COMPANION_FURNITURE, COMPANION_SKINS } from '../data/companion-catalog.ts';
import {
  resolveCompanionAsset,
  companionFurnitureLayer,
  companionAssetPreview,
} from '../data/companion-assets.ts';
import { COMPANION_SCENE_IDEAS } from '../data/companion-inspiration.ts';
import { COMPANION_CLOUD_FURNITURE, parseHomeSnapshot } from '../models/companion-cloud.ts';
import { EMPTY_COMPANION_FACTS } from '../models/companion.ts';
import {
  createCompanionState,
  parseCompanionState,
  applyCompanionCommand,
} from './companion-engine.ts';
const NEW = [
  'shanhai_collectible_chest',
  'sdu_red_graduation_rack',
  'dacheng_eight_relief_platform',
  'dacheng_cong_garden_lantern',
  'grove_memory_swing',
  'doctoral_cat_bookends',
  'campus_postmark_workbench',
  'three_cities_travel_sign',
  'three_cities_souvenir_cabinet',
  'majia_twin_dome_model',
  'majia_stargazing_telescope',
  'starmap_observation_table',
];
const OLD = [
  'bench',
  'tree',
  'desk',
  'bookshelf',
  'lamp',
  'flowers',
  'picnic',
  'pond',
  'cushion',
  'bicycle',
  'lantern',
  'sign',
];
const NOW = '2026-10-26T08:00:00Z';
test('12 new designs append without renaming existing inventory IDs or weakening public snapshot validation', () => {
  assert.deepEqual(
    COMPANION_FURNITURE.slice(0, 12).map((i) => i.id),
    OLD,
  );
  assert.deepEqual(
    COMPANION_FURNITURE.slice(12).map((i) => i.id),
    NEW,
  );
  assert.deepEqual(
    [...COMPANION_CLOUD_FURNITURE],
    COMPANION_FURNITURE.map((i) => i.id),
  );
  assert.equal(COMPANION_FURNITURE.filter((i) => !i.legacy).length, 22);
  let s = createCompanionState(NOW);
  s.adoptedAt = NOW;
  s.crystals = 765;
  s.shards = 42;
  s.furniture = Object.fromEntries(OLD.map((id) => [id, 2]));
  s.placements = OLD.map((itemId, n) => ({ id: 'old-' + n, itemId, x: 0.5, y: 0.7, rotation: 90 }));
  assert.deepEqual(parseCompanionState(JSON.stringify(s)), s);
  assert.equal(parseHomeSnapshot(s).placements.length, 12);
  assert.throws(() =>
    parseHomeSnapshot({
      ...s,
      placements: [{ id: 'bad', itemId: 'unknown-expansion', x: 0.5, y: 0.5, rotation: 0 }],
    }),
  );
});
test('every new item can be bought, placed, rotated and returned without losing old coins or stock', () => {
  let s = applyCompanionCommand(
    createCompanionState(NOW),
    { type: 'adopt', name: '旧名字' },
    EMPTY_COMPANION_FACTS,
    NOW,
    () => 0,
  ).state;
  s.crystals = 10000;
  const initial = structuredClone(s.furniture);
  let spent = 0;
  for (const [n, id] of NEW.entries()) {
    const item = COMPANION_FURNITURE.find((i) => i.id === id);
    assert.ok(item, id);
    spent += item.price;
    s = applyCompanionCommand(
      s,
      { type: 'buy', itemId: id, requestId: 'buy-' + n },
      EMPTY_COMPANION_FACTS,
      NOW,
      () => 0,
    ).state;
    const placement = { id: 'new-' + n, itemId: id, x: 0.5, y: 0.65, rotation: 90 };
    s = applyCompanionCommand(
      s,
      { type: 'place', placement },
      EMPTY_COMPANION_FACTS,
      NOW,
      () => 0,
    ).state;
    assert.ok(parseHomeSnapshot(s).placements.some((i) => i.itemId === id));
    s = applyCompanionCommand(
      s,
      { type: 'remove', id: placement.id },
      EMPTY_COMPANION_FACTS,
      NOW,
      () => 0,
    ).state;
    assert.equal(s.furniture[id], 1);
  }
  assert.equal(s.crystals, 10000 - spent);
  assert.equal(s.name, '旧名字');
  for (const id of OLD) assert.equal(s.furniture[id], initial[id]);
});
test('expansion ships fourteen runtime images, preserves wide cabinet proportions and keeps the relief platform below furniture', () => {
  const m = JSON.parse(readFileSync('docs/COMPANION_DECOR_EXPANSION_MANIFEST.json', 'utf8'));
  assert.equal(m.assets.length, 14);
  assert.equal(COMPANION_SCENE_IDEAS.length, 4);
  for (const id of NEW) {
    const a = resolveCompanionAsset('furniture', id);
    assert.equal(a.placeholder, false, id);
    assert.ok(existsSync('miniprogram' + a.src));
  }
  const cabinet = resolveCompanionAsset('furniture', 'three_cities_souvenir_cabinet');
  assert.ok(Math.abs(cabinet.width / cabinet.height - 1.5) < 0.001);
  assert.equal(companionFurnitureLayer('dacheng_eight_relief_platform'), 0);
});
test('journal portraits remain in the main package while room pages and heavy assets form a real subpackage', () => {
  const app = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
  const pack = (app.subPackages ?? app.subpackages ?? []).find((p) => p.root === 'pages/companion');
  assert.ok(pack);
  assert.deepEqual(pack.pages, [
    'index',
    'tasks/index',
    'collection/index',
    'mail/index',
    'card/index',
    'photo/index',
    'playground/index',
    'chat/index',
  ]);
  assert.equal(app.pages.includes('pages/companion/index'), false);
  for (const i of COMPANION_SKINS) {
    const a = companionAssetPreview('skin', i.id);
    assert.ok(a.src.startsWith('/assets/companion/'));
  }
  for (const i of COMPANION_FURNITURE) {
    const a = resolveCompanionAsset('furniture', i.id);
    assert.ok(a.src.startsWith('/pages/companion/assets/'), i.id);
    assert.ok(existsSync('miniprogram' + a.src));
  }
});
