'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

for (const name of ['memory-api', 'friend-api', 'companion-api', 'auth-api']) {
  test(`${name} configures SDK missing document reads for first-use transactions`, async () => {
    const entry = path.join(__dirname, '../../..', name, 'index.js');
    const localRequire = createRequire(entry);
    const exports = {};
    const database = (config = {}) => ({
      async missingDocument() {
        if (config.throwOnNotFound !== false) throw new Error('document does not exist');
        return { data: null, errMsg: 'document.get:ok' };
      },
    });
    const createStore = (value) => value;
    const createHandler = (options) => async () =>
      (options.store ?? options.userStore).missingDocument();
    vm.runInNewContext(fs.readFileSync(entry, 'utf8'), {
      exports,
      require(request) {
        if (request === 'wx-server-sdk') return { init() {}, database };
        if (request.endsWith('-handler'))
          return {
            createMemoryHandler: createHandler,
            createFriendHandler: createHandler,
            createCompanionHandler: createHandler,
            createAuthHandler: createHandler,
          };
        if (request.endsWith('-store'))
          return {
            createCloudMemoryStore: createStore,
            createCloudFriendStore: createStore,
            createCloudCompanionStore: createStore,
            createCloudUserStore: createStore,
          };
        return localRequire(request);
      },
    });
    assert.equal((await exports.main({})).data, null);
  });
}
