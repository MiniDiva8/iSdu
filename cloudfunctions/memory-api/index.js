'use strict';

const crypto = require('node:crypto');
const cloud = require('wx-server-sdk');

const { createMemoryHandler } = require('./lib/memory-handler');
const { createCloudMemoryStore } = require('./lib/cloud-memory-store');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const database = cloud.database();
const store = createCloudMemoryStore(database);

const handler = createMemoryHandler({
  deleteFiles: async (fileIds) => {
    if (fileIds.length > 0) {
      await cloud.deleteFile({ fileList: fileIds });
    }
  },
  getTempUrls: async (fileIds) => {
    if (fileIds.length === 0) {
      return [];
    }
    const result = await cloud.getTempFileURL({ fileList: fileIds });
    return result.fileList.map((item) => item.tempFileURL || '');
  },
  getTrustedContext: () => cloud.getWXContext(),
  hash: (value) => crypto.createHash('sha256').update(value).digest('hex'),
  newId: (prefix) => `${prefix}_${crypto.randomBytes(16).toString('hex')}`,
  newRequestId: () => `req_${crypto.randomBytes(12).toString('hex')}`,
  now: () => new Date().toISOString(),
  store,
});

exports.main = (event, context) => handler(event, context);
