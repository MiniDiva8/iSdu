'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');

const { createAuthHandler } = require('./lib/auth-handler');
const { createCloudUserStore } = require('./lib/cloud-user-store');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const database = cloud.database();
const handler = createAuthHandler({
  deleteFiles: (fileList) => cloud.deleteFile({ fileList }),
  getTrustedContext: () => cloud.getWXContext(),
  hashIdentity: (appId, openId) =>
    crypto.createHash('sha256').update(appId).update('\0').update(openId).digest('hex'),
  newRequestId: () => `req_${crypto.randomBytes(12).toString('hex')}`,
  newUserId: () => `usr_${crypto.randomBytes(16).toString('hex')}`,
  now: () => new Date().toISOString(),
  userStore: createCloudUserStore(database),
});

exports.main = (event, context) => handler(event, context);
