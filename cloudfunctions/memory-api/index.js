'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');

const { createMemoryHandler } = require('./lib/memory-handler');
const { createCloudMemoryStore } = require('./lib/cloud-memory-store');
const { createCloudStorageService } = require('./lib/cloud-storage-service');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const database = cloud.database({ throwOnNotFound: false });
const store = createCloudMemoryStore(database);

const handler = createMemoryHandler({
  ...createCloudStorageService(cloud),
  getTrustedContext: () => cloud.getWXContext(),
  hash: (value) => crypto.createHash('sha256').update(value).digest('hex'),
  newId: (prefix) => `${prefix}_${crypto.randomBytes(16).toString('hex')}`,
  newRequestId: () => `req_${crypto.randomBytes(12).toString('hex')}`,
  now: () => new Date().toISOString(),
  store,
});

exports.main = (event, context) => handler(event, context);
