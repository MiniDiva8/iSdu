import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPlayground,
  stepPlayground,
  hitPlayground,
  buildPlaygroundNotes,
  recommendPlaygroundTask,
  playgroundPaperRect,
  playgroundFlipState,
  resolvePlaygroundNote,
} from './companion-playground.ts';
import { applyCompanionCommand, createCompanionState } from './companion-engine.ts';
import { EMPTY_COMPANION_FACTS } from '../models/companion.ts';

const now = '2026-10-28T06:00:00Z';
const adopted = () =>
  applyCompanionCommand(
    createCompanionState(now),
    { type: 'adopt', name: '途途' },
    EMPTY_COMPANION_FACTS,
    now,
    () => 0,
  ).state;

test('playground scatters twenty independent partners from eight campus roles with one lucky instance', () => {
  for (const [width, height] of [
    [280, 340],
    [704, 420],
    [0, NaN],
  ]) {
    for (const random of [() => 0, () => 0.999999]) {
      const round = createPlayground(width, height, random);
      assert.equal(new Set(round.bodies.map((b) => b.id)).size, 20);
      assert.equal(new Set(round.bodies.map((b) => b.skinId)).size, 8);
      assert.ok(round.bodies.some((b) => b.id === round.luckyId));
      for (const b of round.bodies) {
        assert.ok(b.x >= b.size / 2 && b.x <= round.width - b.size / 2);
        assert.ok(b.y >= b.size / 2 && b.y <= round.height - b.size / 2);
      }
      assert.equal(hitPlayground(round, -100, -100), null);
    }
  }
});

test('moving partners bounce at boundaries and never escape after large frame gaps', () => {
  const round = createPlayground(300, 360, () => 0.5);
  const b = round.bodies[0];
  b.x = b.size / 2;
  b.vx = -150;
  b.y = round.height - b.size / 2;
  b.vy = 150;
  b.wait = 50;
  stepPlayground(round, 30);
  assert.ok(b.vx > 0 && b.vy < 0);
  for (let i = 0; i < 800; i++) stepPlayground(round, 0.04);
  assert.ok(
    round.bodies.every(
      (body) =>
        Number.isFinite(body.x) && body.x >= body.size / 2 && body.x <= round.width - body.size / 2,
    ),
  );
  assert.ok(
    round.bodies.every(
      (body) =>
        Number.isFinite(body.y) &&
        body.y >= body.size / 2 &&
        body.y <= round.height - body.size / 2,
    ),
  );
});

test('colliding partners separate and exchange direction without NaN at identical centers', () => {
  const round = createPlayground(700, 500, () => 0.5);
  const [a, b] = round.bodies;
  round.bodies = [a, b];
  Object.assign(a, { x: 280, y: 200, z: 0, vx: 30, vy: 0, wait: 20 });
  Object.assign(b, { x: 290, y: 200, z: 0, vx: -30, vy: 0, wait: 20 });
  stepPlayground(round, 0.01);
  assert.ok(a.vx < 0 && b.vx > 0);
  assert.ok(b.x - a.x >= (a.size + b.size) * 0.29 - 0.01);
  Object.assign(b, { x: a.x, y: a.y, z: a.z });
  stepPlayground(round, 0.01);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(b.x));
});

test('paper stays beside the selected partner and inside the screen including native safe areas', () => {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [1280, 800],
  ]) {
    const round = createPlayground(width, height, () => 0.1);
    const body = round.bodies[0];
    for (const [x, y] of [
      [0, 0],
      [width, height],
      [width / 2, height / 2],
    ]) {
      Object.assign(body, { x, y, z: 20 });
      const paper = playgroundPaperRect(round, body.id, 68);
      assert.ok(paper.left >= 10 && paper.top >= 76);
      assert.ok(paper.left + paper.width <= width - 10 && paper.top + paper.height <= height - 64);
      assert.equal(body.z, 0);
      assert.ok(Math.abs(body.x - (paper.left + paper.width / 2)) < 1);
    }
  }
});

test('flip turns the character through an edge before revealing its back', () => {
  assert.equal(playgroundFlipState(0).back, false);
  assert.equal(playgroundFlipState(0).scaleX, 1);
  assert.ok(playgroundFlipState(230).scaleX < 0.03);
  assert.equal(playgroundFlipState(460).back, true);
  assert.equal(playgroundFlipState(460).done, true);
  assert.equal(playgroundFlipState(460).scaleX, 1);
});

test('extra field instances resolve to existing real tasks without creating extra reward identities', () => {
  const state = adopted(),
    round = createPlayground(390, 844, () => 0.5);
  const notes = buildPlaygroundNotes(state, EMPTY_COMPANION_FACTS, now);
  const note = resolvePlaygroundNote(round, notes, 'sky_1');
  assert.equal(note.id, 'sky_1');
  assert.equal(note.task.id, 'photo');
  assert.equal(note.task.reward, 10);
  assert.equal(resolvePlaygroundNote(round, notes, 'forged'), null);
});

test('selected partners stay still, and touch hit testing follows the visible jump', () => {
  const round = createPlayground(300, 400, () => 0.5);
  const b = round.bodies[0];
  const original = structuredClone(b);
  stepPlayground(round, 0.04, b.id);
  assert.deepEqual(b, original);
  b.z = 35;
  assert.equal(hitPlayground(round, b.x, b.y - 35)?.id, b.id);
});

test('a jumping partner at the top edge is hit at its clamped visible center', () => {
  const round = createPlayground(300, 400, () => 0.5);
  const b = round.bodies[0];
  b.y = b.size / 2;
  b.z = b.size * 2;
  assert.equal(hitPlayground(round, b.x, b.size / 2)?.id, b.id);
});

test('task notes expose real progress and real rewards; opening notes never grants completion', () => {
  const state = adopted();
  const before = JSON.stringify(state);
  const notes = buildPlaygroundNotes(state, EMPTY_COMPANION_FACTS, now);
  assert.equal(notes.length, 8);
  assert.equal(notes.find((n) => n.id === 'sunshine').task.id, 'write');
  assert.equal(notes.find((n) => n.id === 'sunshine').task.eligible, false);
  assert.equal(notes.find((n) => n.id === 'sky').task.reward, 10);
  assert.equal(notes.find((n) => n.id === 'mint').task.eligible, false);
  assert.equal(JSON.stringify(state), before);
  const updated = buildPlaygroundNotes(
    state,
    { ...EMPTY_COMPANION_FACTS, entriesToday: 1, photosToday: 1 },
    now,
  );
  assert.equal(updated.find((n) => n.id === 'sunshine').task.eligible, true);
  assert.equal(updated.find((n) => n.id === 'sky').task.eligible, true);
  const twoDays = buildPlaygroundNotes(state, { ...EMPTY_COMPANION_FACTS, recordedDays: 2 }, now);
  assert.match(twoDays.find((n) => n.id === 'peach').task.hint, /2 \/ 3/);
  assert.deepEqual(buildPlaygroundNotes(createCompanionState(now), EMPTY_COMPANION_FACTS, now), []);
});

test('recommendation prefers a claimable task and reports all-claimed state without invented rewards', () => {
  const tasks = [
    { id: 'write', eligible: false, claimed: false, reward: 10 },
    { id: 'play', eligible: true, claimed: false, reward: 10 },
  ];
  assert.equal(recommendPlaygroundTask(tasks)?.id, 'play');
  tasks[1].claimed = true;
  assert.equal(recommendPlaygroundTask(tasks)?.id, 'write');
  tasks[0].claimed = true;
  assert.equal(recommendPlaygroundTask(tasks), null);
});

test('notes refresh daily interaction eligibility at Beijing midnight while keeping permanent progress', () => {
  const state = applyCompanionCommand(
    adopted(),
    { type: 'interact' },
    EMPTY_COMPANION_FACTS,
    now,
    () => 0,
  ).state;
  assert.equal(
    buildPlaygroundNotes(state, EMPTY_COMPANION_FACTS, now).find((n) => n.id === 'sprout').task
      .eligible,
    true,
  );
  assert.equal(
    buildPlaygroundNotes(state, EMPTY_COMPANION_FACTS, '2026-10-28T16:00:01Z').find(
      (n) => n.id === 'sprout',
    ).task.eligible,
    false,
  );
});
