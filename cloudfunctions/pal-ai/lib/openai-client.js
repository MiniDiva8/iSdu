'use strict';
const https = require('node:https');
const { Buffer } = require('node:buffer');
const { setTimeout, clearTimeout } = require('node:timers');
const { PalAIError, POLICY, record } = require('./policy');

function unavailable() {
  return new PalAIError('AI_UNAVAILABLE', '伙伴暂时没连上，请稍后再来，普通互动照常。');
}
function postJSON(path, body, apiKey, options = {}) {
  if (!['responses', 'responses/input_tokens'].includes(path)) return Promise.reject(unavailable());
  const payload = JSON.stringify(body);
  if (Buffer.byteLength(payload) > 20_000) return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    let done = false;
    let request;
    const finish = (error, result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      finish(unavailable());
      request?.destroy();
    }, options.timeoutMs || 18_000);
    try {
      request = (options.request || https.request)(
        {
          protocol: 'https:',
          hostname: 'api.openai.com',
          port: 443,
          path: '/v1/' + path,
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + apiKey,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (response) => {
          const chunks = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += Buffer.byteLength(chunk);
            if (size > (options.maxBytes || 32_768)) {
              finish(unavailable());
              request.destroy();
              return;
            }
            chunks.push(chunk);
          });
          response.on('error', () => finish(unavailable()));
          response.on('end', () => {
            if (done) return;
            if (response.statusCode < 200 || response.statusCode >= 300) {
              finish(unavailable());
              return;
            }
            try {
              finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              finish(unavailable());
            }
          });
        },
      );
      request.on('error', () => finish(unavailable()));
      request.end(payload);
    } catch {
      finish(unavailable());
      request?.destroy();
    }
  });
}
function createOpenAIClient({ apiKey = '', post = postJSON } = {}) {
  const configured = typeof apiKey === 'string' && Boolean(apiKey.trim());
  async function send(path, body) {
    if (!configured) throw new PalAIError('AI_NOT_CONFIGURED', 'AI交流还没有开通，普通互动照常。');
    try {
      return await post(path, body, apiKey);
    } catch {
      throw unavailable();
    }
  }
  return {
    configured,
    async count(prompt) {
      const { model, instructions, input, text, reasoning } = prompt;
      const data = await send('responses/input_tokens', {
        model,
        instructions,
        input,
        text,
        reasoning,
      });
      if (
        !record(data) ||
        data.object !== 'response.input_tokens' ||
        !Number.isSafeInteger(data.input_tokens) ||
        data.input_tokens < 1 ||
        data.input_tokens > POLICY.inputMaxTokens
      ) {
        throw new PalAIError('AI_INPUT_TOO_LARGE', '这次内容有点长，换一句短一点的话吧。');
      }
      return data.input_tokens;
    },
    async generate(prompt) {
      const data = await send('responses', prompt);
      const invalid = () => {
        const error = new PalAIError('AI_RESPONSE_INVALID', '伙伴的话还没整理好，请稍后再来。');
        error.usage = data?.usage;
        throw error;
      };
      if (!record(data) || data.status !== 'completed' || !Array.isArray(data.output)) invalid();
      const parts = [];
      for (const item of data.output) {
        if (item.type !== 'message') continue;
        if (!Array.isArray(item.content)) invalid();
        for (const part of item.content) {
          if (part.type !== 'output_text' || typeof part.text !== 'string') invalid();
          parts.push(part.text);
        }
      }
      if (parts.length !== 1 || !parts[0].trim()) invalid();
      return { raw: parts[0], usage: data.usage };
    },
  };
}
module.exports = { createOpenAIClient, postJSON };
