'use strict';
const crypto = require('node:crypto');
const process = require('node:process');
const cloud = require('wx-server-sdk');
const { createHandler } = require('./lib/handler');
const { createCloudStore } = require('./lib/cloud-store');
const { createOpenAIClient } = require('./lib/openai-client');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const handler = createHandler({
  getTrustedContext: () => cloud.getWXContext(),
  hash: (value) => crypto.createHash('sha256').update(value).digest('hex'),
  newRequestId: () => 'req_' + crypto.randomBytes(16).toString('hex'),
  now: () => new Date().toISOString(),
  enabled: () => process.env.PAL_AI_ENABLED === 'true',
  provider: createOpenAIClient({ apiKey: process.env.OPENAI_API_KEY || '' }),
  store: createCloudStore(cloud.database({ throwOnNotFound: false })),
  moderate: ({ content, openid, scene }) =>
    cloud.openapi.security.msgSecCheck({ content, openid, version: 2, scene }),
});
exports.main = (event) => handler(event);
