import assert from 'node:assert/strict';
import test from 'node:test';
import {
  worldToScreen,
  screenToWorld,
  clampCompanionCamera,
  zoomCompanionCamera,
  stepCompanion,
  hitCompanionFurniture,
} from './companion-scene.ts';
import { resolveCompanionAsset, companionSpriteFrame } from '../data/companion-assets.ts';
import * as companionScene from './companion-scene.ts';
import { createCompanionSceneRenderer } from './companion-artwork.ts';
import { companionThemeBackground } from '../data/companion-assets.ts';
test('world coordinates round-trip at narrow, phone and tablet sizes while zoomed and panned', () => {
  for (const viewport of [
    { width: 320, height: 650 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    for (const zoom of [1, 1.6, 2.5]) {
      const camera = clampCompanionCamera({ x: 80, y: -50, zoom }, viewport);
      const p = { x: 0.27, y: 0.73 },
        s = worldToScreen(p, camera, viewport),
        w = screenToWorld(s, camera, viewport);
      assert.ok(Math.abs(w.x - p.x) < 1e-8);
      assert.ok(Math.abs(w.y - p.y) < 1e-8);
    }
  }
});
test('zooming preserves the chosen world point and rejects invalid camera input', () => {
  const v = { width: 390, height: 844 },
    p = { x: 200, y: 420 },
    c = { x: 0, y: 0, zoom: 1.5 };
  const before = screenToWorld(p, c, v),
    after = screenToWorld(p, zoomCompanionCamera(c, 2, p, v), v);
  assert.ok(Math.abs(before.x - after.x) < 1e-8);
  assert.ok(Math.abs(before.y - after.y) < 1e-8);
  assert.equal(clampCompanionCamera({ x: Infinity, y: NaN, zoom: 10 }, v).zoom, 2.5);
});
test('walking is elapsed-time based, arrives exactly and cannot jump after a long pause', () => {
  let a = { x: 0.3, y: 0.7, moving: true, facing: 1 },
    b = { ...a },
    target = { x: 0.8, y: 0.7 };
  for (let i = 0; i < 60; i++) a = stepCompanion(a, target, 1 / 60);
  for (let i = 0; i < 120; i++) b = stepCompanion(b, target, 1 / 120);
  assert.ok(Math.abs(a.x - b.x) < 1e-8);
  const paused = stepCompanion(a, target, 10);
  assert.ok(paused.x - a.x < 0.02);
  for (let i = 0; i < 300; i++) a = stepCompanion(a, target, 1 / 60);
  assert.equal(a.x, target.x);
  assert.equal(a.moving, false);
});
test('furniture hit testing follows depth order and ignores unknown locations', () => {
  const items = [
    { id: 'back', itemId: 'bench', x: 0.5, y: 0.5, rotation: 0 },
    { id: 'front', itemId: 'flowers', x: 0.5, y: 0.51, rotation: 0 },
  ];
  assert.equal(hitCompanionFurniture({ x: 0.5, y: 0.49 }, items)?.id, 'front');
  assert.equal(hitCompanionFurniture({ x: 0.1, y: 0.1 }, items), null);
});
test('asset adapter accepts static and sheet images with anchors without changing game state', () => {
  const asset = resolveCompanionAsset('skin', 'sprout');
  assert.equal(asset.placeholder, false);
  const def = {
    ...asset,
    src: '/assets/custom/pet.png',
    placeholder: false,
    frameWidth: 128,
    frameHeight: 128,
    columns: 4,
    rows: 3,
    fps: 8,
    states: {
      idle: { row: 0, frames: 2 },
      walk: { row: 1, frames: 4 },
      interact: { row: 2, frames: 3 },
    },
  };
  assert.deepEqual(companionSpriteFrame(def, 'walk', 0.625), {
    sx: 128,
    sy: 128,
    sw: 128,
    sh: 128,
  });
  assert.equal(companionSpriteFrame({ ...def, columns: 1, rows: 1 }, 'idle', 0).sx, 0);
  assert.equal(resolveCompanionAsset('furniture', 'missing').placeholder, true);
});

test('rotated anchored furniture uses the inverse-rotated pointer, not swapped bounds', () => {
  const item = { id: 'rotated', itemId: 'bench', x: 0.5, y: 0.5, rotation: 90 };
  assert.equal(hitCompanionFurniture({ x: 0.5 + 120 / 800, y: 0.5 }, [item])?.id, 'rotated');
  assert.equal(hitCompanionFurniture({ x: 0.5, y: 0.5 - 150 / 1100 }, [item]), null);
});
test('sprite thumbnails crop a frame instead of exposing the whole sheet', async () => {
  const { COMPANION_ASSET_OVERRIDES, companionAssetPreview } =
    await import('../data/companion-assets.ts');
  const original = COMPANION_ASSET_OVERRIDES.skin;
  COMPANION_ASSET_OVERRIDES.skin = {
    sprout: {
      src: '/assets/companion/test-sheet.png',
      columns: 4,
      rows: 3,
      frameWidth: 128,
      frameHeight: 128,
    },
  };
  try {
    const preview = companionAssetPreview('skin', 'sprout');
    assert.equal(preview.cropped, true);
    assert.ok(preview.style.includes('400% 300%'));
  } finally {
    COMPANION_ASSET_OVERRIDES.skin = original;
  }
});

test('equal-depth overlapping furniture selects the last painted item, including after rotation', () => {
  const items = [
    { id: 'chair', itemId: 'bench', x: 0.45, y: 0.7, rotation: 0 },
    { id: 'table', itemId: 'desk', x: 0.55, y: 0.7, rotation: 0 },
  ];
  assert.equal(hitCompanionFurniture({ x: 0.52, y: 0.62 }, items)?.id, 'table');
  assert.equal(hitCompanionFurniture({ x: 0.52, y: 0.62 }, [...items].reverse())?.id, 'chair');
  assert.equal(
    hitCompanionFurniture(
      { x: 0.5, y: 0.7 },
      items.map((i) => ({ ...i, x: 0.5, rotation: 90 })),
    )?.id,
    'table',
  );
});

test('new walking destinations stay on each scene floor and reject non-finite coordinates', () => {
  assert.equal(typeof companionScene.companionGroundPoint, 'function');
  for (const [theme, minimum] of [
    ['meadow', 0.54],
    ['dusk', 0.52],
    ['blossom', 0.58],
  ]) {
    assert.deepEqual(companionScene.companionGroundPoint({ x: -2, y: 0.1 }, theme), {
      x: 0.08,
      y: minimum,
    });
    assert.deepEqual(companionScene.companionGroundPoint({ x: 2, y: 1 }, theme), {
      x: 0.92,
      y: 0.9,
    });
    const fallback = companionScene.companionGroundPoint({ x: NaN, y: Infinity }, theme);
    assert.equal(fallback.x, 0.5);
    assert.ok(Math.abs(fallback.y - (minimum + 0.9) / 2) < 1e-12);
    assert.deepEqual(companionScene.companionGroundPoint({ x: 0.4, y: 0.8 }, theme), {
      x: 0.4,
      y: 0.8,
    });
  }
  assert.equal(companionScene.companionGroundPoint({ x: 0.5, y: 0 }, 'unknown').y, 0.54);
});

test('depth grows smoothly from the back floor to the foreground and clamps invalid depths', () => {
  assert.equal(typeof companionScene.companionDepthScale, 'function');
  const scale = companionScene.companionDepthScale;
  assert.equal(scale(0.54), 0.8);
  assert.ok(Math.abs(scale(0.9) - 1.12) < 1e-12);
  assert.ok(Math.abs(scale(0.72) - 0.96) < 1e-12);
  assert.equal(scale(-10), 0.8);
  assert.ok(Math.abs(scale(10) - 1.12) < 1e-12);
  assert.equal(scale(NaN), scale(0.72));
  assert.equal(scale(Infinity), scale(0.72));
  const depths = [0.54, 0.58, 0.64, 0.72, 0.8, 0.86, 0.9].map(scale);
  assert.ok(depths.every((value, index) => !index || value > depths[index - 1]));
  assert.ok(scale(0.541) - scale(0.54) < 0.001);
});

test('furniture pointer bounds match near and far painted size even after rotation', () => {
  const far = { id: 'far', itemId: 'bench', x: 0.5, y: 0.54, rotation: 0 };
  const near = { ...far, id: 'near', y: 0.9 };
  assert.equal(hitCompanionFurniture({ x: 0.5 + 95 / 800, y: 0.54 }, [far]), null);
  assert.equal(hitCompanionFurniture({ x: 0.5 + 112 / 800, y: 0.9 }, [near])?.id, 'near');
  assert.equal(
    hitCompanionFurniture({ x: 0.5 + 170 / 800, y: 0.54 }, [{ ...far, rotation: 90 }]),
    null,
  );
  assert.equal(
    hitCompanionFurniture({ x: 0.5 + 210 / 800, y: 0.9 }, [{ ...near, rotation: 90 }])?.id,
    'near',
  );
  for (const itemId of ['picnic', 'sign']) {
    const asset = resolveCompanionAsset('furniture', itemId);
    const point = { x: 0.5 + (asset.width * (1 - asset.anchorX) * 0.95) / 800, y: 0.54 };
    assert.equal(hitCompanionFurniture(point, [{ ...far, itemId }])?.id, 'far');
  }
});

function recordingContext() {
  const images = [],
    ellipses = [],
    stack = [];
  let transform = { x: 1, y: 1, angle: 0 };
  const target = {
    setTransform(a, _b, _c, d) {
      transform = { x: a, y: d, angle: 0 };
    },
    save() {
      stack.push({ ...transform });
    },
    restore() {
      transform = stack.pop();
    },
    scale(x, y) {
      transform.x *= x;
      transform.y *= y;
    },
    rotate(angle) {
      transform.angle += angle;
    },
    drawImage(image, ...args) {
      images.push({
        id: image.id,
        width: args.at(-2) * Math.abs(transform.x),
        height: args.at(-1) * Math.abs(transform.y),
      });
    },
    ellipse(x, y, rx, ry) {
      ellipses.push({
        x,
        y,
        rx: rx * Math.abs(transform.x),
        ry: ry * Math.abs(transform.y),
        angle: transform.angle,
      });
    },
  };
  return {
    images,
    ellipses,
    ctx: new Proxy(target, {
      get: (o, key) => o[key] ?? (() => {}),
      set: (o, key, value) => ((o[key] = value), true),
    }),
  };
}

test('renderer scales pets and objects with depth while floor and wall art keep their size', () => {
  const placements = [
    { id: 'far', itemId: 'bench', x: 0.3, y: 0.54, rotation: 0 },
    { id: 'near', itemId: 'bench', x: 0.7, y: 0.9, rotation: 0 },
    { id: 'rug', itemId: 'picnic', x: 0.5, y: 0.54, rotation: 0 },
    { id: 'wall', itemId: 'sign', x: 0.5, y: 0.54, rotation: 0 },
  ];
  const snapshot = Object.freeze({
    name: '伙伴',
    skinId: 'sprout',
    accessoryId: 'none',
    theme: 'meadow',
    placements: placements.map(Object.freeze),
  });
  const sourceImages = new Map([[companionThemeBackground('meadow').src, { id: 'background' }]]);
  for (const [kind, id] of [
    ['skin', 'sprout'],
    ['furniture', 'bench'],
    ['furniture', 'picnic'],
    ['furniture', 'sign'],
  ])
    sourceImages.set(resolveCompanionAsset(kind, id).src, { id });
  const renderer = createCompanionSceneRenderer(
    snapshot,
    { width: 800, height: 1100 },
    1,
    sourceImages,
  );
  const recording = recordingContext();
  renderer.draw(
    recording.ctx,
    { x: 0.5, y: 0.54, moving: false, facing: 1 },
    { x: 0, y: 0, zoom: 1 },
    0,
  );
  const widths = (id) =>
    recording.images.filter((image) => image.id === id).map((image) => image.width);
  assert.deepEqual(
    widths('bench').map((width) => Math.round(width * 10)),
    [1680, 2352],
  );
  assert.deepEqual(widths('sprout'), [120]);
  assert.deepEqual(widths('picnic'), [280]);
  assert.deepEqual(widths('sign'), [170]);
  const nearRecording = recordingContext();
  renderer.draw(
    nearRecording.ctx,
    { x: 0.5, y: 0.9, moving: false, facing: 1 },
    { x: 0, y: 0, zoom: 1 },
    0,
  );
  assert.ok(
    Math.abs(nearRecording.images.find((image) => image.id === 'sprout').width - 168) < 1e-12,
  );
  assert.deepEqual(
    snapshot.placements,
    placements,
    'rendering must preserve every stored coordinate',
  );
});

test('object contact shadows follow the same depth and stay at the foot without wall or rug shadows', () => {
  const snapshot = {
    name: '伙伴',
    skinId: 'sprout',
    accessoryId: 'none',
    theme: 'meadow',
    placements: [
      { id: 'far', itemId: 'bench', x: 0.3, y: 0.54, rotation: 90 },
      { id: 'near', itemId: 'bench', x: 0.7, y: 0.9, rotation: 90 },
      { id: 'rug', itemId: 'picnic', x: 0.5, y: 0.7, rotation: 0 },
      { id: 'wall', itemId: 'sign', x: 0.5, y: 0.25, rotation: 0 },
    ],
  };
  const images = new Map([[companionThemeBackground('meadow').src, { id: 'background' }]]);
  for (const [kind, id] of [
    ['skin', 'sprout'],
    ['furniture', 'bench'],
    ['furniture', 'picnic'],
    ['furniture', 'sign'],
  ])
    images.set(resolveCompanionAsset(kind, id).src, { id });
  const recording = recordingContext();
  createCompanionSceneRenderer(snapshot, { width: 800, height: 1100 }, 1, images).draw(
    recording.ctx,
    { x: 0.5, y: 0.72, moving: false, facing: 1 },
    { x: 0, y: 0, zoom: 1 },
    0,
  );
  assert.equal(recording.ellipses.length, 3, 'two object shadows plus the existing pet shadow');
  const [far, , near] = recording.ellipses;
  assert.ok(Math.abs(near.rx / far.rx - 1.4) < 1e-12);
  assert.ok(Math.abs(near.ry / far.ry - 1.4) < 1e-12);
  assert.ok(
    recording.ellipses.every(
      (ellipse) => ellipse.x === 0 && ellipse.y >= 0 && ellipse.y <= 4 && ellipse.angle === 0,
    ),
  );
});
