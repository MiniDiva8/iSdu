'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createFriendHandler } = require('./friend-handler');

function createHarness(currentUserId = 'usr_b') {
  const users = new Map([
    [
      'usr_a',
      {
        _id: 'usr_a',
        identityHash: 'identity-a',
        status: 'active',
        displayName: 'A',
        signature: '',
      },
    ],
    [
      'usr_b',
      {
        _id: 'usr_b',
        identityHash: 'identity-b',
        status: 'active',
        displayName: 'B',
        signature: '',
      },
    ],
  ]);
  const invites = new Map();
  const friendships = new Map();
  let sequence = 0;
  const identity = () => (currentUserId === 'usr_a' ? 'identity-a' : 'identity-b');
  const store = {
    findUserByIdentityHash: async (hash) =>
      [...users.values()].find((user) => user.identityHash === hash) ?? null,
    getUser: async (id) => users.get(id) ?? null,
    countRecentInvites: async () => 0,
    createInvite: async (invite) => {
      invites.set(invite.tokenHash, { ...invite });
      return invite;
    },
    findInvite: async (tokenHash) => invites.get(tokenHash) ?? null,
    findFriendship: async (pairKey) => friendships.get(pairKey) ?? null,
    acceptInvite: async (input) => {
      const token = invites.get(input.tokenHash);
      if (!token) return { code: 'INVITE_NOT_FOUND' };
      if (token.expiresAt <= input.now) return { code: 'INVITE_EXPIRED' };
      const existing = friendships.get(input.pairKey);
      if (token.usedAt) {
        if (token.usedByUserId === input.receiverUserId && existing?.status === 'active') {
          return { friendship: existing, status: 'existing' };
        }
        return { code: 'INVITE_USED' };
      }
      const friendship = existing
        ? { ...existing, relationshipId: input.relationshipId, status: 'active', removedAt: null }
        : input.friendship;
      friendships.set(input.pairKey, friendship);
      token.usedAt = input.now;
      token.usedByUserId = input.receiverUserId;
      return { friendship, status: existing?.status === 'active' ? 'existing' : 'created' };
    },
    listFriendships: async (userId) =>
      [...friendships.values()].filter(
        (item) => item.status === 'active' && [item.userAId, item.userBId].includes(userId),
      ),
    removeFriend: async (pairKey, userId, now) => {
      const item = friendships.get(pairKey);
      if (!item || item.status !== 'active' || ![item.userAId, item.userBId].includes(userId))
        return null;
      friendships.set(pairKey, { ...item, status: 'removed', removedAt: now });
      return item;
    },
  };
  const handler = createFriendHandler({
    getTrustedContext: () => ({ APPID: 'app', OPENID: currentUserId }),
    hash: (value) => (value.startsWith('app\0') ? identity() : `hash:${value}`),
    newId: (prefix) => `${prefix}_${++sequence}`,
    newRequestId: () => `req_${++sequence}`,
    newToken: () => `token_${String(++sequence).padStart(40, 'a')}`,
    now: () => '2026-08-15T08:00:00.000Z',
    store,
  });
  return {
    friendships,
    handler,
    invites,
    setCurrent: (id) => {
      currentUserId = id;
    },
  };
}

test('creates a 24 hour single-use share invite without identity fields', async () => {
  const { handler } = createHarness('usr_a');
  const result = await handler({ action: 'createInvite' });
  assert.equal(result.ok, true);
  assert.match(result.data.sharePath, /^\/pages\/friend-invite\/index\?token=/u);
  assert.equal(result.data.expiresAt, '2026-08-16T08:00:00.000Z');
  assert.equal(JSON.stringify(result).includes('OPENID'), false);
});

test('blocks accepting an own invite', async () => {
  const harness = createHarness('usr_a');
  const invite = await harness.handler({ action: 'createInvite' });
  const result = await harness.handler({
    action: 'acceptInvite',
    payload: { token: invite.data.token },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'SELF_INVITE');
});

test('accepts once and repeated submission does not duplicate friendship', async () => {
  const harness = createHarness('usr_a');
  const invite = await harness.handler({ action: 'createInvite' });
  harness.setCurrent('usr_b');
  const first = await harness.handler({
    action: 'acceptInvite',
    payload: { token: invite.data.token },
  });
  const second = await harness.handler({
    action: 'acceptInvite',
    payload: { token: invite.data.token },
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(harness.friendships.size, 1);
  assert.equal(first.data.friendship.relationshipId, second.data.friendship.relationshipId);
});

test('removing and re-adding rotates relationship id', async () => {
  const harness = createHarness('usr_a');
  const firstInvite = await harness.handler({ action: 'createInvite' });
  harness.setCurrent('usr_b');
  const first = await harness.handler({
    action: 'acceptInvite',
    payload: { token: firstInvite.data.token },
  });
  await harness.handler({ action: 'removeFriend', payload: { friendUserId: 'usr_a' } });
  harness.setCurrent('usr_a');
  const secondInvite = await harness.handler({ action: 'createInvite' });
  harness.setCurrent('usr_b');
  const second = await harness.handler({
    action: 'acceptInvite',
    payload: { token: secondInvite.data.token },
  });
  assert.equal(second.ok, true);
  assert.notEqual(first.data.friendship.relationshipId, second.data.friendship.relationshipId);
});

test('rejects expired invitation', async () => {
  const harness = createHarness('usr_a');
  const invite = await harness.handler({ action: 'createInvite' });
  const stored = [...harness.invites.values()][0];
  stored.expiresAt = '2026-08-14T08:00:00.000Z';
  harness.setCurrent('usr_b');
  const result = await harness.handler({
    action: 'acceptInvite',
    payload: { token: invite.data.token },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'INVITE_EXPIRED');
});

test('client supplied user ids cannot change invite creator', async () => {
  const { handler, invites } = createHarness('usr_a');
  await handler({ action: 'createInvite', payload: { creatorUserId: 'usr_b' } });
  assert.equal([...invites.values()][0].creatorUserId, 'usr_a');
});
