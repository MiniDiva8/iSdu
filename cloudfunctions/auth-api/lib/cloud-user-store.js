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
  };
}

module.exports = { USERS_COLLECTION, createCloudUserStore, mapUserDocument };
