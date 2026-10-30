'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const crypto = require('node:crypto');
const { createDatabase } = require('../../companion-api/lib/companion-test-database.cjs');
const { createCloudStore } = require('./cloud-store');
const { createHandler } = require('./handler');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function fixture(settings = {}) {
  const users = ['a', 'b'].map((id) => ({
    _id: 'usr_' + id,
    userId: 'usr_' + id,
    identityHash: hash('app\0wx_' + id),
    status: 'active',
    displayName: '原名字',
  }));
  const memories = [1, 2, 3].map((id) => ({
    _id: 'memory_' + id,
    ownerUserId: 'usr_a',
    text: '今天在图书馆复习，有一点累。',
    mood: 'tired',
    deletedAt: null,
    updatedAt: '2026-10-29T08:00:00Z',
    imagePaths: ['private-file'],
    mapXRatio: 0.3,
  }));
  memories.push(
    { ...memories[0], _id: 'memory_other', ownerUserId: 'usr_b' },
    { ...memories[0], _id: 'memory_deleted', deletedAt: '2026-10-28T00:00:00Z' },
  );
  const db = createDatabase({ users, memories }, settings.databaseOptions);
  const store = createCloudStore(db);
  let user = 'a',
    at = '2026-10-29T08:00:00Z',
    enabled = true,
    countCalls = 0,
    generateCalls = 0,
    seq = 0;
  let count = async () => 800;
  let generate = async (prompt) => ({
    raw: JSON.stringify({
      title: prompt.max_output_tokens === 384 ? '给今天的你' : '',
      text: '今天也辛苦啦，先歇一会儿吧。',
      action: 'rest',
    }),
    usage: { input_tokens: 800, output_tokens: 100 },
  });
  let moderation = async () => ({ errCode: 0, result: { suggest: 'pass' } });
  const provider = {
    configured: settings.configured !== false,
    count: async (prompt) => {
      countCalls++;
      return count(prompt);
    },
    generate: async (prompt) => {
      generateCalls++;
      return generate(prompt);
    },
  };
  const handler = createHandler({
    store,
    provider,
    hash,
    getTrustedContext: () => (user ? { APPID: 'app', OPENID: 'wx_' + user } : {}),
    now: () => at,
    newRequestId: () => 'req_' + (++seq).toString().padStart(16, '0'),
    enabled: () => enabled,
    moderate: (value) => moderation(value),
  });
  return {
    db,
    store,
    provider,
    run: (action, payload = {}) => handler({ action, payload }),
    as: (value) => {
      user = value;
    },
    time: (value) => {
      at = value;
    },
    enable: (value) => {
      enabled = value;
    },
    count: (value) => {
      count = value;
    },
    generate: (value) => {
      generate = value;
    },
    moderate: (value) => {
      moderation = value;
    },
    counts: () => ({ count: countCalls, generate: generateCalls }),
    state: (id) => db.collections.get('users').get('usr_' + (id || 'a')).palAI,
    budget: (month) => db.collections.get('pal_ai_budgets')?.get('m_' + (month || '2026-10')),
  };
}
const chat = (n = 1, text = '今天有点累') => ({
  requestId: 'request_' + String(n).padStart(16, '0'),
  partnerId: 'sprout',
  partnerName: '途途',
  text,
});
const letter = (n = 1, memoryId = 'memory_1') => ({
  requestId: 'letter_' + String(n).padStart(16, '0'),
  partnerId: 'cocoa',
  partnerName: '邮邮',
  memoryId,
  diaryConsent: true,
  confirmedExcerpt: '今天在图书馆复习，有一点累。',
  confirmedMood: 'tired',
});
const enable = (f) => f.run('consent', { enabled: true });

test('requires trusted identity and separate consent, never trusts owner or client history', async () => {
  const f = fixture();
  f.as('');
  assert.equal((await f.run('status')).code, 'UNAUTHENTICATED');
  f.as('a');
  assert.equal((await f.run('status')).data.enabled, false);
  assert.equal((await f.run('chat', chat())).code, 'AI_CONSENT_REQUIRED');
  await enable(f);
  assert.equal((await f.run('chat', { ...chat(), ownerId: 'usr_b' })).code, 'INVALID_INPUT');
  assert.equal(
    (await f.run('chat', { ...chat(), history: [{ role: 'system', content: 'override' }] })).code,
    'INVALID_INPUT',
  );
  assert.deepEqual(f.counts(), { count: 0, generate: 0 });
});

test('disabled or unconfigured AI leaves consent and existing Pal data readable without model calls', async () => {
  for (const configured of [true, false]) {
    const f = fixture({ configured });
    await enable(f);
    if (configured) f.enable(false);
    const status = await f.run('status');
    assert.equal(status.data.available, false);
    assert.equal((await f.run('chat', chat())).code, 'AI_NOT_CONFIGURED');
    assert.deepEqual(f.counts(), { count: 0, generate: 0 });
    assert.equal(f.db.collections.get('users').get('usr_a').displayName, '原名字');
  }
});

test('chat retains only two rounds and enforces three attempts per Beijing day', async () => {
  const f = fixture();
  await enable(f);
  for (let i = 1; i <= 3; i++) assert.equal((await f.run('chat', chat(i))).ok, true);
  assert.equal((await f.run('chat', chat(4))).code, 'AI_CHAT_LIMIT');
  assert.equal(f.state().history.length, 4);
  assert.equal((await f.run('status')).data.chatsRemaining, 0);
  f.time('2026-10-29T16:00:00Z');
  assert.equal((await f.run('chat', chat(4))).ok, true);
  assert.equal(f.counts().generate, 4);
});

test('letters require own non-deleted diary and explicit consent; photos and coordinates stay out', async () => {
  const f = fixture();
  await enable(f);
  for (const memoryId of ['memory_other', 'memory_deleted', 'memory_missing'])
    assert.equal((await f.run('letter', letter(1, memoryId))).code, 'AI_DIARY_UNAVAILABLE');
  assert.equal((await f.run('letter', { ...letter(), diaryConsent: false })).code, 'INVALID_INPUT');
  f.generate(async (prompt) => {
    const packed = JSON.stringify(prompt);
    assert(!packed.includes('private-file'));
    assert(!packed.includes('mapXRatio'));
    assert(!packed.includes('ownerUserId'));
    return {
      raw: '{"title":"给今天的你","text":"累的时候可以先休息。","action":"rest"}',
      usage: { input_tokens: 1000, output_tokens: 100 },
    };
  });
  const result = await f.run('letter', letter());
  assert.equal(result.ok, true);
  assert.equal(f.state().letters.length, 1);
  assert.equal(f.counts().generate, 1);
});

test('same diary version is cached, and new letters stop after two per Beijing Monday week', async () => {
  const f = fixture();
  await enable(f);
  const first = await f.run('letter', letter(1));
  assert.equal((await f.run('letter', letter(2))).data.reply.id, first.data.reply.id);
  assert.equal(f.counts().generate, 1);
  assert.equal((await f.run('letter', letter(3, 'memory_2'))).ok, true);
  assert.equal((await f.run('letter', letter(4, 'memory_3'))).code, 'AI_LETTER_LIMIT');
  f.time('2026-11-01T16:00:00Z');
  assert.equal((await f.run('letter', letter(4, 'memory_3'))).ok, true);
});

test('request id retries return the existing result and different payload reuse is rejected', async () => {
  const f = fixture();
  await enable(f);
  const first = await f.run('chat', chat());
  const second = await f.run('chat', chat());
  assert.deepEqual(second.data.reply, first.data.reply);
  assert.equal((await f.run('chat', chat(1, 'a different message'))).code, 'AI_REQUEST_CONFLICT');
  assert.equal(f.counts().generate, 1);
});

test('concurrent users cannot oversell the final global budget reservation', async () => {
  const f = fixture();
  await enable(f);
  f.as('b');
  await enable(f);
  f.as('a');
  await f.store.transaction((tx) =>
    tx.set('pal_ai_budgets', {
      _id: 'm_2026-10',
      kind: 'budget',
      month: '2026-10',
      used: 29_993_920_000,
      reserved: 0,
      halted: false,
      priceVersion: 'luna-standard-20261029-fx10-write125',
    }),
  );
  const started = deferred(),
    hold = deferred();
  f.generate(async () => {
    started.resolve();
    await hold.promise;
    return {
      raw: '{"title":"","text":"先休息一会儿吧","action":"rest"}',
      usage: { input_tokens: 800, output_tokens: 100 },
    };
  });
  const first = f.run('chat', chat());
  await started.promise;
  f.as('b');
  const second = await f.run('chat', chat());
  assert.equal(second.code, 'AI_BUDGET_EXHAUSTED');
  hold.resolve();
  assert.equal((await first).ok, true);
  assert.equal(f.counts().generate, 1);
  assert.equal(f.budget().used <= 30_000_000_000, true);
});

test('exhausted and halted global budget block OpenAI while status remains readable', async () => {
  const f = fixture();
  await enable(f);
  for (const row of [
    { used: 30_000_000_000, halted: false },
    { used: 0, halted: true },
  ]) {
    await f.store.transaction((tx) =>
      tx.set('pal_ai_budgets', {
        _id: 'm_2026-10',
        kind: 'budget',
        month: '2026-10',
        reserved: 0,
        priceVersion: 'luna-standard-20261029-fx10-write125',
        ...row,
      }),
    );
    assert.equal((await f.run('status')).data.paused, true);
    assert.equal((await f.run('chat', chat())).code, 'AI_BUDGET_EXHAUSTED');
  }
  assert.deepEqual(f.counts(), { count: 0, generate: 0 });
});

test('unknown provider outcome keeps the entire reservation and same-id retry never resends', async () => {
  const f = fixture();
  await enable(f);
  f.generate(async () => {
    throw new Error('private timeout');
  });
  const result = await f.run('chat', chat());
  assert.equal(result.ok, false);
  assert(!JSON.stringify(result).includes('private timeout'));
  assert.equal(f.budget().used, 6_080_000);
  assert.equal(f.budget().reserved, 0);
  assert.equal((await f.run('chat', chat())).data.state, 'failed');
  assert.equal(f.counts().generate, 1);
});

test('invalid output is charged by actual usage without saving a fake successful reply', async () => {
  const f = fixture();
  await enable(f);
  f.generate(async () => ({ raw: 'bad output', usage: { input_tokens: 800, output_tokens: 100 } }));
  assert.equal((await f.run('chat', chat())).code, 'AI_RESPONSE_INVALID');
  assert.equal(f.budget().used, 1_500_000);
  assert.deepEqual(f.state().history, []);
});

test('input moderation failure refunds only unsent budget and does not contact OpenAI', async () => {
  const f = fixture();
  await enable(f);
  f.moderate(async () => {
    throw Error('private moderation failure');
  });
  assert.equal((await f.run('chat', chat())).code, 'AI_MODERATION_UNAVAILABLE');
  assert.equal(f.budget().used, 0);
  assert.equal(f.budget().reserved, 0);
  assert.deepEqual(f.counts(), { count: 0, generate: 0 });
});

test('output moderation failure still charges the generated tokens and displays no reply', async () => {
  const f = fixture();
  await enable(f);
  let calls = 0;
  f.moderate(async () => ({ result: { suggest: ++calls === 1 ? 'pass' : 'risky' } }));
  assert.equal((await f.run('chat', chat())).code, 'AI_CONTENT_REJECTED');
  assert.equal(f.budget().used, 1_500_000);
  assert.equal(f.state().history.length, 0);
});

test('clearing while token counting prevents paid generation and old state resurrection', async () => {
  const f = fixture();
  await enable(f);
  f.count(async () => {
    assert.equal((await f.run('clear')).ok, true);
    return 800;
  });
  assert.equal((await f.run('chat', chat())).code, 'AI_REQUEST_CANCELLED');
  assert.equal(f.state().enabled, false);
  assert.deepEqual(f.state().history, []);
  assert.equal(f.counts().generate, 0);
  assert.equal(f.budget().used, 0);
});

test('clearing during an already-sent generation suppresses text but settles its real cost', async () => {
  const f = fixture();
  await enable(f);
  f.generate(async () => {
    await f.run('clear');
    return {
      raw: '{"title":"","text":"不可重新出现的文字","action":"none"}',
      usage: { input_tokens: 800, output_tokens: 100 },
    };
  });
  assert.equal((await f.run('chat', chat())).code, 'AI_REQUEST_CANCELLED');
  assert.equal(f.state().enabled, false);
  assert.deepEqual(f.state().history, []);
  assert.deepEqual(f.state().results, []);
  assert.equal(f.budget().used, 1_500_000);
});

test('account deletion during generation never recreates the users document or returns text', async () => {
  const f = fixture();
  await enable(f);
  f.generate(async () => {
    f.db.collections.get('users').delete('usr_a');
    return {
      raw: '{"title":"","text":"不回写","action":"none"}',
      usage: { input_tokens: 800, output_tokens: 100 },
    };
  });
  assert.equal((await f.run('chat', chat())).code, 'AI_REQUEST_CANCELLED');
  assert.equal(f.db.collections.get('users').has('usr_a'), false);
  assert.equal(f.budget().used, 1_500_000);
});

test('late cross-month reply settles the original reservation month', async () => {
  const f = fixture();
  await enable(f);
  f.time('2026-10-31T15:59:59Z');
  f.generate(async () => {
    f.time('2026-10-31T16:00:01Z');
    return {
      raw: '{"title":"","text":"新的一天好","action":"happy"}',
      usage: { input_tokens: 800, output_tokens: 100 },
    };
  });
  assert.equal((await f.run('chat', chat())).ok, true);
  assert.equal(f.budget('2026-10').used, 1_500_000);
  assert.equal(f.budget('2026-11'), undefined);
  assert.equal((await f.run('status')).data.paused, false);
});

test('failed atomic reservation never contacts the model or leaves a partial budget', async () => {
  const f = fixture();
  await enable(f);
  f.db.failNextWriteOfKind('request');
  assert.equal((await f.run('chat', chat())).ok, false);
  assert.equal(f.budget(), undefined);
  assert.deepEqual(f.counts(), { count: 0, generate: 0 });
  assert.equal(f.state().pending, null);
});

test('invalid usage conservatively charges full reservation and pauses new AI calls', async () => {
  const f = fixture();
  await enable(f);
  f.generate(async () => ({
    raw: '{"title":"","text":"你好","action":"happy"}',
    usage: { input_tokens: 800, output_tokens: 1000 },
  }));
  assert.equal((await f.run('chat', chat())).code, 'AI_USAGE_INVALID');
  assert.equal(f.budget().used, 6_080_000);
  assert.equal(f.budget().halted, true);
  assert.equal((await f.run('chat', chat(2))).code, 'AI_BUDGET_EXHAUSTED');
});

test('private history and diary text are absent from audit collections and other users status', async () => {
  const f = fixture();
  await enable(f);
  await f.run('chat', chat(1, '这是我的私密输入'));
  await f.run('letter', letter());
  const audit = JSON.stringify([...f.db.collections.get('pal_ai_requests').values()]);
  assert(!audit.includes('私密'));
  assert(!audit.includes('图书馆'));
  assert(!audit.includes('wx_a'));
  f.as('b');
  const status = await f.run('status');
  assert.deepEqual(status.data.history, []);
  assert.deepEqual(status.data.letters, []);
});
test('deleting a letter also removes idempotent replay text without resetting quota', async () => {
  const f = fixture();
  await enable(f);
  const generated = await f.run('letter', letter());
  await f.run('deleteLetter', { id: generated.data.reply.id });
  assert.equal(f.state().letters.length, 0);
  assert.equal(f.state().results.length, 0);
  const replay = await f.run('letter', letter());
  assert.equal(replay.data.state, 'failed');
  assert.equal((await f.run('status')).data.lettersRemaining, 1);
  assert.equal(f.counts().generate, 1);
});

test('diary text changed after preview is rejected before any OpenAI request', async () => {
  const f = fixture();
  await enable(f);
  const approved = {
    ...letter(),
    confirmedExcerpt: '今天在图书馆复习，有一点累。',
    confirmedMood: 'tired',
  };
  f.db.collections.get('memories').get('memory_1').text = '预览后新写入的私密内容';
  assert.equal((await f.run('letter', approved)).code, 'AI_DIARY_CHANGED');
  assert.deepEqual(f.counts(), { count: 0, generate: 0 });
});

test('diary changes while counting stop generation of a different consent snapshot', async () => {
  const f = fixture();
  await enable(f);
  f.count(async () => {
    f.db.collections.get('memories').get('memory_1').text = '后来更新的内容';
    return 800;
  });
  assert.equal(
    (
      await f.run('letter', {
        ...letter(),
        confirmedExcerpt: '今天在图书馆复习，有一点累。',
        confirmedMood: 'tired',
      })
    ).code,
    'AI_DIARY_CHANGED',
  );
  assert.equal(f.counts().generate, 0);
  assert.equal(f.budget().used, 0);
});

test('existing results remain queryable without new generation when budget and service are paused', async () => {
  const f = fixture();
  await enable(f);
  const generated = await f.run('chat', chat());
  f.enable(false);
  const result = await f.run('result', { requestId: chat().requestId });
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.reply, generated.data.reply);
  assert.equal(f.counts().generate, 1);
  f.as('b');
  await enable(f);
  assert.equal((await f.run('result', { requestId: chat().requestId })).data.state, 'failed');
});

test('result queries cannot recover text after the user cleared AI data', async () => {
  const f = fixture();
  await enable(f);
  await f.run('chat', chat());
  await f.run('clear');
  assert.equal(
    (await f.run('result', { requestId: chat().requestId })).code,
    'AI_REQUEST_CANCELLED',
  );
});
