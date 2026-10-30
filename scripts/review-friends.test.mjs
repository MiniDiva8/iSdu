import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { cloudAuthRepository } from '../miniprogram/services/repository/cloud-auth-repository.ts';
import { cloudFriendRepository } from '../miniprogram/services/repository/cloud-friend-repository.ts';

let definition;
globalThis.Page = (value) => (definition = value);
globalThis.wx = { getStorageInfoSync: () => ({ keys: [] }), getStorageSync: () => '' };
await import('../miniprogram/pages/friends/index.ts');
function page() {
  return {
    ...definition,
    data: structuredClone(definition.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}

test('friend read failure is distinct from an empty list and retry recovers', async (t) => {
  t.mock.method(cloudAuthRepository, 'bootstrap', async () => ({}));
  let reads = 0;
  t.mock.method(cloudFriendRepository, 'listFriends', async () => {
    if (++reads === 1) throw new Error('网络暂时不可用');
    return [
      { relationshipId: 'r1', friend: { userId: 'u1', displayName: 'ABCDEFGHIJKLMNOPQRST' } },
    ];
  });
  const friends = page();
  await friends.loadFriends();
  assert.match(friends.data.loadError, /网络暂时不可用/);
  assert.equal(friends.data.hasLoadedFriends, false);
  assert.equal(friends.data.isLoading, false);
  await friends.loadFriends();
  assert.equal(friends.data.loadError, '');
  assert.equal(friends.data.hasLoadedFriends, true);
  assert.equal(friends.data.friends[0].friend.displayName, 'ABCDEFGHIJKLMNOPQRST');
});

test('a successful empty read is allowed to display the no-friends state', async (t) => {
  t.mock.method(cloudAuthRepository, 'bootstrap', async () => ({}));
  t.mock.method(cloudFriendRepository, 'listFriends', async () => []);
  const friends = page();
  await friends.loadFriends();
  assert.equal(friends.data.hasLoadedFriends, true);
  assert.equal(friends.data.loadError, '');
  assert.deepEqual(friends.data.friends, []);
});

test('friend template provides a retry before empty state and preserves full accessible names', async () => {
  const template = await readFile(
    new URL('../miniprogram/pages/friends/index.wxml', import.meta.url),
    'utf8',
  );
  assert.match(template, /wx:elif="\{\{loadError\}\}"[\s\S]*?bindtap="loadFriends"/);
  assert.match(template, /hasLoadedFriends && friends.length === 0/);
  assert.match(template, /aria-label="[^"]*item.friend.displayName[^"]*"/);
});

test('long friend names wrap within their column and actions keep their width', async () => {
  const style = await readFile(
    new URL('../miniprogram/pages/friends/index.wxss', import.meta.url),
    'utf8',
  );
  assert.match(style, /\.friend-row__name\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(style, /\.friend-row__remove\s*\{[^}]*flex-shrink:\s*0/s);
});
