'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { createCompanionHandler } = require('./companion-handler');
const { createCloudCompanionStore } = require('./cloud-companion-store');
const { createDatabase } = require('./companion-test-database.cjs');

const NOW = '2026-10-25T15:59:00.000Z';
const hash = (text) => crypto.createHash('sha256').update(text).digest('hex');
const homeId = (userId) => `home_${hash(userId)}`;
const pairKey = hash('usr_a\0usr_b');
const snapshot = {
  name: '豆芽',
  skinId: 'sprout',
  accessoryId: 'none',
  theme: 'meadow',
  placements: [{ id: 'placed_1', itemId: 'bench', x: 0.5, y: 0.6, rotation: 90 }],
};
function harness({ wrappedTransactions = false } = {}) {
  let current = 'usr_a';
  let now = NOW;
  let moderation = async () => ({ result: { suggest: 'pass' } });
  let sequence = 0;
  const database = createDatabase(
    {
      users: ['a', 'b', 'c'].map((id) => ({
        _id: `usr_${id}`,
        identityHash: hash(`app\0usr_${id}`),
        displayName: id.toUpperCase(),
        status: 'active',
        signature: 'private-signature',
      })),
      friendships: [
        {
          _id: 'friendship_ab',
          pairKey,
          userAId: 'usr_a',
          userBId: 'usr_b',
          relationshipId: 'relationship_ab',
          status: 'active',
        },
      ],
    },
    { wrappedTransactions },
  );
  const handler = createCompanionHandler({
    getTrustedContext: () => (current ? { APPID: 'app', OPENID: current } : {}),
    hash,
    newId: (prefix) => `${prefix}_${++sequence}`,
    newRequestId: () => `req_${++sequence}`,
    now: () => now,
    moderate: (input) => moderation(input),
    store: createCloudCompanionStore(database),
  });
  const call = (action, payload = {}) => handler({ action, payload });
  return {
    database,
    call,
    setCurrent: (id) => {
      current = id;
    },
    setNow: (value) => {
      now = value;
    },
    setModeration: (value) => {
      moderation = value;
    },
    async publish(visibility = 'friends', expectedRevision = 0, value = snapshot) {
      return call('publishHome', { snapshot: value, visibility, expectedRevision });
    },
    visits: () => [...(database.collections.get('companion_visits')?.values() ?? [])],
    revoke: () => {
      database.collections.get('friendships').get('friendship_ab').status = 'removed';
    },
  };
}

test('uses trusted identity and never lets supplied actor IDs publish another home', async () => {
  const h = harness();
  assert.deepEqual((await h.call('getMine')).data, { home: null, userId: 'usr_a' });
  const result = await h.call('publishHome', {
    snapshot,
    visibility: 'friends',
    expectedRevision: 0,
    ownerUserId: 'usr_b',
    OPENID: 'usr_b',
  });
  assert.equal(result.code, 'INVALID_INPUT');
  assert.equal(h.database.collections.get('companion_homes')?.size ?? 0, 0);
  h.setCurrent('');
  assert.equal((await h.call('getMine', { userId: 'usr_a' })).code, 'UNAUTHENTICATED');
  h.setCurrent('usr_b');
  h.database.collections.get('users').get('usr_b').status = 'deleted';
  assert.equal((await h.call('getMine')).code, 'PROFILE_REQUIRED');
});

test('publishes a canonical document and returns an exact public snapshot', async () => {
  const h = harness({ wrappedTransactions: true });
  const result = await h.publish();
  assert.equal(result.ok, true);
  assert.deepEqual(result.data, {
    snapshot,
    visibility: 'friends',
    revision: 1,
    updatedAt: NOW,
    owner: { userId: 'usr_a', displayName: 'A' },
  });
  assert.deepEqual([...h.database.collections.get('companion_homes').keys()], [homeId('usr_a')]);
  const persisted = h.database.collections.get('companion_homes').get(homeId('usr_a'));
  persisted.snapshot.wallet = 900;
  persisted.snapshot.placements[0].diary = 'secret';
  persisted.identityHash = 'secret';
  h.setCurrent('usr_b');
  assert.deepEqual((await h.call('getHome', { targetUserId: 'usr_a' })).data, result.data);
  assert.equal(JSON.stringify(result).includes('identityHash'), false);
});

test('nonfriends, private homes, removed friends and unavailable owners all fail closed', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_c');
  assert.equal((await h.call('getHome', { targetUserId: 'usr_a' })).code, 'HOME_UNAVAILABLE');
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v1' })).code,
    'HOME_UNAVAILABLE',
  );
  h.setCurrent('usr_a');
  await h.publish('private', 1);
  h.setCurrent('usr_b');
  assert.equal((await h.call('getHome', { targetUserId: 'usr_a' })).code, 'HOME_UNAVAILABLE');
  h.setCurrent('usr_a');
  await h.publish('friends', 2);
  h.setCurrent('usr_b');
  h.revoke();
  assert.equal((await h.call('getHome', { targetUserId: 'usr_a' })).code, 'HOME_UNAVAILABLE');
  assert.equal(h.visits().length, 0);
});

test('simultaneous first publishes conflict instead of creating or overwriting a second home', async () => {
  const h = harness();
  const results = await Promise.all([h.publish(), h.publish()]);
  assert.equal(results.filter((result) => result.ok).length, 1);
  assert.equal(results.find((result) => !result.ok).code, 'REVISION_CONFLICT');
  assert.equal(h.database.collections.get('companion_homes').size, 1);
  assert.equal((await h.publish('friends', 0)).code, 'REVISION_CONFLICT');
  assert.equal((await h.publish('private', 1)).data.revision, 2);
});

test('rejects unknown or malformed snapshot data including Unicode limits and duplicate placements', async () => {
  const h = harness();
  const bad = [
    { ...snapshot, wallet: 10 },
    { ...snapshot, diary: { text: 'private' } },
    { ...snapshot, name: '😀'.repeat(17) },
    { ...snapshot, skinId: 'unknown' },
    { ...snapshot, accessoryId: 'unknown' },
    { ...snapshot, theme: 'unknown' },
    {
      ...snapshot,
      placements: Array.from({ length: 41 }, (_, i) => ({
        ...snapshot.placements[0],
        id: `p_${i}`,
      })),
    },
    { ...snapshot, placements: [snapshot.placements[0], snapshot.placements[0]] },
    { ...snapshot, placements: [{ ...snapshot.placements[0], x: NaN }] },
    { ...snapshot, placements: [{ ...snapshot.placements[0], y: 1.1 }] },
    { ...snapshot, placements: [{ ...snapshot.placements[0], rotation: 45 }] },
    { ...snapshot, placements: [{ ...snapshot.placements[0], itemId: 'unknown' }] },
  ];
  for (const value of bad)
    assert.equal((await h.publish('friends', 0, value)).code, 'INVALID_INPUT');
  assert.equal((await h.publish('friends', 0, { ...snapshot, name: '😀'.repeat(16) })).ok, true);
});

test('name moderation uses only trusted context and denial or outage never writes', async () => {
  const h = harness();
  const checks = [];
  h.setModeration(async (input) => {
    checks.push(input);
    return { result: { suggest: 'risky' } };
  });
  assert.equal((await h.publish()).code, 'CONTENT_REJECTED');
  assert.deepEqual(checks, [{ content: '豆芽', openid: 'usr_a', scene: 1 }]);
  h.setModeration(async () => {
    throw new Error('private provider detail');
  });
  const error = await h.publish();
  assert.equal(error.code, 'MODERATION_UNAVAILABLE');
  assert.equal(JSON.stringify(error).includes('private provider detail'), false);
  h.setModeration(async () => ({ result: { suggest: 'unknown' } }));
  assert.equal((await h.publish()).code, 'MODERATION_UNAVAILABLE');
  assert.equal(h.database.collections.get('companion_homes')?.size ?? 0, 0);
});

test('visit retries and same-day visits do not increase the count, while new Beijing days do', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  assert.deepEqual((await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v1' })).data, {
    visited: true,
    duplicate: false,
  });
  assert.deepEqual((await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v1' })).data, {
    visited: true,
    duplicate: true,
  });
  assert.deepEqual((await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v2' })).data, {
    visited: true,
    duplicate: true,
  });
  h.setNow('2026-10-25T16:00:00.000Z');
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v1' })).data.duplicate,
    true,
  );
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v3' })).data.duplicate,
    false,
  );
  h.setCurrent('usr_a');
  const list = (await h.call('listVisits')).data;
  assert.equal(list.visitorCount, 2);
  assert.equal(list.visits.length, 2);
  assert.deepEqual(list.visits[0].visitor, { userId: 'usr_b', displayName: 'B' });
  assert.equal(list.visits[0].message, '');
});

test('limits messages to three per visitor/day and retries remain idempotent at the limit', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  for (let i = 1; i <= 3; i++) {
    assert.equal(
      (
        await h.call('visitHome', {
          targetUserId: 'usr_a',
          requestId: `m${i}`,
          message: `留言${i}`,
        })
      ).ok,
      true,
    );
  }
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm3', message: '留言3' })).data
      .duplicate,
    true,
  );
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm3', message: '改写' })).code,
    'REQUEST_CONFLICT',
  );
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm4', message: '第四条' })).code,
    'RATE_LIMITED',
  );
  assert.equal(
    (
      await h.call('visitHome', {
        targetUserId: 'usr_a',
        requestId: 'long',
        message: '😀'.repeat(81),
      })
    ).code,
    'INVALID_INPUT',
  );
  h.setCurrent('usr_a');
  const list = (await h.call('listVisits')).data;
  assert.equal(list.visitorCount, 1);
  assert.equal(list.visits.length, 3);
});

test('message moderation fails closed and rechecks relation and visibility after moderation', async () => {
  for (const revoke of ['friend', 'visibility', 'owner', 'actor']) {
    const h = harness();
    await h.publish();
    h.setCurrent('usr_b');
    h.setModeration(async (input) => {
      assert.deepEqual(input, { content: '你好', openid: 'usr_b', scene: 2 });
      if (revoke === 'friend') h.revoke();
      if (revoke === 'visibility')
        h.database.collections.get('companion_homes').get(homeId('usr_a')).visibility = 'private';
      if (revoke === 'owner') h.database.collections.get('users').get('usr_a').status = 'deleted';
      if (revoke === 'actor') h.database.collections.get('users').get('usr_b').status = 'deleted';
      return { result: { suggest: 'pass' } };
    });
    const response = await h.call('visitHome', {
      targetUserId: 'usr_a',
      requestId: 'm1',
      message: '你好',
    });
    assert.equal(response.code, revoke === 'actor' ? 'PROFILE_REQUIRED' : 'HOME_UNAVAILABLE');
    assert.equal(h.visits().length, 0);
  }
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  for (const result of [{ result: { suggest: 'risky' } }, {}, null]) {
    h.setModeration(async () => result);
    assert.equal(
      (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm1', message: '你好' })).ok,
      false,
    );
    assert.equal(h.visits().length, 0);
  }
});

test('daily rate writes and relationship/home write fences are committed in the same transaction', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  h.database.failNextWriteOfKind('receipt');
  const failed = await h.call('visitHome', {
    targetUserId: 'usr_a',
    requestId: 'm1',
    message: '你好',
  });
  assert.equal(failed.code, 'INTERNAL_ERROR');
  assert.equal(h.visits().length, 0);
  assert.equal(
    h.database.collections.get('friendships').get('friendship_ab').companionWriteFence,
    undefined,
  );
  assert.equal(
    h.database.collections.get('companion_homes').get(homeId('usr_a')).writeFence,
    undefined,
  );
  assert.equal(h.database.collections.get('companion_homes').has(homeId('usr_b')), false);
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm1', message: '你好' })).ok,
    true,
  );
  assert.equal(
    typeof h.database.collections.get('friendships').get('friendship_ab').companionWriteFence,
    'string',
  );
  assert.equal(
    typeof h.database.collections.get('companion_homes').get(homeId('usr_a')).writeFence,
    'string',
  );
});

test('removed friendship hides both content and counts, and even a replay remains forbidden', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm1', message: '你好' });
  h.revoke();
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm1', message: '你好' })).code,
    'HOME_UNAVAILABLE',
  );
  h.setCurrent('usr_a');
  assert.deepEqual((await h.call('listVisits')).data, { visits: [], visitorCount: 0 });
  h.database.collections.get('friendships').get('friendship_ab').status = 'active';
  h.database.collections.get('friendships').get('friendship_ab').relationshipId =
    'relationship_new';
  assert.deepEqual((await h.call('listVisits')).data, { visits: [], visitorCount: 0 });
});

test('only an owner or writer deletes entries, without exposing existence, even after removal', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'm1', message: '你好' });
  const entry = h.visits().find((item) => item.kind === 'entry');
  h.setCurrent('usr_c');
  assert.deepEqual((await h.call('deleteVisit', { id: entry._id })).data, { deleted: true });
  assert.equal(
    h.visits().some((item) => item._id === entry._id),
    true,
  );
  h.revoke();
  h.setCurrent('usr_b');
  assert.deepEqual((await h.call('deleteVisit', { id: entry._id })).data, { deleted: true });
  assert.equal(
    h.visits().some((item) => item._id === entry._id),
    false,
  );
  assert.deepEqual((await h.call('deleteVisit', { id: entry._id })).data, { deleted: true });
});

test('clears every received/authored record in bounded batches while preserving other accounts', async () => {
  const h = harness();
  await h.publish();
  const visits = new Map();
  for (let i = 0; i < 327; i++) {
    visits.set(`entry_${i}`, {
      _id: `entry_${i}`,
      kind: i % 2 ? 'entry' : 'receipt',
      ownerUserId: i % 2 ? 'usr_a' : 'usr_b',
      visitorUserId: i % 2 ? 'usr_b' : 'usr_a',
    });
  }
  visits.set('unrelated', {
    _id: 'unrelated',
    kind: 'entry',
    ownerUserId: 'usr_b',
    visitorUserId: 'usr_c',
  });
  h.database.collections.set('companion_visits', visits);
  assert.deepEqual((await h.call('deleteMyData')).data, { deleted: true });
  assert.equal(h.database.collections.get('companion_homes').has(homeId('usr_a')), false);
  assert.deepEqual([...h.database.collections.get('companion_visits').keys()], ['unrelated']);
  assert.equal(
    h.database.queryLimits.every((limit) => limit <= 100),
    true,
  );
  assert.equal(h.database.transactionCount > 5, true);
  assert.equal((await h.publish()).data.revision, 1);
});

test('returned SDK read failures are errors rather than empty successful homes', async () => {
  const h = harness();
  h.database.failNextReadOf('companion_homes', homeId('usr_a'));
  const result = await h.call('getMine');
  assert.equal(result.code, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(result).includes('private provider failure'), false);
});

test('returned SDK write failures roll back visits instead of acknowledging partial success', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  h.database.failNextReturnedWriteOfKind('receipt');
  const result = await h.call('visitHome', {
    targetUserId: 'usr_a',
    requestId: 'v1',
    message: '你好',
  });
  assert.equal(result.code, 'INTERNAL_ERROR');
  assert.equal(h.visits().length, 0);
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v1', message: '你好' })).ok,
    true,
  );
});

test('concurrent messages cannot exceed the daily budget', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  const results = await Promise.all(
    Array.from({ length: 7 }, (_, i) =>
      h.call('visitHome', { targetUserId: 'usr_a', requestId: `race_${i}`, message: `留言${i}` }),
    ),
  );
  assert.equal(results.filter((result) => result.ok).length, 3);
  assert.equal(results.filter((result) => result.code === 'RATE_LIMITED').length, 4);
  h.setCurrent('usr_a');
  assert.equal((await h.call('listVisits')).data.visits.length, 3);
});

test('failed complete deletion stays closed and can be safely retried to completion', async () => {
  const h = harness();
  await h.publish();
  h.setCurrent('usr_b');
  await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v1', message: '你好' });
  h.setCurrent('usr_a');
  h.database.failNextRemove();
  assert.equal((await h.call('deleteMyData')).code, 'INTERNAL_ERROR');
  assert.deepEqual((await h.call('getMine')).data, { home: null, userId: 'usr_a' });
  assert.equal((await h.publish('friends', 1)).code, 'DATA_DELETION_IN_PROGRESS');
  h.setCurrent('usr_b');
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'v2' })).code,
    'HOME_UNAVAILABLE',
  );
  h.setCurrent('usr_a');
  assert.equal((await h.call('deleteMyData')).ok, true);
  assert.equal(h.visits().length, 0);
  assert.equal((await h.publish()).ok, true);
});

test('the home owner can remove a former friend message without active friendship', async () => {
  const h = harness();
  const published = await h.publish();
  assert.equal(published.ok, true);
  h.setCurrent('usr_b');
  assert.equal(
    (await h.call('visitHome', { targetUserId: 'usr_a', requestId: 'owner_del', message: '你好' }))
      .ok,
    true,
  );
  const entry = h.visits().find((item) => item.kind === 'entry');
  h.revoke();
  h.setCurrent('usr_a');
  assert.deepEqual((await h.call('deleteVisit', { id: entry._id })).data, { deleted: true });
  assert.equal(
    h.visits().some((row) => row._id === entry._id),
    false,
  );
});

test('an already moderated unchanged home can be closed during moderation outage without opening a bypass', async () => {
  const h = harness();
  const first = await h.publish();
  assert.equal(first.ok, true);
  let checks = 0;
  h.setModeration(async () => {
    checks += 1;
    throw new Error('unavailable');
  });
  const closed = await h.publish('private', first.data.revision, first.data.snapshot);
  assert.equal(closed.ok, true);
  assert.equal(closed.data.visibility, 'private');
  assert.equal(closed.data.revision, 2);
  assert.equal(checks, 0);
  h.setCurrent('usr_b');
  assert.equal((await h.call('getHome', { targetUserId: 'usr_a' })).code, 'HOME_UNAVAILABLE');
  h.setCurrent('usr_a');
  assert.equal((await h.publish('friends', 2)).code, 'MODERATION_UNAVAILABLE');
  assert.equal(
    (await h.publish('private', 2, { ...snapshot, name: '另一个名字' })).code,
    'MODERATION_UNAVAILABLE',
  );
  assert.equal(
    (await h.publish('private', 2, { ...snapshot, theme: 'dusk' })).code,
    'MODERATION_UNAVAILABLE',
  );
  assert.equal((await h.publish('private', 1)).code, 'REVISION_CONFLICT');
  const mine = await h.call('getMine');
  assert.equal(mine.data.home.revision, 2);
  assert.equal(mine.data.home.visibility, 'private');
});

test('a new private home still needs moderation and cannot seed an unmoderated reopening', async () => {
  const h = harness();
  h.setModeration(async () => {
    throw new Error('unavailable');
  });
  assert.equal((await h.publish('private')).code, 'MODERATION_UNAVAILABLE');
  assert.equal((await h.call('getMine')).data.home, null);
});

test('new SDU furnishing IDs publish and read through the same existing friend permission gates', async () => {
  const h = harness();
  const ids = [
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
  const expanded = {
    ...snapshot,
    placements: ids.map((itemId, n) => ({
      id: 'expanded_' + n,
      itemId,
      x: 0.5,
      y: 0.6,
      rotation: 90,
    })),
  };
  const result = await h.call('publishHome', {
    snapshot: expanded,
    visibility: 'friends',
    expectedRevision: 0,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  h.setCurrent('usr_b');
  const home = await h.call('getHome', { targetUserId: 'usr_a' });
  assert.equal(home.ok, true);
  assert.deepEqual(
    home.data.snapshot.placements.map((p) => p.itemId),
    ids,
  );
  h.setCurrent('usr_c');
  assert.equal((await h.call('getHome', { targetUserId: 'usr_a' })).ok, false);
});
