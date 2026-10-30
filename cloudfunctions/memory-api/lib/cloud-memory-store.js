'use strict';

const crypto = require('node:crypto');
const PAGE_SIZE = 100;

function successful(result) {
  if (
    !result ||
    (result.code !== undefined && ![0, '', 'SUCCESS'].includes(result.code)) ||
    (result.errCode !== undefined && result.errCode !== 0) ||
    (typeof result.errMsg === 'string' && result.errMsg.includes(':fail'))
  ) {
    throw new Error('Memory database operation failed');
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
      memoryResult: await callback(transaction),
    })),
  );
  const box = Object.hasOwn(output, 'memoryResult') ? output : output.result;
  if (!box || !Object.hasOwn(box, 'memoryResult')) throw new Error('Invalid transaction result');
  return box.memoryResult;
}

async function setDocument(transaction, collection, value) {
  const data = { ...value };
  delete data._id;
  successful(await transaction.collection(collection).doc(value._id).set({ data }));
}

function createCloudMemoryStore(database) {
  const users = database.collection('users');
  const memories = database.collection('memories');
  const migrations = database.collection('memory_migrations');
  const uploadPlans = database.collection('image_upload_plans');
  const friendships = database.collection('friendships');
  const likes = database.collection('likes');

  async function getMine(ownerUserId, memoryId) {
    const result = await memories
      .where({ _id: memoryId, ownerUserId, deletedAt: null })
      .limit(1)
      .get();
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
          .limit(PAGE_SIZE)
          .get(),
      );
      if (!Array.isArray(result.data)) throw new Error('Invalid query result');
      items.push(...result.data);
      if (result.data.length < PAGE_SIZE) return items;
      const next = result.data[result.data.length - 1]._id;
      if (typeof next !== 'string' || next <= cursor) throw new Error('Invalid memory cursor');
      cursor = next;
    }
  }

  async function findMemoryByRequestId(ownerUserId, clientRequestId) {
    const result = successful(
      await memories.where({ ownerUserId, clientRequestId }).limit(1).get(),
    );
    return result.data[0] ?? null;
  }

  async function consumePlan(transaction, planId, ownerUserId, now) {
    if (!planId) return true;
    const ref = transaction.collection('image_upload_plans').doc(planId);
    const plan = document(await ref.get());
    if (!plan || plan.ownerUserId !== ownerUserId || plan.usedAt || plan.expiresAt <= now)
      return false;
    successful(await ref.update({ data: { usedAt: now } }));
    return true;
  }

  return {
    async findUserByIdentityHash(identityHash) {
      const result = await users.where({ identityHash, status: 'active' }).limit(1).get();
      return result.data[0] ?? null;
    },
    async consumeRateLimit(userId, key, now, windowMs, maximum) {
      return transactionResult(database, async (transaction) => {
        const result = await transaction.collection('users').doc(userId).get();
        const user = document(result);
        if (!user || user.status !== 'active') return false;

        const rateLimits =
          user.rateLimits && typeof user.rateLimits === 'object' ? user.rateLimits : {};
        const previous = rateLimits[key];
        const previousStart = Date.parse(previous?.windowStartedAt ?? '');
        const nowMs = Date.parse(now);
        const withinWindow = Number.isFinite(previousStart) && nowMs - previousStart < windowMs;
        const count = withinWindow && Number.isInteger(previous?.count) ? previous.count : 0;
        if (count >= maximum) return false;

        successful(
          await transaction
            .collection('users')
            .doc(userId)
            .update({
              data: {
                rateLimits: {
                  ...rateLimits,
                  [key]: {
                    count: count + 1,
                    windowStartedAt: withinWindow ? previous.windowStartedAt : now,
                  },
                },
              },
            }),
        );
        return true;
      });
    },
    async createUploadPlan(plan) {
      await uploadPlans.add({ data: plan });
      return plan;
    },
    async consumeUploadPlan(planId, ownerUserId, now) {
      return transactionResult(database, async (transaction) => {
        const ref = transaction.collection('image_upload_plans').doc(planId);
        const plan = document(await ref.get());
        if (!plan || plan.ownerUserId !== ownerUserId || plan.usedAt || plan.expiresAt <= now)
          return null;
        successful(await ref.update({ data: { usedAt: now } }));
        return plan;
      });
    },
    async getUploadPlan(planId, ownerUserId, now) {
      const result = successful(
        await uploadPlans.where({ _id: planId, ownerUserId }).limit(1).get(),
      );
      const plan = result.data[0];
      return plan && !plan.usedAt && plan.expiresAt > now ? plan : null;
    },
    async findMigration(migrationKey) {
      const result = await migrations.where({ migrationKey }).limit(1).get();
      return result.data[0] ?? null;
    },
    async createMigratedMemory(memory, migration, planId = null, now = migration.createdAt) {
      const previous = await migrations
        .where({ migrationKey: migration.migrationKey })
        .limit(1)
        .get();
      const migrationId = previous.data[0]?._id ?? `migration_${migration.migrationKey}`;
      return transactionResult(database, async (transaction) => {
        const existing = document(
          await transaction.collection('memory_migrations').doc(migrationId).get(),
        );
        if (existing) {
          return { memoryId: existing.cloudMemoryId, status: 'existing' };
        }
        if (!(await consumePlan(transaction, planId, memory.ownerUserId, now))) {
          return { code: 'UPLOAD_PLAN_INVALID' };
        }
        await setDocument(transaction, 'memories', memory);
        await setDocument(transaction, 'memory_migrations', { ...migration, _id: migrationId });
        return { memoryId: memory._id, status: 'created' };
      });
    },
    findMemoryByRequestId,
    async createMemory(memory, planId = null, now = memory.updatedAt) {
      const previous = await findMemoryByRequestId(memory.ownerUserId, memory.clientRequestId);
      const key = crypto
        .createHash('sha256')
        .update(`${memory.ownerUserId}\0${memory.clientRequestId}`)
        .digest('hex');
      const memoryId = previous?._id ?? `memory_${key}`;
      return transactionResult(database, async (transaction) => {
        const existing = document(await transaction.collection('memories').doc(memoryId).get());
        if (existing) return existing;
        if (!(await consumePlan(transaction, planId, memory.ownerUserId, now))) {
          return { code: 'UPLOAD_PLAN_INVALID' };
        }
        const created = { ...memory, _id: memoryId };
        await setDocument(transaction, 'memories', created);
        return created;
      });
    },
    async listMine(ownerUserId) {
      const items = await readAll(memories, { ownerUserId, deletedAt: null });
      return items.sort(
        (left, right) =>
          right.recordedAt.localeCompare(left.recordedAt) || left._id.localeCompare(right._id),
      );
    },
    async getMine(ownerUserId, memoryId) {
      return getMine(ownerUserId, memoryId);
    },
    async updateMine(ownerUserId, memoryId, data, planId = null, now = data.updatedAt) {
      return transactionResult(database, async (transaction) => {
        const ref = transaction.collection('memories').doc(memoryId);
        const current = document(await ref.get());
        if (!current || current.ownerUserId !== ownerUserId || current.deletedAt) return null;
        if (!(await consumePlan(transaction, planId, ownerUserId, now))) {
          return { code: 'UPLOAD_PLAN_INVALID' };
        }
        successful(await ref.update({ data }));
        return { ...current, ...data };
      });
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
      const items = await readAll(memories, { ownerUserId, deletedAt: null });
      for (const item of items) {
        await memories.doc(item._id).update({ data: { deletedAt: now, updatedAt: now } });
      }
      return items;
    },
    async listActiveFriendships(userId) {
      const [left, right] = await Promise.all([
        readAll(friendships, { userAId: userId, status: 'active' }),
        readAll(friendships, { userBId: userId, status: 'active' }),
      ]);
      return [...left, ...right];
    },
    async getMemory(memoryId) {
      const result = await memories.where({ _id: memoryId, deletedAt: null }).limit(1).get();
      return result.data[0] ?? null;
    },
    async getUser(userId) {
      const result = await users.where({ _id: userId, status: 'active' }).limit(1).get();
      return result.data[0] ?? null;
    },
    async getActiveFriendship(pairKey) {
      const result = await friendships.where({ pairKey, status: 'active' }).limit(1).get();
      return result.data[0] ?? null;
    },
    async findLike(pairKey) {
      const result = await likes.where({ pairKey }).limit(1).get();
      return result.data[0] ?? null;
    },
    async setLikeState(input) {
      const [friendshipLookup, likeLookup] = await Promise.all([
        friendships.where({ pairKey: input.friendshipPairKey, status: 'active' }).limit(1).get(),
        likes.where({ pairKey: input.likePairKey }).limit(1).get(),
      ]);
      const friendshipId = friendshipLookup.data[0]?._id;
      if (!friendshipId) return { code: 'VIEW_FORBIDDEN' };
      const likeId = likeLookup.data[0]?._id ?? `like_${input.likePairKey}`;
      return transactionResult(database, async (transaction) => {
        const memory = document(await transaction.collection('memories').doc(input.memoryId).get());
        if (!memory || memory.deletedAt || memory.ownerUserId === input.userId)
          return { code: 'VIEW_FORBIDDEN' };
        const friendship = document(
          await transaction.collection('friendships').doc(friendshipId).get(),
        );
        const selectedAllowed =
          memory.visibility === 'selected_friends' &&
          Array.isArray(memory.selectedGrants) &&
          memory.selectedGrants.some(
            (grant) =>
              grant.friendUserId === input.userId &&
              grant.relationshipId === friendship?.relationshipId,
          );
        if (
          !friendship ||
          friendship.status !== 'active' ||
          friendship.pairKey !== input.friendshipPairKey ||
          (memory.visibility !== 'friends' && !selectedAllowed)
        ) {
          return { code: 'VIEW_FORBIDDEN' };
        }

        const existing = document(await transaction.collection('likes').doc(likeId).get());
        let likeCount = Number.isInteger(memory.likeCount) ? memory.likeCount : 0;

        if (input.liked && !existing) {
          await setDocument(transaction, 'likes', {
            _id: likeId,
            pairKey: input.likePairKey,
            memoryId: input.memoryId,
            ownerUserId: memory.ownerUserId,
            userId: input.userId,
            relationshipId: friendship.relationshipId,
            createdAt: input.now,
          });
          likeCount += 1;
        } else if (
          input.liked &&
          existing &&
          existing.relationshipId !== friendship.relationshipId
        ) {
          successful(
            await transaction
              .collection('likes')
              .doc(likeId)
              .update({ data: { relationshipId: friendship.relationshipId } }),
          );
        } else if (!input.liked && existing) {
          successful(await transaction.collection('likes').doc(existing._id).remove());
          likeCount = Math.max(0, likeCount - 1);
        }

        successful(
          await transaction
            .collection('memories')
            .doc(memory._id)
            .update({ data: { likeCount, updatedAt: input.now } }),
        );
        return { likeCount, likedByMe: input.liked };
      });
    },
    async listRecentMemoriesByOwners(ownerUserIds, since, until = null, options = {}) {
      if (!Array.isArray(ownerUserIds) || ownerUserIds.length === 0) return [];
      const publishedAt = until
        ? database.command.gte(since).and(database.command.lte(until))
        : database.command.gte(since);
      const base = {
        ownerUserId: database.command.in(ownerUserIds),
        deletedAt: null,
        visibility: database.command.in(['friends', 'selected_friends']),
        publishedAt,
      };
      const maximum =
        Number.isInteger(options.maximum) && options.maximum > 0 ? options.maximum : 100;
      const accept = typeof options.accept === 'function' ? options.accept : () => true;
      let cursor = options.cursor ?? null;
      const allowed = [];
      while (allowed.length < maximum) {
        const where = cursor
          ? database.command.and(
              base,
              database.command.or(
                { publishedAt: database.command.lt(cursor.publishedAt) },
                { publishedAt: cursor.publishedAt, _id: database.command.gt(cursor.id) },
              ),
            )
          : base;
        const result = successful(
          await memories
            .where(where)
            .orderBy('publishedAt', 'desc')
            .orderBy('_id', 'asc')
            .limit(PAGE_SIZE)
            .get(),
        );
        if (!Array.isArray(result.data)) throw new Error('Invalid shared memory result');
        for (const memory of result.data) {
          if (accept(memory)) allowed.push(memory);
          if (allowed.length === maximum) return allowed;
        }
        if (result.data.length < PAGE_SIZE) return allowed;
        const last = result.data[result.data.length - 1];
        if (
          typeof last._id !== 'string' ||
          typeof last.publishedAt !== 'string' ||
          (cursor &&
            !(
              last.publishedAt < cursor.publishedAt ||
              (last.publishedAt === cursor.publishedAt && last._id > cursor.id)
            ))
        ) {
          throw new Error('Invalid shared memory cursor');
        }
        cursor = { id: last._id, publishedAt: last.publishedAt };
      }
      return allowed;
    },
  };
}

module.exports = { createCloudMemoryStore };
