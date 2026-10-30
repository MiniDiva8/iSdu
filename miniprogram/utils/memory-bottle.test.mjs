import assert from 'node:assert/strict';
import test from 'node:test';

import { MEMORY_MOODS } from '../models/memory.ts';
import {
  BOTTLE_PAGE_SIZE,
  BOTTLE_WALLS,
  createBottleMemories,
  getBottlePage,
  createBottleParticles,
  getBottleGravity,
  stepBottle,
  shakeBottle,
  hitTestBottle,
} from './memory-bottle.ts';

function memory(id, overrides = {}) {
  return {
    id,
    text: '图书馆前的晚霞',
    imagePaths: [],
    placeName: '图书馆',
    mood: 'happy',
    customMood: '',
    category: 'campus-life',
    customCategory: '',
    mapAssetVersion: 'campus-map-v2',
    mapXRatio: 0.5,
    mapYRatio: 0.5,
    recordedAt: '2026-10-25T08:00:00.000Z',
    createdAt: '2026-10-25T08:00:00.000Z',
    updatedAt: '2026-10-25T08:00:00.000Z',
    origin: 'user',
    ...overrides,
  };
}

function inside(particle) {
  for (let i = 0; i < BOTTLE_WALLS.length; i++) {
    const a = BOTTLE_WALLS[i];
    const b = BOTTLE_WALLS[(i + 1) % BOTTLE_WALLS.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = ((particle.x - a.x) * -dy + (particle.y - a.y) * dx) / Math.hypot(dx, dy);
    assert.ok(
      distance >= particle.radius - 0.15,
      'particle escaped the glass wall: ' + particle.id,
    );
  }
  for (const field of ['x', 'y', 'vx', 'vy', 'angle']) {
    assert.ok(Number.isFinite(particle[field]), 'non-finite ' + field);
  }
}

test('existing records retain identity and labels and are ordered newest first without mutation', () => {
  const records = [
    memory('old', { recordedAt: '2025-01-01T08:00:00.000Z' }),
    memory('new', { mood: 'sad', placeName: '', text: '' }),
  ];
  const before = structuredClone(records);
  const views = createBottleMemories(records);
  assert.deepEqual(
    views.map((item) => item.id),
    ['new', 'old'],
  );
  assert.equal(views[0].moodLabel, '难过');
  assert.equal(views[0].placeLabel, '校园中的某处');
  assert.ok(views[0].summary);
  assert.ok(views[0].dateLabel);
  assert.deepEqual(records, before);
});

test('all twelve moods have stable distinct colors and custom words keep a stable color', () => {
  const records = MEMORY_MOODS.map((mood) =>
    memory(mood, { mood, customMood: mood === 'custom' ? '小确幸' : '' }),
  );
  const first = createBottleMemories(records);
  const again = createBottleMemories(structuredClone(records));
  assert.deepEqual(
    first.map((item) => item.color),
    again.map((item) => item.color),
  );
  assert.equal(new Set(first.map((item) => item.color)).size, MEMORY_MOODS.length);
  const custom = createBottleMemories([
    memory('custom-a', { mood: 'custom', customMood: ' 小确幸 ' }),
  ])[0];
  assert.equal(custom.color, first.find((item) => item.id === 'custom').color);
  assert.equal(custom.moodLabel, '小确幸');
});

test('all history remains reachable across complete pages, including matching dates', () => {
  const records = Array.from({ length: 137 }, (_, i) =>
    memory('memory-' + String(i).padStart(3, '0')),
  );
  const views = createBottleMemories(records);
  assert.equal(BOTTLE_PAGE_SIZE, 60);
  const seen = [];
  for (let page = 0; page < 3; page++) {
    const items = getBottlePage(views, page);
    assert.ok(items.length <= 60);
    seen.push(...items.map((item) => item.id));
  }
  assert.equal(seen.length, 137);
  assert.equal(new Set(seen).size, 137);
  assert.deepEqual(
    seen,
    views.map((item) => item.id),
  );
  assert.deepEqual(getBottlePage([], 0), []);
  assert.deepEqual(getBottlePage(views, -3), getBottlePage(views, 0));
  assert.deepEqual(getBottlePage(views, 999), getBottlePage(views, 2));
  assert.deepEqual(getBottlePage(views, NaN), getBottlePage(views, 0));
});

test('initial particles correspond one to one with records and begin inside the bottle', () => {
  const views = createBottleMemories(Array.from({ length: 60 }, (_, i) => memory('m-' + i)));
  const particles = createBottleParticles(views);
  assert.deepEqual(
    particles.map((item) => item.id),
    views.map((item) => item.id),
  );
  particles.forEach(inside);
  assert.deepEqual(createBottleParticles(views), particles);
});

test('a tilted phone changes gravity direction and invalid sensor samples are ignored safely', () => {
  assert.ok(getBottleGravity({ x: 0, y: -1, z: 0 }).y > 0);
  assert.ok(getBottleGravity({ x: 1, y: 0, z: 0 }).x > 0);
  assert.ok(getBottleGravity({ x: 0, y: 1, z: 0 }).y < 0);
  for (const sample of [
    { x: NaN, y: Infinity, z: -Infinity },
    { x: 9999, y: -9999, z: 0 },
  ]) {
    const gravity = getBottleGravity(sample);
    assert.ok(Number.isFinite(gravity.x) && Number.isFinite(gravity.y));
    assert.ok(Math.abs(gravity.x) <= 2 && Math.abs(gravity.y) <= 2);
  }
});

test('gravity moves a freely falling ball and the bottle floor catches it', () => {
  const particles = createBottleParticles(createBottleMemories([memory('one')]));
  const p = particles[0];
  p.x = 160;
  p.y = 170;
  const start = p.y;
  for (let frame = 0; frame < 240; frame++) stepBottle(particles, { x: 0, y: 1 }, 1 / 30);
  assert.ok(p.y > start + 100);
  inside(p);
});

test('dense balls stay finite and inside the bottle through strong shakes in every direction', () => {
  const particles = createBottleParticles(
    createBottleMemories(Array.from({ length: 60 }, (_, i) => memory('dense-' + i))),
  );
  const directions = [
    { x: 2, y: 2 },
    { x: -2, y: -2 },
    { x: 2, y: -2 },
    { x: -2, y: 2 },
  ];
  for (let frame = 0; frame < 420; frame++) {
    if (frame % 80 === 0) shakeBottle(particles, frame + 1);
    stepBottle(particles, directions[Math.floor(frame / 105)], 1 / 30);
    particles.forEach(inside);
  }
});

test('colliding circles separate rather than passing through each other', () => {
  const particles = createBottleParticles(createBottleMemories([memory('a'), memory('b')]));
  Object.assign(particles[0], { x: 147, y: 220, vx: 80, vy: 0 });
  Object.assign(particles[1], { x: 173, y: 220, vx: -80, vy: 0 });
  for (let frame = 0; frame < 15; frame++) stepBottle(particles, { x: 0, y: 0 }, 1 / 60);
  const [a, b] = particles;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius - 0.5);
});

test('long or invalid frame delays cannot teleport particles or produce invalid coordinates', () => {
  const particles = createBottleParticles(createBottleMemories([memory('one')]));
  Object.assign(particles[0], { x: 160, y: 200, vx: 50 });
  const before = structuredClone(particles);
  for (const dt of [NaN, Infinity, -10, 0]) stepBottle(particles, { x: 0, y: 1 }, dt);
  assert.deepEqual(particles, before);
  stepBottle(particles, { x: Infinity, y: NaN }, 3600);
  assert.ok(Math.abs(particles[0].x - before[0].x) < 30);
  particles.forEach(inside);
});

test('the shake button launches balls and uses reproducible bounded impulses', () => {
  const views = createBottleMemories([memory('a'), memory('b')]);
  const first = createBottleParticles(views);
  const second = createBottleParticles(views);
  shakeBottle(first, 123);
  shakeBottle(second, 123);
  assert.deepEqual(first, second);
  assert.ok(first.every((item) => item.vy < -100));
  assert.ok(first.every((item) => Math.abs(item.vx) <= 600 && Math.abs(item.vy) <= 600));
});

test('hit detection selects the visible ball by record ID and ignores empty glass', () => {
  const particles = createBottleParticles(createBottleMemories([memory('a'), memory('b')]));
  Object.assign(particles[0], { x: 100, y: 200 });
  Object.assign(particles[1], { x: 200, y: 200 });
  assert.equal(hitTestBottle(particles, 100, 200), particles[0].id);
  assert.equal(hitTestBottle(particles, 200, 200), particles[1].id);
  assert.equal(hitTestBottle(particles, 160, 80), null);
  assert.equal(hitTestBottle(particles, NaN, 200), null);
  assert.equal(hitTestBottle([], 0, 0), null);
});

test('fast opposing diagonal balls cannot exchange sides during a long display frame', () => {
  const views = createBottleMemories(Array.from({ length: 60 }, (_, i) => memory('diagonal-' + i)));
  const particles = createBottleParticles(views).slice(0, 2);
  Object.assign(particles[0], { x: 130, y: 180, vx: 600, vy: 600 });
  Object.assign(particles[1], { x: 150.2, y: 200.2, vx: -600, vy: -600 });
  stepBottle(particles, { x: 0, y: 0 }, 0.022);
  const [a, b] = particles;
  assert.ok(b.x - a.x + (b.y - a.y) > 0, 'diagonal balls passed through one another');
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.radius + b.radius - 0.5);
});
