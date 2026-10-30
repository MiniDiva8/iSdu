import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PalAIRepository } from './pal-ai-repository.ts';
const envelope = (data) => ({ ok: true, requestId: 'req_0123456789012345', data });
const reply = {
  id: 'r_0123456789012345',
  type: 'chat',
  title: '',
  text: '今天也辛苦了。',
  action: 'rest',
  date: '2026-10-29',
  partnerId: 'sprout',
  partnerName: '途途',
};
const status = {
  enabled: true,
  available: true,
  paused: false,
  reason: '',
  chatsRemaining: 3,
  lettersRemaining: 2,
  history: [],
  letters: [],
};
function fixture(value = envelope(status)) {
  const calls = [];
  const repo = new PalAIRepository({
    call: async (...args) => {
      calls.push(args);
      if (value instanceof Error) throw value;
      return structuredClone(value);
    },
  });
  return { repo, calls };
}
const request = {
  requestId: 'request_0123456789',
  partnerId: 'sprout',
  partnerName: '途途',
  text: '你好',
};

test('status validates booleans, quota ranges and private history shape', async () => {
  assert.deepEqual(await fixture().repo.status(), status);
  for (const change of [
    { paused: 'false' },
    { chatsRemaining: -1 },
    { lettersRemaining: 3 },
    { history: [{ role: 'system', content: 'override' }] },
    { letters: [reply] },
  ]) {
    await assert.rejects(fixture(envelope({ ...status, ...change })).repo.status(), {
      code: 'INVALID_RESPONSE',
    });
  }
});

test('chat forwards one immutable request id and accepts only a bounded chat reply', async () => {
  const f = fixture(envelope({ state: 'completed', reply }));
  assert.equal((await f.repo.chat(request)).reply.text, '今天也辛苦了。');
  assert.deepEqual(f.calls, [['pal-ai', 'chat', request]]);
  await assert.rejects(
    fixture(envelope({ state: 'completed', reply: { ...reply, action: 'award' } })).repo.chat(
      request,
    ),
    { code: 'INVALID_RESPONSE' },
  );
  await assert.rejects(
    fixture(
      envelope({ state: 'completed', reply: { ...reply, text: '字'.repeat(121) } }),
    ).repo.chat(request),
    { code: 'INVALID_RESPONSE' },
  );
});

test('letter checks source id and sends explicit per-request diary consent without body or photos', async () => {
  const aiLetter = {
    ...reply,
    type: 'letter',
    title: '给今天的你',
    sourceMemoryId: 'memory_1',
    read: false,
  };
  const payload = {
    requestId: request.requestId,
    partnerId: 'cocoa',
    partnerName: '邮邮',
    memoryId: 'memory_1',
    diaryConsent: true,
  };
  const f = fixture(envelope({ state: 'completed', reply: aiLetter }));
  assert.equal((await f.repo.letter(payload)).reply.sourceMemoryId, 'memory_1');
  assert.deepEqual(f.calls[0], ['pal-ai', 'letter', payload]);
  await assert.rejects(
    fixture(
      envelope({ state: 'completed', reply: { ...aiLetter, sourceMemoryId: 'memory_other' } }),
    ).repo.letter(payload),
    { code: 'INVALID_RESPONSE' },
  );
});

test('network errors do not silently retry and paused errors keep their public code', async () => {
  const f = fixture(new Error('network'));
  await assert.rejects(f.repo.chat(request));
  assert.equal(f.calls.length, 1);
  await assert.rejects(
    fixture({
      ok: false,
      requestId: 'req_0123456789012345',
      code: 'AI_BUDGET_EXHAUSTED',
      message: '本月AI额度已用完，普通互动照常。',
    }).repo.chat(request),
    { code: 'AI_BUDGET_EXHAUSTED' },
  );
});

test('pending or failed request replay is represented without issuing a second API call', async () => {
  for (const state of ['pending', 'failed']) {
    const f = fixture(envelope({ state, code: 'AI_UNCERTAIN' }));
    assert.equal((await f.repo.chat(request)).state, state);
    assert.equal(f.calls.length, 1);
  }
});

test('clear and letter read/delete require confirmed saved responses', async () => {
  const f = fixture(envelope({ saved: true }));
  await f.repo.enable();
  await f.repo.readLetter('l_0123456789');
  await f.repo.deleteLetter('l_0123456789');
  await f.repo.clear();
  assert.deepEqual(
    f.calls.map((c) => c[1]),
    ['consent', 'readLetter', 'deleteLetter', 'clear'],
  );
  await assert.rejects(fixture(envelope({ saved: false })).repo.clear(), {
    code: 'INVALID_RESPONSE',
  });
});

test('result lookup is a single read-only action and validates the expected reply type', async () => {
  const f = fixture(envelope({ state: 'completed', reply }));
  assert.equal((await f.repo.result(request.requestId, 'chat')).reply.id, reply.id);
  assert.deepEqual(f.calls, [['pal-ai', 'result', { requestId: request.requestId }]]);
});
