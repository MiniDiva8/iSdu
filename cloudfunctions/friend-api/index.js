'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');

const { createFriendHandler } = require('./lib/friend-handler');
const { createCloudFriendStore } = require('./lib/cloud-friend-store');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const database = cloud.database();

const handler = createFriendHandler({
  getTrustedContext: () => cloud.getWXContext(),
  hash: (value) => crypto.createHash('sha256').update(value).digest('hex'),
  newId: (prefix) => `${prefix}_${crypto.randomBytes(16).toString('hex')}`,
  newRequestId: () => `req_${crypto.randomBytes(12).toString('hex')}`,
  newToken: () => crypto.randomBytes(32).toString('base64url'),
  now: () => new Date().toISOString(),
  store: createCloudFriendStore(database),
});

exports.main = (event, context) => handler(event, context);
