'use strict';

const USERS_COLLECTION = 'users';

function mapUserDocument(document) {
  if (!document || typeof document !== 'object') {
    throw new Error('User document is invalid');
  }

  return {
    avatarFileId: document.avatarFileId,
    createdAt: document.createdAt,
    displayName: document.displayName,
    identityHash: document.identityHash,
    schemaVersion: document.schemaVersion,
    signature: document.signature,
    status: document.status,
    updatedAt: document.updatedAt,
    userId: document._id,
  };
}

function createCloudUserStore(database) {
  const collection = database.collection(USERS_COLLECTION);

  async function readBatch(collectionName, query) {
    const result = await database.collection(collectionName).where(query).limit(100).get();
    return result.data;
  }

  async function removeMatching(collectionName, query) {
    let removed = 0;
    while (true) {
      const items = await readBatch(collectionName, query);
      if (items.length === 0) return removed;
      for (const item of items) {
        await database.collection(collectionName).doc(item._id).remove();
        removed += 1;
      }
    }
  }

  return {
    async create(user) {
      await collection.add({
        data: {
          _id: user.userId,
          avatarFileId: user.avatarFileId,
          createdAt: user.createdAt,
          displayName: user.displayName,
          identityHash: user.identityHash,
          schemaVersion: user.schemaVersion,
          signature: user.signature,
          status: user.status,
          updatedAt: user.updatedAt,
        },
      });
    },

    async findByIdentityHash(identityHash) {
      const result = await collection.where({ identityHash }).limit(1).get();
      const document = Array.isArray(result.data) ? result.data[0] : undefined;
      return document ? mapUserDocument(document) : null;
    },

    async updateProfile(userId, profile) {
      await collection.doc(userId).update({
        data: {
          displayName: profile.displayName,
          signature: profile.signature,
          updatedAt: profile.updatedAt,
        },
      });
    },

    async deleteAccount(userId) {
      const fileIds = [];
      const userResult = await collection.doc(userId).get();
      if (typeof userResult.data?.avatarFileId === 'string' && userResult.data.avatarFileId) {
        fileIds.push(userResult.data.avatarFileId);
      }

      while (true) {
        const outgoingLikes = await readBatch('likes', { userId });
        if (outgoingLikes.length === 0) break;
        for (const like of outgoingLikes) {
          await database.runTransaction(async (transaction) => {
            const likeResult = await transaction.collection('likes').doc(like._id).get();
            const currentLike = likeResult.data;
            if (!currentLike) return;

            const memoryResult = await transaction
              .collection('memories')
              .doc(currentLike.memoryId)
              .get();
            const memory = memoryResult.data;
            if (memory && memory.ownerUserId !== userId) {
              await transaction
                .collection('memories')
                .doc(memory._id)
                .update({ data: { likeCount: Math.max(0, (memory.likeCount ?? 0) - 1) } });
            }
            await transaction.collection('likes').doc(currentLike._id).remove();
          });
        }
      }

      await removeMatching('likes', { ownerUserId: userId });
      await removeMatching('friendships', { userAId: userId });
      await removeMatching('friendships', { userBId: userId });
      await removeMatching('friend_requests', { requesterUserId: userId });
      await removeMatching('friend_requests', { receiverUserId: userId });
      await removeMatching('invite_tokens', { creatorUserId: userId });
      await removeMatching('memory_migrations', { ownerUserId: userId });
      await removeMatching('image_upload_plans', { ownerUserId: userId });
      while (true) {
        const ownedMemories = await readBatch('memories', { ownerUserId: userId });
        if (ownedMemories.length === 0) break;
        for (const memory of ownedMemories) {
          for (const image of Array.isArray(memory.images) ? memory.images : []) {
            if (typeof image.fileId === 'string') fileIds.push(image.fileId);
          }
          await database.collection('memories').doc(memory._id).remove();
        }
      }
      await collection.doc(userId).remove();
      return { fileIds };
    },
  };
}

module.exports = { USERS_COLLECTION, createCloudUserStore, mapUserDocument };
