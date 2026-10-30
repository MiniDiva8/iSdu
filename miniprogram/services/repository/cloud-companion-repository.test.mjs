import assert from 'node:assert/strict';
import test from 'node:test';
import { CloudCompanionRepository } from './cloud-companion-repository.ts';

const snapshot = {
  name: '豆芽',
  skinId: 'sprout',
  accessoryId: 'none',
  theme: 'meadow',
  placements: [],
};
const home = {
  snapshot,
  visibility: 'friends',
  revision: 1,
  updatedAt: '2026-10-26T00:00:00.000Z',
  owner: { userId: 'usr_a', displayName: 'A' },
};
const envelope = (data) => ({ ok: true, requestId: 'req_test', data });

test('publication acknowledgement must confirm the requested visibility before reporting success', async () => {
  const repo = new CloudCompanionRepository({
    async call() {
      return envelope({ ...home, visibility: 'private' });
    },
  });
  await assert.rejects(
    repo.publishHome(snapshot, 'friends', 0),
    (error) => error.code === 'INVALID_RESPONSE',
  );
});

test('uses companion-api and sends only validated public fields', async () => {
  const calls = [];
  const repo = new CloudCompanionRepository({
    async call(functionName, action, payload) {
      calls.push({ functionName, action, payload });
      return envelope(home);
    },
  });
  assert.deepEqual(await repo.publishHome({ ...snapshot, wallet: 30 }, 'friends', 0), home);
  assert.deepEqual(calls, [
    {
      functionName: 'companion-api',
      action: 'publishHome',
      payload: { snapshot, visibility: 'friends', expectedRevision: 0 },
    },
  ]);
});

test('strips server extras while validating complete home/visit response contracts', async () => {
  const responses = [
    envelope({
      home: { ...home, privateSettings: {}, snapshot: { ...snapshot, wallet: 40 } },
      userId: 'usr_a',
      OPENID: 'private',
    }),
    envelope({
      visits: [
        {
          id: 'entry_1',
          visitor: { userId: 'usr_b', displayName: 'B', identityHash: 'private' },
          message: '你好',
          visitedAt: home.updatedAt,
          diary: 'private',
        },
      ],
      visitorCount: 1,
    }),
    envelope({ visited: true, duplicate: false, ownerUserId: 'private' }),
    envelope({ deleted: true }),
    envelope({ deleted: true }),
  ];
  const calls = [];
  const repo = new CloudCompanionRepository({
    async call(name, action, payload) {
      calls.push({ name, action, payload });
      return responses.shift();
    },
  });
  assert.deepEqual(await repo.getMine(), { home, userId: 'usr_a' });
  assert.deepEqual(await repo.listVisits(), {
    visits: [
      {
        id: 'entry_1',
        visitor: { userId: 'usr_b', displayName: 'B' },
        message: '你好',
        visitedAt: home.updatedAt,
      },
    ],
    visitorCount: 1,
  });
  assert.deepEqual(await repo.visitHome('usr_a', 'visit_1', '你好'), {
    visited: true,
    duplicate: false,
  });
  assert.equal(await repo.deleteVisit('entry_1'), undefined);
  assert.equal(await repo.deleteMyData(), undefined);
  assert.equal(
    calls.every((item) => item.name === 'companion-api'),
    true,
  );
});

test('rejects malformed envelope, counts, snapshot, timestamp and deletion acknowledgements', async () => {
  const bad = [
    [undefined, (repo) => repo.getMine()],
    [{ ok: true, data: { home, userId: 'usr_a' } }, (repo) => repo.getMine()],
    [envelope({ home: null }), (repo) => repo.getMine()],
    [envelope({ ...home, revision: -1 }), (repo) => repo.getHome('usr_a')],
    [envelope({ ...home, updatedAt: 'yesterday' }), (repo) => repo.getHome('usr_a')],
    [
      envelope({ ...home, snapshot: { ...snapshot, theme: 'unknown' } }),
      (repo) => repo.getHome('usr_a'),
    ],
    [
      envelope({ ...home, snapshot: { ...snapshot, name: '😀'.repeat(17) } }),
      (repo) => repo.getHome('usr_a'),
    ],
    [envelope({ visits: [], visitorCount: -1 }), (repo) => repo.listVisits()],
    [
      envelope({
        visits: [
          {
            id: 'entry_1',
            visitor: home.owner,
            message: 'a'.repeat(81),
            visitedAt: home.updatedAt,
          },
        ],
        visitorCount: 1,
      }),
      (repo) => repo.listVisits(),
    ],
    [envelope({ visited: true, duplicate: 'false' }), (repo) => repo.visitHome('usr_a', 'v1')],
    [envelope({ deleted: false }), (repo) => repo.deleteVisit('entry_1')],
    [envelope({}), (repo) => repo.deleteMyData()],
  ];
  for (const [response, run] of bad) {
    const repo = new CloudCompanionRepository({
      async call() {
        return response;
      },
    });
    await assert.rejects(
      () => run(repo),
      (error) => error.code === 'INVALID_RESPONSE',
    );
  }
});

test('preserves typed revision/authorization failures and never masks transport failure', async () => {
  const repo = new CloudCompanionRepository({
    async call() {
      return {
        ok: false,
        code: 'REVISION_CONFLICT',
        message: '家园已更新',
        requestId: 'req_conflict',
      };
    },
  });
  await assert.rejects(
    () => repo.publishHome(snapshot, 'private', 1),
    (error) => error.code === 'REVISION_CONFLICT' && error.requestId === 'req_conflict',
  );
  const transport = new CloudCompanionRepository({
    async call() {
      throw new Error('offline');
    },
  });
  await assert.rejects(() => transport.getMine(), /offline/u);
});

test('rejects invalid outgoing shapes before making a network request', async () => {
  let calls = 0;
  const repo = new CloudCompanionRepository({
    async call() {
      calls += 1;
      return envelope(home);
    },
  });
  for (const run of [
    () =>
      repo.publishHome(
        { ...snapshot, placements: [{ id: 'x', itemId: 'bench', x: Infinity, y: 0, rotation: 0 }] },
        'friends',
        0,
      ),
    () => repo.publishHome(snapshot, 'public', 0),
    () => repo.publishHome(snapshot, 'private', -1),
    () => repo.visitHome('usr_a', 'v1', '😀'.repeat(81)),
  ])
    await assert.rejects(run, (error) => error.code === 'INVALID_INPUT');
  assert.equal(calls, 0);
});
