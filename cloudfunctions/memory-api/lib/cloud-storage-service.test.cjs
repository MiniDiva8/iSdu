'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

function getOptions(cloud) {
  let options;
  const entry = path.join(__dirname, '../index.js');
  const localRequire = createRequire(entry);
  vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
    exports: {},
    require(name) {
      if (name === 'wx-server-sdk') return { init() {}, database: () => ({}), ...cloud };
      if (name === './lib/memory-handler')
        return {
          createMemoryHandler(value) {
            options = value;
            return () => {};
          },
        };
      if (name === './lib/cloud-memory-store') return { createCloudMemoryStore: () => ({}) };
      return localRequire(name);
    },
  });
  return options;
}

test('cloud file deletion rejects a resolved per-file failure', async () => {
  const options = getOptions({
    deleteFile: async () => ({
      fileList: [
        { fileID: 'a', status: 0 },
        { fileID: 'b', status: -1 },
      ],
    }),
  });
  await assert.rejects(() => options.deleteFiles(['a', 'b']));
});

test('cloud file operations batch requests and restore response order', async () => {
  const sizes = [];
  const options = getOptions({
    deleteFile: async ({ fileList }) => {
      sizes.push(fileList.length);
      return { fileList: fileList.map((fileID) => ({ fileID, status: 0 })) };
    },
    getTempFileURL: async ({ fileList }) => {
      sizes.push(fileList.length);
      return {
        fileList: fileList
          .map((value) => {
            const fileID = typeof value === 'string' ? value : value.fileID;
            return { fileID, status: 0, tempFileURL: `https://temp.invalid/${fileID}` };
          })
          .reverse(),
      };
    },
  });
  const ids = Array.from({ length: 121 }, (_, index) => `f${index}`);
  await options.deleteFiles(ids);
  const urls = await options.getTempUrls(ids);
  assert.ok(sizes.every((size) => size <= 50));
  assert.equal(urls.length, 121);
  assert.equal(urls[0], 'https://temp.invalid/f0');
  assert.equal(urls[120], 'https://temp.invalid/f120');
});
