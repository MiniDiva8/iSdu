'use strict';

function successful(result) {
  if (
    !result ||
    (result.code !== undefined && ![0, '', 'SUCCESS'].includes(result.code)) ||
    (result.errCode !== undefined && result.errCode !== 0) ||
    (typeof result.errMsg === 'string' && result.errMsg.includes(':fail'))
  ) {
    throw new Error('Friend database operation failed');
  }
  return result;
}

function document(result) {
  successful(result);
  return Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
}

async function transactionResult(database, callback) {
  const output = successful(
    await database.runTransaction(async (transaction) => ({
      friendResult: await callback(transaction),
    })),
  );
  const box = Object.hasOwn(output, 'friendResult') ? output : output.result;
  if (!box || !Object.hasOwn(box, 'friendResult')) throw new Error('Invalid transaction result');
  return box.friendResult;
}

async function setDocument(transaction, collection, value) {
  const data = { ...value };
  delete data._id;
  successful(await transaction.collection(collection).doc(value._id).set({ data }));
}

function createCloudFriendStore(database) {
  const users = database.collection('users');
  const invites = database.collection('invite_tokens');
  const friendships = database.collection('friendships');

  async function findOne(collection, query) {
    const result = successful(await collection.where(query).limit(1).get());
    return result.data[0] ?? null;
  }

  async function readAll(collection, where) {
    const items = [];
    let cursor = '';
    while (true) {
      const result = successful(
        await collection
          .where(cursor ? { ...where, _id: database.command.gt(cursor) } : where)
          .orderBy('_id', 'asc')
          .limit(100)
          .get(),
      );
      if (!Array.isArray(result.data)) throw new Error('Invalid friend query result');
      items.push(...result.data);
      if (result.data.length < 100) return items;
      const next = result.data[result.data.length - 1]._id;
      if (typeof next !== 'string' || next <= cursor) throw new Error('Invalid friend cursor');
      cursor = next;
    }
  }

  return {
    findUserByIdentityHash: (identityHash) => findOne(users, { identityHash, status: 'active' }),
    getUser: (userId) => findOne(users, { _id: userId, status: 'active' }),
    async countRecentInvites(creatorUserId, since) {
      const result = successful(
        await invites.where({ creatorUserId, createdAt: database.command.gte(since) }).count(),
      );
      return result.total;
    },
    async createInvite(invite) {
      return transactionResult(database, async (transaction) => {
        const userRef = transaction.collection('users').doc(invite.creatorUserId);
        const user = document(await userRef.get());
        if (user?.status !== 'active') return null;
        const rateLimits =
          user.rateLimits && typeof user.rateLimits === 'object' ? user.rateLimits : {};
        const previous = rateLimits.invite;
        const startedAt = Date.parse(previous?.windowStartedAt ?? '');
        const withinWindow =
          Number.isFinite(startedAt) && Date.parse(invite.createdAt) - startedAt < 10 * 60 * 1000;
        const count = withinWindow && Number.isInteger(previous?.count) ? previous.count : 0;
        if (count >= 5) return null;
        successful(
          await userRef.update({
            data: {
              rateLimits: {
                ...rateLimits,
                invite: {
                  count: count + 1,
                  windowStartedAt: withinWindow ? previous.windowStartedAt : invite.createdAt,
                },
              },
            },
          }),
        );
        await setDocument(transaction, 'invite_tokens', invite);
        return invite;
      });
    },
    findInvite: (tokenHash) => findOne(invites, { tokenHash }),
    findFriendship: (pairKey) => findOne(friendships, { pairKey }),
    async acceptInvite(input) {
      const [locatedToken, locatedFriendship] = await Promise.all([
        findOne(invites, { tokenHash: input.tokenHash }),
        findOne(friendships, { pairKey: input.pairKey }),
      ]);
      if (!locatedToken) return { code: 'INVITE_NOT_FOUND' };
      const friendshipId = locatedFriendship?._id ?? `friendship_${input.pairKey}`;
      return transactionResult(database, async (transaction) => {
        const token = document(
          await transaction.collection('invite_tokens').doc(locatedToken._id).get(),
        );
        if (!token || token.tokenHash !== input.tokenHash) return { code: 'INVITE_NOT_FOUND' };
        if (token.expiresAt <= input.now) return { code: 'INVITE_EXPIRED' };
        if (
          token.creatorUserId === input.receiverUserId ||
          ![input.friendship.userAId, input.friendship.userBId].includes(token.creatorUserId) ||
          ![input.friendship.userAId, input.friendship.userBId].includes(input.receiverUserId)
        ) {
          return { code: 'INVITE_NOT_FOUND' };
        }
        const creator = document(
          await transaction.collection('users').doc(token.creatorUserId).get(),
        );
        const receiver = document(
          await transaction.collection('users').doc(input.receiverUserId).get(),
        );
        if (creator?.status !== 'active' || receiver?.status !== 'active')
          return { code: 'INVITE_NOT_FOUND' };
        const existing = document(
          await transaction.collection('friendships').doc(friendshipId).get(),
        );
        if (token.usedAt) {
          return token.usedByUserId === input.receiverUserId && existing?.status === 'active'
            ? { friendship: existing, status: 'existing' }
            : { code: 'INVITE_USED' };
        }
        const friendship =
          existing?.status === 'active'
            ? existing
            : {
                ...(existing ?? input.friendship),
                _id: friendshipId,
                relationshipId: input.relationshipId,
                status: 'active',
                removedAt: null,
                updatedAt: input.now,
              };
        if (existing?.status !== 'active')
          await setDocument(transaction, 'friendships', friendship);
        successful(
          await transaction
            .collection('invite_tokens')
            .doc(token._id)
            .update({
              data: { usedAt: input.now, usedByUserId: input.receiverUserId },
            }),
        );
        await setDocument(transaction, 'friend_requests', input.request);
        return { friendship, status: existing?.status === 'active' ? 'existing' : 'created' };
      });
    },
    async listFriendships(userId) {
      const [left, right] = await Promise.all([
        readAll(friendships, { userAId: userId, status: 'active' }),
        readAll(friendships, { userBId: userId, status: 'active' }),
      ]);
      return [...left, ...right];
    },
    async removeFriend(pairKey, userId, now) {
      const located = await findOne(friendships, { pairKey });
      if (!located) return null;
      // Revoke access before cleanup, which may need many bounded transactions.
      const removed = await transactionResult(database, async (transaction) => {
        const current = document(
          await transaction.collection('friendships').doc(located._id).get(),
        );
        if (
          !current ||
          current.pairKey !== pairKey ||
          ![current.userAId, current.userBId].includes(userId)
        )
          return null;
        if (current.status === 'active') {
          successful(
            await transaction
              .collection('friendships')
              .doc(current._id)
              .update({
                data: { status: 'removed', removedAt: now, updatedAt: now },
              }),
          );
        }
        return current;
      });
      if (!removed) return null;
      const likes = database.collection('likes');
      const [fromA, fromB] = await Promise.all([
        readAll(likes, { ownerUserId: removed.userAId, userId: removed.userBId }),
        readAll(likes, { ownerUserId: removed.userBId, userId: removed.userAId }),
      ]);
      for (const locatedLike of [...fromA, ...fromB]) {
        await transactionResult(database, async (transaction) => {
          const like = document(await transaction.collection('likes').doc(locatedLike._id).get());
          if (!like || (like.relationshipId && like.relationshipId !== removed.relationshipId))
            return;
          const memory = document(
            await transaction.collection('memories').doc(like.memoryId).get(),
          );
          if (memory && memory.ownerUserId === like.ownerUserId) {
            successful(
              await transaction
                .collection('memories')
                .doc(memory._id)
                .update({
                  data: { likeCount: Math.max(0, (memory.likeCount ?? 0) - 1), updatedAt: now },
                }),
            );
          }
          successful(await transaction.collection('likes').doc(like._id).remove());
        });
      }
      return removed;
    },
  };
}

module.exports = { createCloudFriendStore };
