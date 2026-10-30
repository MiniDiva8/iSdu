import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  companionImageSources,
  createCompanionSceneRenderer,
} from '../miniprogram/utils/companion-artwork.ts';
import { createCompanionState } from '../miniprogram/utils/companion-engine.ts';

const snapshot = createCompanionState('2026-10-29T00:00:00Z');
const pet = { x: 0.52, y: 0.72, moving: false, facing: 1 };
function context() {
  const operations = [];
  return new Proxy(
    { operations },
    {
      get: (object, key) => object[key] ?? ((...args) => operations.push([key, ...args])),
      set: (object, key, value) => ((object[key] = value), true),
    },
  );
}
function fixture(width = 390, height = 844, ratio = 2) {
  const surfaces = [];
  const images = new Map(companionImageSources(snapshot).map((src) => [src, { src }]));
  const renderer = createCompanionSceneRenderer(
    snapshot,
    { width, height },
    ratio,
    images,
    (w, h) => {
      const ctx = context();
      const surface = { width: w, height: h, getContext: () => ctx, ctx };
      surfaces.push(surface);
      return surface;
    },
  );
  return { renderer, surfaces, ctx: context() };
}

test('60 moving-camera frames reuse one viewport surface instead of allocating 60', () => {
  const f = fixture();
  for (let frame = 0; frame < 60; frame++)
    f.renderer.draw(f.ctx, pet, { x: frame, y: -frame, zoom: 1 }, frame / 60);
  assert.equal(f.surfaces.length, 1);
  assert.deepEqual([f.surfaces[0].width, f.surfaces[0].height], [780, 1688]);
  assert.equal(f.ctx.operations.filter(([name]) => name === 'drawImage').length > 60, true);
  f.renderer.dispose();
});

test('reused backgrounds reset transform and clear before repainting the new camera', () => {
  const f = fixture();
  f.renderer.draw(f.ctx, pet, { x: 0, y: 0, zoom: 1 }, 0);
  const bg = f.surfaces[0];
  const count = bg.ctx.operations.length;
  f.renderer.draw(f.ctx, pet, { x: 0, y: 0, zoom: 1 }, 1);
  assert.equal(bg.ctx.operations.length, count, 'a stationary camera retains its background');
  f.renderer.draw(f.ctx, pet, { x: 25, y: -10, zoom: 1.25 }, 2);
  const repaint = bg.ctx.operations.slice(count);
  assert.deepEqual(repaint[0], ['setTransform', 2, 0, 0, 2, 0, 0]);
  assert.deepEqual(repaint[1], ['clearRect', 0, 0, 390, 844]);
  assert.ok(repaint.some(([name, x, y]) => name === 'translate' && x === 220 && y === 412));
  f.renderer.dispose();
});

test('photo export retains its own viewport and backing scale while disposal releases the cache', () => {
  const f = fixture(600, 825, 2);
  f.renderer.draw(f.ctx, pet, { x: 0, y: 0, zoom: 1 }, 0);
  assert.deepEqual([f.surfaces[0].width, f.surfaces[0].height], [1200, 1650]);
  assert.ok(
    f.ctx.operations.some(
      ([name, , x, y, w, h]) =>
        name === 'drawImage' && x === 0 && y === 0 && w === 600 && h === 825,
    ),
  );
  f.renderer.dispose();
  assert.equal(f.renderer.mode, 'vector');
  f.renderer.draw(f.ctx, pet, { x: 0, y: 0, zoom: 1 }, 1);
  assert.equal(f.surfaces.length, 2);
  f.renderer.dispose();
});
