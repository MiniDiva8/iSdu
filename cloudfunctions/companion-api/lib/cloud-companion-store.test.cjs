'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCloudCompanionStore } = require('./cloud-companion-store');
const { createDatabase } = require('./companion-test-database.cjs');

test('normalizes SDK document arrays and transaction envelopes without exposing internal documents', async () => {
  const database = createDatabase(
    { users: [{ _id: 'usr_a', status: 'active' }] },
    { wrappedTransactions: true, arrayDocumentReads: true },
  );
  const store = createCloudCompanionStore(database);
  assert.deepEqual(await store.transaction((tx) => tx.get('users', 'usr_a')), {
    _id: 'usr_a',
    status: 'active',
  });
  assert.equal(await store.transaction((tx) => tx.get('users', 'missing')), null);
});

test('scans more than a query page with no first-page truncation and no cross-owner rows', async () => {
  const rows = Array.from({ length: 137 }, (_, i) => ({
    _id: `visit_${String(i).padStart(4, '0')}`,
    ownerUserId: 'usr_a',
    visitorUserId: 'usr_b',
    kind: 'entry',
  }));
  const database = createDatabase({
    companion_visits: [
      ...rows,
      { _id: 'visit_other', ownerUserId: 'usr_b', visitorUserId: 'usr_c', kind: 'entry' },
    ],
  });
  const store = createCloudCompanionStore(database);
  const result = await store.listOwnerVisits('usr_a');
  assert.equal(result.length, 137);
  assert.equal(new Set(result.map((row) => row._id)).size, 137);
  assert.equal(
    result.every((row) => row.ownerUserId === 'usr_a'),
    true,
  );
});
