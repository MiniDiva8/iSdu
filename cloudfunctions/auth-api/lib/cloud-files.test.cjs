'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function getOptions(deleteFile) {
  let options;
  const entry = path.join(__dirname, '../index.js');
  const localRequire = createRequire(entry);
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
    exports: {},
    require(name) {
      if (name === 'wx-server-sdk') return { init() {}, database: () => ({}), deleteFile };
      if (name === './lib/auth-handler')
        return {
          createAuthHandler(value) {
            options = value;
            return () => {};
          },
        };
      if (name === './lib/cloud-user-store') return { createCloudUserStore: () => ({}) };
      return localRequire(name);
    },
  });
  return options;
}

test('account deletion rejects partial storage failures so orphan cleanup is reported', async () => {
  const options = getOptions(async () => ({ fileList: [{ fileID: 'file', status: -1 }] }));
  await assert.rejects(() => options.deleteFiles(['file']));
});

test('account deletion batches all files and keeps cleaning after a failed batch', async () => {
  const sizes = [];
  const options = getOptions(async ({ fileList }) => {
    sizes.push(fileList.length);
    if (sizes.length === 1) throw new Error('temporary storage error');
    return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
  });
  await assert.rejects(() =>
    options.deleteFiles(Array.from({ length: 121 }, (_, index) => `f${index}`)),
  );
  assert.deepEqual(sizes, [50, 50, 21]);
});
