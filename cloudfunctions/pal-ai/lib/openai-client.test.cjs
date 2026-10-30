'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createOpenAIClient } = require('./openai-client');
const { buildPrompt, parseGeneration } = require('./policy');
const prompt = () =>
  buildPrompt(
    'chat',
    parseGeneration('chat', { requestId: 'request_0123456789', partnerId: 'sprout', text: '你好' }),
  );

test('counts and generates with pinned non-reasoning Responses requests and no stored session', async () => {
  const calls = [];
  const client = createOpenAIClient({
    apiKey: 'test-only',
    post: async (path, body) => {
      calls.push({ path, body });
      if (path === 'responses/input_tokens')
        return { object: 'response.input_tokens', input_tokens: 800 };
      return {
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [
              { type: 'output_text', text: '{"title":"","text":"你好呀","action":"happy"}' },
            ],
          },
        ],
        usage: { input_tokens: 800, output_tokens: 40 },
      };
    },
  });
  assert.equal(await client.count(prompt()), 800);
  const output = await client.generate(prompt());
  assert.equal(output.raw, '{"title":"","text":"你好呀","action":"happy"}');
  assert.deepEqual(output.usage, { input_tokens: 800, output_tokens: 40 });
  assert.deepEqual(
    calls.map((c) => c.path),
    ['responses/input_tokens', 'responses'],
  );
  assert.equal(calls[0].body.text.format.type, 'json_schema');
  assert.equal(calls[1].body.store, false);
  assert.equal(calls[1].body.reasoning.effort, 'none');
  assert.equal(calls[1].body.max_output_tokens, 192);
});

test('missing credentials never call the transport', async () => {
  let calls = 0;
  const client = createOpenAIClient({
    apiKey: '',
    post: async () => {
      calls++;
    },
  });
  assert.equal(client.configured, false);
  await assert.rejects(client.count(prompt()), { code: 'AI_NOT_CONFIGURED' });
  assert.equal(calls, 0);
});

test('oversized or invalid token count refuses generation', async () => {
  for (const input_tokens of [4097, -1, 0, 0.2, undefined]) {
    const client = createOpenAIClient({
      apiKey: 'test-only',
      post: async () => ({ object: 'response.input_tokens', input_tokens }),
    });
    await assert.rejects(client.count(prompt()), { code: 'AI_INPUT_TOO_LARGE' });
  }
});

test('transport failure never retries or reveals raw upstream details', async () => {
  let calls = 0;
  const client = createOpenAIClient({
    apiKey: 'test-only',
    post: async () => {
      calls++;
      throw new Error('private upstream header and diary');
    },
  });
  await assert.rejects(
    client.generate(prompt()),
    (e) => e.code === 'AI_UNAVAILABLE' && !e.message.includes('private'),
  );
  assert.equal(calls, 1);
});

test('refusal and incomplete generation preserve usage for budget settlement', async () => {
  for (const response of [
    { status: 'incomplete', output: [], usage: { input_tokens: 800, output_tokens: 192 } },
    {
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'private refusal' }] }],
      usage: { input_tokens: 800, output_tokens: 40 },
    },
  ]) {
    const client = createOpenAIClient({ apiKey: 'test-only', post: async () => response });
    await assert.rejects(
      client.generate(prompt()),
      (e) =>
        e.code === 'AI_RESPONSE_INVALID' &&
        e.usage.input_tokens === 800 &&
        !e.message.includes('private'),
    );
  }
});
