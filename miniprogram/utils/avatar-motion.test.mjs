import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarMotion, AVATAR_TRAVEL_LIMIT } from './avatar-motion.ts';

function frames(model, n = 240, dt = 1000 / 60) {
  for (let i = 0; i < n; i += 1) model.advance(dt);
  return model.snapshot();
}
function inside(state) {
  assert.ok(Object.values(state).every(Number.isFinite));
  assert.ok(Math.hypot(state.x, state.y) <= AVATAR_TRAVEL_LIMIT + 1e-9);
}
test('resting face starts at the bottom and snapshots cannot mutate its state', () => {
  const model = new AvatarMotion();
  const state = model.snapshot();
  assert.equal(state.x, 0);
  assert.equal(state.y, AVATAR_TRAVEL_LIMIT);
  state.x = 100;
  inside(model.snapshot());
  assert.ok(model.isSettled());
});
test('tilting moves the face in the gravity direction and generates rolling rotation', () => {
  const model = new AvatarMotion();
  model.setGravity(1, 0.1);
  const state = frames(model, 150);
  assert.ok(state.x > 0.35);
  assert.ok(Math.abs(state.angle) > 0.08);
  inside(state);
});
test('a nudge gains inertia and then settles at the bottom without endless spinning', () => {
  const model = new AvatarMotion();
  model.kick(-2, -2.5);
  assert.ok(!model.isSettled());
  const state = frames(model, 1800);
  inside(state);
  assert.ok(model.isSettled());
  assert.ok(state.y > 0.45);
});
test('many alternating shake impulses never let the complete ball leave the container', () => {
  const model = new AvatarMotion();
  for (let i = 0; i < 9000; i += 1) {
    if (i % 7 === 0) model.kick(Math.sin(i) * 200, Math.cos(i) * 100);
    if (i % 31 === 0) model.setGravity(Math.cos(i), Math.sin(i));
    model.advance(i % 13 === 0 ? 1500 : 16);
    inside(model.snapshot());
  }
});
test('non-finite gravity, samples, impulses and frame times cannot poison physics', () => {
  const model = new AvatarMotion();
  const before = model.snapshot();
  assert.equal(model.setGravity(NaN, 1), false);
  assert.equal(model.kick(1, Infinity), false);
  assert.equal(model.acceptAcceleration({ x: 0, y: NaN, z: 0 }), false);
  assert.equal(model.acceptAcceleration(null), false);
  model.advance(Infinity);
  model.advance(-30);
  assert.deepEqual(model.snapshot(), before);
});
test('background frame gaps are bounded to one 50 ms advance', () => {
  const a = new AvatarMotion(),
    b = new AvatarMotion();
  a.kick(2, -1);
  b.kick(2, -1);
  a.advance(120000);
  b.advance(50);
  assert.deepEqual(a.snapshot(), b.snapshot());
});
test('30 and 60 fps have comparable physical trajectories', () => {
  const a = new AvatarMotion(),
    b = new AvatarMotion();
  a.kick(-1.5, -2);
  b.kick(-1.5, -2);
  const sa = frames(a, 30, 1000 / 30),
    sb = frames(b, 60);
  assert.ok(Math.hypot(sa.x - sb.x, sa.y - sb.y) < 0.02);
});
test('portrait sensor mapping responds to tilt and keeps flat-phone gravity gentle', () => {
  const model = new AvatarMotion();
  for (let i = 0; i < 60; i += 1) model.acceptAcceleration({ x: 0.8, y: -0.1, z: -0.5 });
  assert.ok(frames(model, 150).x > 0.3);
  model.reset();
  for (let i = 0; i < 60; i += 1) model.acceptAcceleration({ x: 0, y: 0, z: -1 });
  inside(frames(model));
  assert.ok(model.snapshot().y > 0);
});
test('reset returns to stable home pose after an extreme input history', () => {
  const model = new AvatarMotion();
  model.kick(100, -100);
  frames(model, 20);
  model.reset();
  assert.equal(model.snapshot().angle, 0);
  assert.ok(model.isSettled());
});

test('slow cumulative tilt eventually requests a wake even when each sample delta is tiny', () => {
  const model = new AvatarMotion();
  let wakes = 0;
  for (let i = 0; i <= 800; i += 1) {
    const x = i / 1000;
    if (model.acceptAcceleration({ x, y: -Math.sqrt(1 - x * x), z: 0 })) wakes += 1;
  }
  assert.ok(wakes > 10, 'cumulative tilt must wake a resting face');
});

test('a gentle tilt stays awake at 60 fps until gravity reaches equilibrium', () => {
  const model = new AvatarMotion();
  model.acceptAcceleration({ x: 1, y: -0.15, z: 0 });
  model.advance(1000 / 60);
  assert.equal(model.isSettled(), false, 'small first-frame velocity is not equilibrium');
  let count = 1;
  while (!model.isSettled() && count < 1800) {
    model.advance(1000 / 60);
    count++;
  }
  assert.ok(count > 30, 'the tilt must continue between sensor samples');
  assert.ok(model.isSettled(), 'motion must eventually sleep');
  assert.ok(model.snapshot().x > 0.1);
});
