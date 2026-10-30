import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCompanionState,
  applyCompanionCommand,
  buildCompanionTasks,
  buildCompanionLetters,
  companionDayKey,
  parseCompanionState,
} from './companion-engine.ts';
const NOW = '2026-10-26T08:00:00.000Z';
const facts = {
  totalEntries: 1,
  entriesToday: 1,
  photosToday: 0,
  recordedDays: 1,
  latestMood: 'calm',
};
function adopted(now = NOW) {
  return applyCompanionCommand(
    createCompanionState(now),
    { type: 'adopt', name: '豆芽' },
    facts,
    now,
    () => 0,
  ).state;
}
function run(s, c, now = NOW, r = () => 0) {
  return applyCompanionCommand(s, c, facts, now, r);
}
test('Beijing day changes at 16:00 UTC and invalid timestamps are rejected', () => {
  assert.equal(companionDayKey('2026-10-25T15:59:59Z'), '2026-10-25');
  assert.equal(companionDayKey('2026-10-25T16:00:00Z'), '2026-10-26');
  assert.throws(() => companionDayKey('broken'));
});
test('adoption/welcome/diary task rewards cannot be claimed twice', () => {
  let s = adopted();
  assert.equal(s.crystals, 100);
  assert.throws(() => run(s, { type: 'adopt', name: 'again' }));
  s = run(s, { type: 'claim', taskId: 'welcome' }).state;
  assert.equal(s.crystals, 200);
  assert.throws(() => run(s, { type: 'claim', taskId: 'welcome' }));
  s = run(s, { type: 'claim', taskId: 'write' }).state;
  assert.equal(s.crystals, 210);
  assert.throws(() => run(s, { type: 'claim', taskId: 'write' }));
  assert.equal(buildCompanionTasks(s, facts, NOW).find((t) => t.id === 'write').claimed, true);
});
test('absent/photo/demo-free facts cannot unlock diary rewards', () => {
  const s = adopted();
  assert.throws(() =>
    applyCompanionCommand(
      s,
      { type: 'claim', taskId: 'write' },
      { ...facts, totalEntries: 0, entriesToday: 0 },
      NOW,
      () => 0,
    ),
  );
  assert.throws(() => run(s, { type: 'claim', taskId: 'photo' }));
});
test('check-in uses a single receipt per day and awards the seventh day only once', () => {
  let s = adopted();
  let seventh;
  for (let d = 26; d <= 32; d++) {
    const now = new Date(Date.UTC(2026, 9, d, 8)).toISOString();
    seventh = run(s, { type: 'checkin' }, now);
    s = seventh.state;
  }
  assert.equal(s.checkins.length, 7);
  assert.equal(s.crystals, 360);
  assert.ok(seventh.message.includes('7'));
  assert.throws(() => run(s, { type: 'checkin' }, '2026-11-01T09:00:00Z'));
  assert.equal(s.shards, 3);
});
test('makeup is paid, past-only, after adoption and once per current day', () => {
  let s = adopted();
  s = run(s, { type: 'checkin' }).state;
  s = run(s, { type: 'makeup', day: '2026-10-27' }, '2026-10-28T08:00:00Z').state;
  assert.equal(s.crystals, 110);
  assert.ok(s.checkins.includes('2026-10-27'));
  assert.throws(() => run(s, { type: 'makeup', day: '2026-10-25' }, '2026-10-28T08:00:00Z'));
  assert.throws(() => run(s, { type: 'makeup', day: '2026-10-29' }, '2026-10-28T08:00:00Z'));
  assert.throws(() => run(s, { type: 'makeup', day: '2026-10-26' }, '2026-10-28T08:00:00Z'));
});
test('clock rollback does not allow old rewards after later mutations', () => {
  let s = run(adopted(), { type: 'checkin' }, '2026-10-27T08:00:00Z').state;
  assert.throws(
    () => run(s, { type: 'checkin' }, NOW),
    (e) => e.code === 'CLOCK_ROLLBACK',
  );
});
test('draws reject insufficient funds, handle duplicates and dedupe the same action key', () => {
  let s = adopted();
  const c = { type: 'draw', requestId: 'one-draw' };
  const first = run(s, c);
  assert.equal(first.state.crystals, 20);
  assert.equal(first.state.shards, 5);
  const replay = run(first.state, c);
  assert.deepEqual(replay.state, first.state);
  assert.throws(() => run(first.state, { type: 'draw', requestId: 'next-draw' }));
  const unique = run(s, { type: 'draw' }, NOW, () => 0.25).state;
  assert.ok(unique.ownedSkins.includes('sky'));
  assert.equal(unique.crystals, 0);
});
test('furniture purchases, placement and withdrawal preserve inventory and bounded positions', () => {
  let s = adopted();
  s = run(s, { type: 'buy', itemId: 'flowers' }).state;
  assert.equal(s.furniture.flowers, 1);
  s = run(s, {
    type: 'place',
    placement: { id: 'flowers-1', itemId: 'flowers', x: 0.2, y: 0.7, rotation: 0 },
  }).state;
  assert.throws(() =>
    run(s, {
      type: 'place',
      placement: { id: 'flowers-2', itemId: 'flowers', x: 0.8, y: 0.7, rotation: 0 },
    }),
  );
  assert.throws(() => run(s, { type: 'move', id: 'flowers-1', x: 2, y: 0.2, rotation: 0 }));
  s = run(s, { type: 'remove', id: 'flowers-1' }).state;
  assert.equal(s.furniture.flowers, 1);
  assert.ok(!s.placements.some((p) => p.id === 'flowers-1'));
});
test('only owned appearances can be equipped and unknown items are rejected', () => {
  let s = adopted();
  assert.throws(() => run(s, { type: 'equipSkin', itemId: 'night' }));
  assert.throws(() => run(s, { type: 'buy', itemId: '__proto__' }));
  assert.throws(() => run(s, { type: 'preferences', name: 'a'.repeat(17) }));
  assert.equal(run(s, { type: 'preferences', name: '小满', theme: 'dusk' }).state.name, '小满');
});
test('companion letters are templated, earned and unread until explicitly opened', () => {
  const s = adopted();
  const letters = buildCompanionLetters(s, facts, NOW);
  assert.ok(letters.find((l) => l.id === 'hello'));
  assert.ok(letters.find((l) => l.id === 'first-entry'));
  const next = run(s, { type: 'readLetter', letterId: 'hello' }).state;
  assert.ok(buildCompanionLetters(next, facts, NOW).find((l) => l.id === 'hello').read);
  assert.throws(() => run(s, { type: 'readLetter', letterId: 'unknown' }));
});
test('malformed saves and impossible inventory are rejected instead of overwritten', () => {
  const s = adopted();
  assert.deepEqual(parseCompanionState(JSON.stringify(s)), s);
  assert.throws(() => parseCompanionState('{broken'));
  assert.throws(() => parseCompanionState(JSON.stringify({ ...s, crystals: -1 })));
  assert.throws(() => parseCompanionState(JSON.stringify({ ...s, ownedSkins: ['invalid'] })));
  assert.throws(() =>
    parseCompanionState(JSON.stringify({ ...s, placements: [...s.placements, s.placements[0]] })),
  );
});

test('makeup selector retains valid days across the seven-day reward boundary', async () => {
  const { companionMakeupDays } = await import('./companion-engine.ts');
  const s = adopted('2026-10-19T08:00:00Z');
  assert.ok(companionMakeupDays(s, NOW).some((d) => d.day === '2026-10-25'));
  assert.ok(companionMakeupDays(s, NOW).every((d) => d.day < '2026-10-26'));
});

test('claimAll awards exactly the ready unclaimed tasks and leaves check-in separate', () => {
  const s = adopted();
  const ready = buildCompanionTasks(s, facts, NOW).filter((t) => t.eligible && !t.claimed);
  const result = run(s, { type: 'claimAll', requestId: 'all-1' });
  assert.equal(result.state.crystals, s.crystals + ready.reduce((n, t) => n + t.reward, 0));
  assert.deepEqual(result.state.checkins, s.checkins);
  assert.equal(
    buildCompanionTasks(result.state, facts, NOW).filter((t) => t.eligible && !t.claimed).length,
    0,
  );
  assert.equal(
    run(result.state, { type: 'claimAll', requestId: 'all-2' }).state.crystals,
    result.state.crystals,
  );
  assert.equal(
    run(result.state, { type: 'claimAll', requestId: 'all-1' }).state.crystals,
    result.state.crystals,
  );
  assert.deepEqual(s, adopted(), 'input state stays intact');
});
test('claimAll cannot award incomplete photo, visit or three-day tasks', () => {
  const result = run(adopted(), { type: 'claimAll' });
  for (const id of ['photo', 'visit', 'days']) {
    const task = buildCompanionTasks(result.state, facts, NOW).find((t) => t.id === id);
    assert.equal(task.claimed, false);
  }
});
