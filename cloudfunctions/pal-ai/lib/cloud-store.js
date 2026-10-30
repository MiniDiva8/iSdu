'use strict';
function successful(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    (result.code !== undefined && result.code !== 0 && result.code !== '') ||
    (result.errCode !== undefined && result.errCode !== 0) ||
    (typeof result.errMsg === 'string' && result.errMsg.includes(':fail'))
  )
    throw new Error('AI database operation failed');
  return result;
}
function createCloudStore(database) {
  return {
    async findUserByIdentityHash(identityHash) {
      const result = successful(
        await database.collection('users').where({ identityHash, status: 'active' }).limit(1).get(),
      );
      if (!Array.isArray(result.data)) throw new Error('Invalid user query');
      return result.data[0] || null;
    },
    async transaction(callback) {
      const output = await database.runTransaction(async (transaction) => ({
        palResult: await callback({
          async get(collection, id) {
            const result = successful(await transaction.collection(collection).doc(id).get());
            return Array.isArray(result.data) ? result.data[0] || null : result.data || null;
          },
          async set(collection, document) {
            const data = { ...document };
            delete data._id;
            successful(await transaction.collection(collection).doc(document._id).set({ data }));
          },
          async update(collection, id, data) {
            successful(await transaction.collection(collection).doc(id).update({ data }));
          },
        }),
      }));
      const box = output && Object.hasOwn(output, 'palResult') ? output : output?.result;
      if (!box || !Object.hasOwn(box, 'palResult')) throw new Error('Invalid transaction result');
      return box.palResult;
    },
  };
}
module.exports = { createCloudStore };
