'use strict';

function createCloudMemoryStore(database) {
  const users = database.collection('users');
  const memories = database.collection('memories');
  const migrations = database.collection('memory_migrations');
  const uploadPlans = database.collection('image_upload_plans');
  const friendships = database.collection('friendships');

  async function getMine(ownerUserId, memoryId) {
    const result = await memories
      .where({ _id: memoryId, ownerUserId, deletedAt: null })
      .limit(1)
      .get();
    return result.data[0] ?? null;
  }

  return {
    async findUserByIdentityHash(identityHash) {
      const result = await users.where({ identityHash, status: 'active' }).limit(1).get();
      return result.data[0] ?? null;
    },
    async createUploadPlan(plan) {
      await uploadPlans.add({ data: plan });
      return plan;
    },
    async consumeUploadPlan(planId, ownerUserId, now) {
      const result = await uploadPlans.where({ _id: planId, ownerUserId }).limit(1).get();
      const plan = result.data[0] ?? null;
      if (!plan || plan.usedAt || plan.expiresAt <= now) {
        return null;
      }
      await uploadPlans.doc(planId).update({ data: { usedAt: now } });
      return plan;
    },
    async findMigration(migrationKey) {
      const result = await migrations.where({ migrationKey }).limit(1).get();
      return result.data[0] ?? null;
    },
    async createMigratedMemory(memory, migration) {
      return database.runTransaction(async (transaction) => {
        const existing = await transaction
          .collection('memory_migrations')
          .where({ migrationKey: migration.migrationKey })
          .limit(1)
          .get();
        if (existing.data[0]) {
          return { memoryId: existing.data[0].cloudMemoryId, status: 'existing' };
        }
        await transaction.collection('memories').add({ data: memory });
        await transaction.collection('memory_migrations').add({ data: migration });
        return { memoryId: memory._id, status: 'created' };
      });
    },
    async createMemory(memory) {
      const existing = await memories
        .where({ ownerUserId: memory.ownerUserId, clientRequestId: memory.clientRequestId })
        .limit(1)
        .get();
      if (existing.data[0]) {
        return existing.data[0];
      }
      await memories.add({ data: memory });
      return memory;
    },
    async listMine(ownerUserId) {
      const result = await memories
        .where({ ownerUserId, deletedAt: null })
        .orderBy('recordedAt', 'desc')
        .limit(100)
        .get();
      return result.data;
    },
    async getMine(ownerUserId, memoryId) {
      return getMine(ownerUserId, memoryId);
    },
    async updateMine(ownerUserId, memoryId, data) {
      const current = await getMine(ownerUserId, memoryId);
      if (!current) {
        return null;
      }
      await memories.doc(memoryId).update({ data });
      return { ...current, ...data };
    },
    async deleteMine(ownerUserId, memoryId, now) {
      const current = await getMine(ownerUserId, memoryId);
      if (!current) {
        return null;
      }
      await memories.doc(memoryId).update({ data: { deletedAt: now, updatedAt: now } });
      return current;
    },
    async clearMine(ownerUserId, now) {
      const result = await memories.where({ ownerUserId, deletedAt: null }).limit(100).get();
      const items = result.data;
      for (const item of items) {
        await memories.doc(item._id).update({ data: { deletedAt: now, updatedAt: now } });
      }
      return items;
    },
    async listActiveFriendships(userId) {
      const [left, right] = await Promise.all([
        friendships.where({ userAId: userId, status: 'active' }).limit(100).get(),
        friendships.where({ userBId: userId, status: 'active' }).limit(100).get(),
      ]);
      return [...left.data, ...right.data];
    },
  };
}

module.exports = { createCloudMemoryStore };
