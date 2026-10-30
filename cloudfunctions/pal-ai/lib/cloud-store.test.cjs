'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createCloudStore } = require('./cloud-store');
const { createDatabase } = require('../../companion-api/lib/companion-test-database.cjs');

test('normalizes both CloudBase transaction/document envelopes and preserves private user fields', async () => {
  for (const wrappedTransactions of [false, true])
    for (const arrayDocumentReads of [false, true]) {
      const database = createDatabase(
        {
          users: [{ _id: 'usr_a', status: 'active', identityHash: 'hash', displayName: '原名字' }],
        },
        { wrappedTransactions, arrayDocumentReads },
      );
      const store = createCloudStore(database);
      assert.equal((await store.findUserByIdentityHash('hash'))._id, 'usr_a');
      await store.transaction(async (tx) => {
        assert.equal(await tx.get('pal_ai_budgets', 'missing'), null);
        await tx.update('users', 'usr_a', { palAI: { enabled: true } });
      });
      assert.equal(database.collections.get('users').get('usr_a').displayName, '原名字');
      assert.equal(database.collections.get('users').get('usr_a').palAI.enabled, true);
    }
});

test('failed returned write cannot commit partial budget and user changes', async () => {
  const database = createDatabase({ users: [{ _id: 'usr_a', status: 'active' }] });
  const store = createCloudStore(database);
  database.failNextReturnedWriteOfKind('request');
  await assert.rejects(
    store.transaction(async (tx) => {
      await tx.update('users', 'usr_a', { palAI: { enabled: true } });
      await tx.set('pal_ai_requests', { _id: 'r_1', kind: 'request' });
    }),
  );
  assert.equal(database.collections.get('users').get('usr_a').palAI, undefined);
  assert.equal(database.collections.get('pal_ai_requests')?.size ?? 0, 0);
});

test('invalid document read and transaction response fail closed', async () => {
  const database = createDatabase({ users: [{ _id: 'usr_a' }] });
  const store = createCloudStore(database);
  database.failNextReadOf('users', 'usr_a');
  await assert.rejects(store.transaction((tx) => tx.get('users', 'usr_a')));
  const invalid = createCloudStore({ runTransaction: async () => ({ result: {} }) });
  await assert.rejects(invalid.transaction(() => 'result'));
});
