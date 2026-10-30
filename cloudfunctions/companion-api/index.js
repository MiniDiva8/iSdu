'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');
const { createCompanionHandler } = require('./lib/companion-handler');
const { createCloudCompanionStore } = require('./lib/cloud-companion-store');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const handler = createCompanionHandler({
  getTrustedContext: () => cloud.getWXContext(),
  hash: (value) => crypto.createHash('sha256').update(value).digest('hex'),
  newId: (prefix) => `${prefix}_${crypto.randomBytes(16).toString('hex')}`,
  newRequestId: () => `req_${crypto.randomBytes(12).toString('hex')}`,
  now: () => new Date().toISOString(),
  moderate: ({ content, openid, scene }) =>
    cloud.openapi.security.msgSecCheck({ content, openid, version: 2, scene }),
  store: createCloudCompanionStore(cloud.database({ throwOnNotFound: false })),
});

exports.main = (event) => handler(event);
