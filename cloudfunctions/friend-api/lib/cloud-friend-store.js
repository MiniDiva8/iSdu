'use strict';

function createCloudFriendStore(database) {
  const users = database.collection('users');
  const invites = database.collection('invite_tokens');
  const friendships = database.collection('friendships');

  async function findFriendship(pairKey) {
    const result = await friendships.where({ pairKey }).limit(1).get();
    return result.data[0] ?? null;
  }

  return {
    async findUserByIdentityHash(identityHash) {
      const result = await users.where({ identityHash, status: 'active' }).limit(1).get();
      return result.data[0] ?? null;
    },
    async getUser(userId) {
      const result = await users.where({ _id: userId, status: 'active' }).limit(1).get();
      return result.data[0] ?? null;
    },
    async countRecentInvites(creatorUserId, since) {
      const result = await invites
        .where({ creatorUserId, createdAt: database.command.gte(since) })
        .count();
      return result.total;
    },
    async createInvite(invite) {
      await invites.add({ data: invite });
      return invite;
    },
    async findInvite(tokenHash) {
      const result = await invites.where({ tokenHash }).limit(1).get();
      return result.data[0] ?? null;
    },
    async findFriendship(pairKey) {
      return findFriendship(pairKey);
    },
    async acceptInvite(input) {
      return database.runTransaction(async (transaction) => {
        const tokenResult = await transaction
          .collection('invite_tokens')
          .where({ tokenHash: input.tokenHash })
          .limit(1)
          .get();
        const token = tokenResult.data[0];
        if (!token) return { code: 'INVITE_NOT_FOUND' };
        if (token.expiresAt <= input.now) return { code: 'INVITE_EXPIRED' };
        if (token.usedAt) {
          const existingResult = await transaction
            .collection('friendships')
            .where({ pairKey: input.pairKey, status: 'active' })
            .limit(1)
            .get();
          if (token.usedByUserId === input.receiverUserId && existingResult.data[0]) {
            return { friendship: existingResult.data[0], status: 'existing' };
          }
          return { code: 'INVITE_USED' };
        }

        const existingResult = await transaction
          .collection('friendships')
          .where({ pairKey: input.pairKey })
          .limit(1)
          .get();
        const existing = existingResult.data[0];
        let friendship;
        if (existing?.status === 'active') {
          friendship = existing;
        } else if (existing) {
          friendship = {
            ...existing,
            relationshipId: input.relationshipId,
            status: 'active',
            removedAt: null,
            updatedAt: input.now,
          };
          await transaction
            .collection('friendships')
            .doc(existing._id)
            .update({
              data: {
                relationshipId: input.relationshipId,
                status: 'active',
                removedAt: null,
                updatedAt: input.now,
              },
            });
        } else {
          friendship = input.friendship;
          await transaction.collection('friendships').add({ data: friendship });
        }

        await transaction
          .collection('invite_tokens')
          .doc(token._id)
          .update({
            data: { usedAt: input.now, usedByUserId: input.receiverUserId },
          });
        await transaction.collection('friend_requests').add({ data: input.request });
        return { friendship, status: existing?.status === 'active' ? 'existing' : 'created' };
      });
    },
    async listFriendships(userId) {
      const [left, right] = await Promise.all([
        friendships.where({ userAId: userId, status: 'active' }).limit(100).get(),
        friendships.where({ userBId: userId, status: 'active' }).limit(100).get(),
      ]);
      return [...left.data, ...right.data];
    },
    async removeFriend(pairKey, userId, now) {
      const current = await findFriendship(pairKey);
      if (
        !current ||
        current.status !== 'active' ||
        ![current.userAId, current.userBId].includes(userId)
      ) {
        return null;
      }
      await friendships.doc(current._id).update({
        data: { status: 'removed', removedAt: now, updatedAt: now },
      });
      return current;
    },
  };
}

module.exports = { createCloudFriendStore };
