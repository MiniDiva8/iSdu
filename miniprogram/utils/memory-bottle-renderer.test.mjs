import assert from 'node:assert/strict';
import test from 'node:test';
import { createBottleParticles, stepBottle } from './memory-bottle.ts';
import { createBottleRenderer } from './memory-bottle-renderer.ts';

function particles(count = 60) {
  return createBottleParticles(
    Array.from({ length: count }, (_, i) => ({
      id: 'cached-' + i,
      mood: ['happy', 'calm', 'sad'][i % 3],
      color: ['#F4CC63', '#8DBEAF', '#85B5D0'][i % 3],
    })),
  );
}
function context() {
  const calls = new Map();
  const styles = [];
  const proxy = new Proxy(
    {},
    {
      get(target, key) {
        return (
          target[key] ??
          ((...args) => {
            calls.set(key, (calls.get(key) ?? 0) + 1);
            return args;
          })
        );
      },
      set(target, key, value) {
        styles.push([key, value]);
        target[key] = value;
        return true;
      },
    },
  );
  return { value: proxy, calls, styles };
}
function surfaces() {
  const all = [];
  return {
    all,
    make(width, height) {
      const ctx = context();
      const surface = { width, height, getContext: () => ctx.value };
      all.push({ surface, ctx });
      return surface;
    },
  };
}
test('warm cached frames blit sprites without repainting glass shadows or face paths', () => {
  const balls = particles();
  const factory = surfaces();
  const renderer = createBottleRenderer(balls, 2, factory.make);
  assert.equal(renderer.mode, 'cached');
  assert.equal(factory.all.length, 3);
  const before = factory.all.map((item) => [...item.ctx.calls.entries()]);
  const main = context();
  for (let i = 0; i < 10; i++) renderer.draw(main.value, balls);
  assert.equal(factory.all.length, 3);
  assert.deepEqual(
    factory.all.map((item) => [...item.ctx.calls.entries()]),
    before,
  );
  assert.equal(main.calls.get('arc') ?? 0, 0);
  assert.equal(main.calls.get('ellipse') ?? 0, 0);
  assert.ok((main.calls.get('drawImage') ?? 0) >= 600);
  assert.ok([...main.calls.values()].reduce((a, b) => a + b, 0) / 10 < 500);
  assert.equal(
    main.styles.some(([key]) => key === 'shadowBlur'),
    false,
  );
});

test('sprite atlas reuses repeated moods and each new color prepares fresh artwork', () => {
  const first = surfaces();
  const balls = particles(12);
  createBottleRenderer(balls, 2, first.make);
  const atlas = first.all[2];
  assert.ok(atlas);
  assert.equal(
    atlas.ctx.styles.filter(
      ([key, value]) => key === 'fillStyle' && ['#F4CC63', '#8DBEAF', '#85B5D0'].includes(value),
    ).length,
    3,
  );
  const next = surfaces();
  const changed = balls.map((ball) => ({ ...ball, color: '#ff5577' }));
  createBottleRenderer(changed, 2, next.make);
  assert.ok(
    next.all[2].ctx.styles.some(([key, value]) => key === 'fillStyle' && value === '#ff5577'),
  );
});

test('unsupported offscreen surfaces keep the original accessible vector rendering', () => {
  for (const factory of [
    undefined,
    () => {
      throw new Error('offscreen not supported');
    },
  ]) {
    const renderer = createBottleRenderer(particles(2), 2, factory);
    const main = context();
    assert.equal(renderer.mode, 'vector');
    assert.doesNotThrow(() => renderer.draw(main.value, particles(2)));
    assert.ok(main.calls.get('arc') > 0);
  }
});

test('a platform that rejects offscreen image blits falls back without losing the bottle', () => {
  const factory = surfaces();
  const renderer = createBottleRenderer(particles(2), 2, factory.make);
  const main = context();
  main.value.drawImage = () => {
    throw new Error('image source unsupported');
  };
  assert.doesNotThrow(() => renderer.draw(main.value, particles(2)));
  assert.equal(renderer.mode, 'vector');
  assert.ok(main.calls.get('arc') > 0);
});

test('offscreen surfaces cap retina allocation to 2x without changing logical dimensions', () => {
  const factory = surfaces();
  createBottleRenderer(particles(12), 9, factory.make);
  assert.equal(factory.all[0].surface.width, 640);
  assert.equal(factory.all[0].surface.height, 800);
  assert.equal(factory.all[1].surface.width, 640);
  assert.equal(factory.all[1].surface.height, 800);
});

test('a dense physics step avoids thousands of repeated wall and distant-pair square roots', () => {
  const balls = particles();
  let expensive = 0;
  const hypot = Math.hypot;
  const sqrt = Math.sqrt;
  Math.hypot = (...args) => {
    expensive++;
    return hypot(...args);
  };
  Math.sqrt = (value) => {
    expensive++;
    return sqrt(value);
  };
  try {
    stepBottle(balls, { x: 0.2, y: 1 }, 1 / 60);
    assert.ok(expensive < 3000, 'expensive distance evaluations: ' + expensive);
  } finally {
    Math.hypot = hypot;
    Math.sqrt = sqrt;
  }
});
