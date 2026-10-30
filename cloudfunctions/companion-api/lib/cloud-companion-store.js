'use strict';

const PAGE_SIZE = 50;

function successful(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    (result.code !== undefined && result.code !== 0 && result.code !== '') ||
    (result.errCode !== undefined && result.errCode !== 0) ||
    (typeof result.errMsg === 'string' && result.errMsg.includes(':fail'))
  )
    throw new Error('Companion database operation failed');
  return result;
}

function createCloudCompanionStore(database) {
  async function findOne(collection, query) {
    const result = await database.collection(collection).where(query).limit(1).get();
    successful(result);
    if (!Array.isArray(result.data)) throw new Error('Invalid query result');
    return result.data[0] ?? null;
  }
  return {
    findUserByIdentityHash: (identityHash) => findOne('users', { identityHash, status: 'active' }),
    findFriendship: (pairKey) => findOne('friendships', { pairKey }),
    async transaction(callback) {
      // wx-server-sdk and CloudBase node-sdk expose different transaction return envelopes.
      const output = await database.runTransaction(async (transaction) => ({
        companionResult: await callback({
          async get(collection, id) {
            const result = await transaction.collection(collection).doc(id).get();
            successful(result);
            return Array.isArray(result.data) ? (result.data[0] ?? null) : (result.data ?? null);
          },
          async set(collection, document) {
            const data = { ...document };
            delete data._id;
            successful(await transaction.collection(collection).doc(document._id).set({ data }));
          },
          async update(collection, id, data) {
            successful(await transaction.collection(collection).doc(id).update({ data }));
          },
          async remove(collection, id) {
            successful(await transaction.collection(collection).doc(id).remove());
          },
        }),
      }));
      const box = output && Object.hasOwn(output, 'companionResult') ? output : output?.result;
      if (!box || !Object.hasOwn(box, 'companionResult')) {
        throw new Error('Invalid transaction result');
      }
      return box.companionResult;
    },
    async listOwnerVisits(ownerUserId) {
      const documents = [];
      let cursor = '';
      while (true) {
        const query = cursor ? { ownerUserId, _id: database.command.gt(cursor) } : { ownerUserId };
        const result = await database
          .collection('companion_visits')
          .where(query)
          .orderBy('_id', 'asc')
          .limit(PAGE_SIZE)
          .get();
        successful(result);
        if (!Array.isArray(result.data)) throw new Error('Invalid visit query result');
        documents.push(...result.data);
        if (result.data.length < PAGE_SIZE) return documents;
        const next = result.data[result.data.length - 1]._id;
        if (next <= cursor) throw new Error('Invalid visit cursor');
        cursor = next;
      }
    },
    async listUserVisitBatch(userId, field) {
      if (!['ownerUserId', 'visitorUserId'].includes(field)) {
        throw new Error('Invalid visit deletion scope');
      }
      const result = await database
        .collection('companion_visits')
        .where({ [field]: userId })
        .limit(40)
        .get();
      successful(result);
      if (!Array.isArray(result.data)) throw new Error('Invalid deletion query result');
      return result.data;
    },
  };
}

module.exports = { createCloudCompanionStore };
