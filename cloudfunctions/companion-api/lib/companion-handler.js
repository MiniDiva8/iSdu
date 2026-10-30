'use strict';

const SKINS = ['sprout', 'sunshine', 'sky', 'peach', 'lavender', 'cocoa', 'mint', 'night'];
const ACCESSORIES = ['none', 'scarf', 'hat', 'book', 'headphones', 'flower'];
const THEMES = ['meadow', 'dusk', 'blossom'];
const FURNITURE = [
  'bench',
  'tree',
  'desk',
  'bookshelf',
  'lamp',
  'flowers',
  'picnic',
  'pond',
  'cushion',
  'bicycle',
  'lantern',
  'sign',
  'shanhai_collectible_chest',
  'sdu_red_graduation_rack',
  'dacheng_eight_relief_platform',
  'dacheng_cong_garden_lantern',
  'grove_memory_swing',
  'doctoral_cat_bookends',
  'campus_postmark_workbench',
  'three_cities_travel_sign',
  'three_cities_souvenir_cabinet',
  'majia_twin_dome_model',
  'majia_stargazing_telescope',
  'starmap_observation_table',
];
const ACTION_FIELDS = {
  getMine: [],
  publishHome: ['snapshot', 'visibility', 'expectedRevision'],
  getHome: ['targetUserId'],
  visitHome: ['targetUserId', 'requestId', 'message'],
  listVisits: [],
  deleteVisit: ['id'],
  deleteMyData: [],
};

class PublicError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const points = (value) => Array.from(value).length;
function invalid() {
  throw new PublicError('INVALID_INPUT', '小屋资料格式无效');
}
function exactFields(value, fields) {
  if (!isRecord(value) || Object.keys(value).some((field) => !fields.includes(field))) invalid();
}
function opaqueId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/u.test(value)) invalid();
  return value;
}
function parseSnapshot(value, strict = true) {
  const fields = ['name', 'skinId', 'accessoryId', 'theme', 'placements'];
  if (strict) exactFields(value, fields);
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    value.name.trim().length === 0 ||
    points(value.name) > 16 ||
    !SKINS.includes(value.skinId) ||
    !ACCESSORIES.includes(value.accessoryId) ||
    !THEMES.includes(value.theme) ||
    !Array.isArray(value.placements) ||
    value.placements.length > 40
  )
    invalid();
  const ids = new Set();
  const placements = value.placements.map((placement) => {
    if (strict) exactFields(placement, ['id', 'itemId', 'x', 'y', 'rotation']);
    if (
      !isRecord(placement) ||
      typeof placement.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/u.test(placement.id) ||
      ids.has(placement.id) ||
      !FURNITURE.includes(placement.itemId) ||
      !Number.isFinite(placement.x) ||
      placement.x < 0 ||
      placement.x > 1 ||
      !Number.isFinite(placement.y) ||
      placement.y < 0 ||
      placement.y > 1 ||
      ![0, 90, 180, 270].includes(placement.rotation)
    )
      invalid();
    ids.add(placement.id);
    return {
      id: placement.id,
      itemId: placement.itemId,
      x: placement.x,
      y: placement.y,
      rotation: placement.rotation,
    };
  });
  return {
    name: value.name,
    skinId: value.skinId,
    accessoryId: value.accessoryId,
    theme: value.theme,
    placements,
  };
}
function profile(user) {
  return {
    userId: user._id,
    displayName:
      typeof user.displayName === 'string' && user.displayName
        ? Array.from(user.displayName).slice(0, 64).join('')
        : 'iSdu 用户',
  };
}
function published(home, user) {
  if (
    !home ||
    home.deleting ||
    !home.snapshot ||
    !['private', 'friends'].includes(home.visibility) ||
    !Number.isSafeInteger(home.revision) ||
    home.revision < 1 ||
    typeof home.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(home.updatedAt))
  )
    throw new PublicError('HOME_UNAVAILABLE', '这间小屋当前不可访问');
  return {
    snapshot: parseSnapshot(home.snapshot, false),
    visibility: home.visibility,
    revision: home.revision,
    updatedAt: home.updatedAt,
    owner: profile(user),
  };
}
function unavailable() {
  throw new PublicError('HOME_UNAVAILABLE', '这间小屋当前不可访问');
}

function createCompanionHandler(options) {
  const homeId = (userId) => `home_${options.hash(userId)}`;
  const pairKey = (left, right) => options.hash([left, right].sort().join('\0'));
  function isFriend(row, left, right) {
    return (
      row?.status === 'active' &&
      row.pairKey === pairKey(left, right) &&
      [row.userAId, row.userBId].sort().join('\0') === [left, right].sort().join('\0') &&
      typeof row.relationshipId === 'string' &&
      row.relationshipId.length > 0
    );
  }
  async function authenticate() {
    const context = options.getTrustedContext();
    if (
      typeof context?.APPID !== 'string' ||
      !context.APPID ||
      typeof context?.OPENID !== 'string' ||
      !context.OPENID
    )
      throw new PublicError('UNAUTHENTICATED', '无法确认当前微信用户');
    const identityHash = options.hash(`${context.APPID}\0${context.OPENID}`);
    const user = await options.store.findUserByIdentityHash(identityHash);
    if (!user || user.status !== 'active') {
      throw new PublicError('PROFILE_REQUIRED', '请先开启云端身份');
    }
    return { user, identityHash, openid: context.OPENID };
  }
  async function actor(tx, auth, allowDeleting = false) {
    const user = await tx.get('users', auth.user._id);
    if (!user || user.status !== 'active' || user.identityHash !== auth.identityHash) {
      throw new PublicError('PROFILE_REQUIRED', '当前云端身份不可用');
    }
    const ownHome = await tx.get('companion_homes', homeId(user._id));
    if (ownHome?.deleting && !allowDeleting) {
      throw new PublicError('DATA_DELETION_IN_PROGRESS', '小屋资料正在清理，请稍后再试');
    }
    return { user, ownHome };
  }
  async function targetAccess(tx, auth, targetUserId, candidate) {
    const current = await actor(tx, auth);
    if (targetUserId === current.user._id) {
      if (!current.ownHome?.snapshot) unavailable();
      return { ...current, owner: current.user, home: current.ownHome, friendship: null };
    }
    const owner = await tx.get('users', targetUserId);
    const home = await tx.get('companion_homes', homeId(targetUserId));
    const friendship = candidate?._id ? await tx.get('friendships', candidate._id) : null;
    if (
      !owner ||
      owner.status !== 'active' ||
      !home?.snapshot ||
      home.deleting ||
      home.ownerUserId !== targetUserId ||
      home.visibility !== 'friends' ||
      !isFriend(friendship, current.user._id, targetUserId)
    )
      unavailable();
    return { ...current, owner, home, friendship };
  }
  async function moderate(content, openid, scene) {
    let result;
    try {
      result = await options.moderate({ content, openid, scene });
    } catch {
      throw new PublicError('MODERATION_UNAVAILABLE', '内容安全检测暂时不可用，请稍后再试');
    }
    if (
      !isRecord(result) ||
      (result.errCode !== undefined && result.errCode !== 0) ||
      !['pass', 'review', 'risky'].includes(result.result?.suggest)
    )
      throw new PublicError('MODERATION_UNAVAILABLE', '内容安全检测暂时不可用，请稍后再试');
    if (result.result.suggest !== 'pass') {
      throw new PublicError('CONTENT_REJECTED', '这段文字暂时无法使用，请修改后重试');
    }
  }
  async function deleteData(auth, requestId, now) {
    const deletionId = await options.store.transaction(async (tx) => {
      const current = await actor(tx, auth, true);
      if (current.ownHome?.deleting) return current.ownHome.deletionId;
      await tx.set('companion_homes', {
        _id: homeId(auth.user._id),
        ownerUserId: auth.user._id,
        deleting: true,
        deletionId: requestId,
        updatedAt: now,
      });
      return requestId;
    });
    for (const field of ['ownerUserId', 'visitorUserId']) {
      while (true) {
        const batch = await options.store.listUserVisitBatch(auth.user._id, field);
        if (batch.length === 0) break;
        const continuing = await options.store.transaction(async (tx) => {
          const current = await actor(tx, auth, true);
          if (!current.ownHome?.deleting || current.ownHome.deletionId !== deletionId) return false;
          for (const row of batch) {
            const record = await tx.get('companion_visits', row._id);
            if (
              record &&
              (record.ownerUserId === auth.user._id || record.visitorUserId === auth.user._id)
            ) {
              await tx.remove('companion_visits', record._id);
            }
          }
          return true;
        });
        if (!continuing) return;
      }
    }
    await options.store.transaction(async (tx) => {
      const current = await actor(tx, auth, true);
      if (current.ownHome?.deleting && current.ownHome.deletionId === deletionId) {
        await tx.remove('companion_homes', homeId(auth.user._id));
      }
    });
  }

  return async function handle(event) {
    const requestId = options.newRequestId();
    try {
      if (!isRecord(event) || typeof event.action !== 'string') {
        throw new PublicError('INVALID_REQUEST', '请求格式无效');
      }
      const auth = await authenticate();
      if (!Object.hasOwn(ACTION_FIELDS, event.action)) {
        throw new PublicError('UNSUPPORTED_ACTION', '暂不支持这个小屋操作');
      }
      const payload = event.payload === undefined ? {} : event.payload;
      exactFields(payload, ACTION_FIELDS[event.action]);
      const now = options.now();
      if (typeof now !== 'string' || !Number.isFinite(Date.parse(now)))
        throw new Error('Invalid time');
      let data;

      if (event.action === 'getMine') {
        data = await options.store.transaction(async (tx) => {
          const current = await actor(tx, auth, true);
          return {
            userId: current.user._id,
            home:
              current.ownHome?.snapshot && !current.ownHome.deleting
                ? published(current.ownHome, current.user)
                : null,
          };
        });
      } else if (event.action === 'publishHome') {
        const snapshot = parseSnapshot(payload.snapshot);
        if (
          !['private', 'friends'].includes(payload.visibility) ||
          !Number.isSafeInteger(payload.expectedRevision) ||
          payload.expectedRevision < 0
        )
          invalid();
        async function saveHome(tx, closingOnly) {
          const current = await actor(tx, auth);
          const revision = current.ownHome?.revision ?? 0;
          if (payload.expectedRevision !== revision) {
            throw new PublicError('REVISION_CONFLICT', '小屋已在其他地方更新，请先重新读取');
          }
          if (
            !Number.isSafeInteger(revision) ||
            revision < 0 ||
            revision >= Number.MAX_SAFE_INTEGER
          ) {
            throw new Error('Invalid revision');
          }
          if (
            closingOnly &&
            (!current.ownHome?.snapshot ||
              current.ownHome.moderatedNameHash !== options.hash(snapshot.name) ||
              JSON.stringify(parseSnapshot(current.ownHome.snapshot, false)) !==
                JSON.stringify(snapshot))
          )
            return null;
          const document = {
            _id: homeId(current.user._id),
            ownerUserId: current.user._id,
            snapshot,
            visibility: payload.visibility,
            revision: revision + 1,
            updatedAt: now,
            moderatedNameHash: options.hash(snapshot.name),
          };
          await tx.set('companion_homes', document);
          return published(document, current.user);
        }
        // Closing an unchanged accepted snapshot must remain available during provider outages.
        data =
          payload.visibility === 'private'
            ? await options.store.transaction((tx) => saveHome(tx, true))
            : null;
        if (data === null) {
          await moderate(snapshot.name, auth.openid, 1);
          data = await options.store.transaction((tx) => saveHome(tx, false));
        }
      } else if (event.action === 'getHome' || event.action === 'visitHome') {
        const targetUserId = opaqueId(payload.targetUserId);
        const candidate =
          targetUserId === auth.user._id
            ? null
            : await options.store.findFriendship(pairKey(auth.user._id, targetUserId));
        if (event.action === 'getHome') {
          data = await options.store.transaction(async (tx) => {
            const access = await targetAccess(tx, auth, targetUserId, candidate);
            return published(access.home, access.owner);
          });
        } else {
          if (targetUserId === auth.user._id) {
            throw new PublicError('SELF_VISIT', '不能把自己的访问计为好友来访');
          }
          const clientRequestId = opaqueId(payload.requestId);
          if (payload.message !== undefined && typeof payload.message !== 'string') invalid();
          const message = (payload.message ?? '').trim();
          if (points(message) > 80) invalid();
          const messageHash = options.hash(message);
          // Request receipts are independent of day so a delayed retry cannot count on the next day.
          const receiptId = `receipt_${options.hash([targetUserId, auth.user._id, clientRequestId].join('\0'))}`;
          const day = new Date(Date.parse(now) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const dayId = `day_${options.hash([targetUserId, auth.user._id, day].join('\0'))}`;
          async function receipt(tx) {
            const record = await tx.get('companion_visits', receiptId);
            if (record && record.messageHash !== messageHash) {
              throw new PublicError('REQUEST_CONFLICT', '这次来访请求已使用，请重新发送');
            }
            return record;
          }
          let replay = false;
          if (message) {
            replay = await options.store.transaction(async (tx) => {
              await targetAccess(tx, auth, targetUserId, candidate);
              return Boolean(await receipt(tx));
            });
            if (!replay) await moderate(message, auth.openid, 2);
          }
          data = replay
            ? { visited: true, duplicate: true }
            : await options.store.transaction(async (tx) => {
                const access = await targetAccess(tx, auth, targetUserId, candidate);
                if (await receipt(tx)) return { visited: true, duplicate: true };
                const previousDay = await tx.get('companion_visits', dayId);
                const messageCount = previousDay?.messageCount ?? 0;
                if (!Number.isInteger(messageCount) || messageCount < 0)
                  throw new Error('Invalid day');
                if (message && messageCount >= 3) {
                  throw new PublicError('RATE_LIMITED', '今天的留言已达三条，明天再来吧');
                }
                const base = {
                  ownerUserId: targetUserId,
                  visitorUserId: access.user._id,
                  relationshipId: access.friendship.relationshipId,
                };
                // Snapshot isolation alone does not lock reads: write the permission documents too.
                await tx.update('friendships', access.friendship._id, {
                  companionWriteFence: requestId,
                });
                await tx.update('companion_homes', access.home._id, { writeFence: requestId });
                // This private anchor also serializes authored visits against deleteMyData.
                if (access.ownHome) {
                  await tx.update('companion_homes', access.ownHome._id, { writeFence: requestId });
                } else {
                  await tx.set('companion_homes', {
                    _id: homeId(access.user._id),
                    ownerUserId: access.user._id,
                    revision: 0,
                    visibility: 'private',
                    writeFence: requestId,
                    updatedAt: now,
                  });
                }
                await tx.set('companion_visits', {
                  _id: dayId,
                  kind: 'day',
                  ...base,
                  day,
                  messageCount: messageCount + (message ? 1 : 0),
                  visitedAt: previousDay?.visitedAt ?? now,
                  updatedAt: now,
                });
                if (!previousDay || message) {
                  await tx.set('companion_visits', {
                    _id: options.newId('visit'),
                    kind: 'entry',
                    ...base,
                    message,
                    visitedAt: now,
                  });
                }
                await tx.set('companion_visits', {
                  _id: receiptId,
                  kind: 'receipt',
                  ...base,
                  messageHash,
                  day,
                  visitedAt: now,
                });
                return { visited: true, duplicate: Boolean(previousDay) && !message };
              });
        }
      } else if (event.action === 'listVisits') {
        await options.store.transaction((tx) => actor(tx, auth));
        const records = await options.store.listOwnerVisits(auth.user._id);
        const visitorIds = [
          ...new Set(
            records
              .filter((row) => ['entry', 'day'].includes(row.kind))
              .map((row) => row.visitorUserId),
          ),
        ];
        const visits = [];
        let visitorCount = 0;
        for (const visitorUserId of visitorIds) {
          const candidate = await options.store.findFriendship(
            pairKey(auth.user._id, visitorUserId),
          );
          const visible = await options.store.transaction(async (tx) => {
            await actor(tx, auth);
            const friend = await tx.get('users', visitorUserId);
            const relation = candidate?._id ? await tx.get('friendships', candidate._id) : null;
            return friend?.status === 'active' && isFriend(relation, auth.user._id, visitorUserId)
              ? { friend: profile(friend), relationshipId: relation.relationshipId }
              : null;
          });
          if (!visible) continue;
          for (const record of records) {
            if (
              record.visitorUserId !== visitorUserId ||
              record.relationshipId !== visible.relationshipId
            )
              continue;
            if (record.kind === 'day') visitorCount += 1;
            if (
              record.kind === 'entry' &&
              typeof record.message === 'string' &&
              points(record.message) <= 80 &&
              typeof record.visitedAt === 'string' &&
              Number.isFinite(Date.parse(record.visitedAt))
            ) {
              visits.push({
                id: record._id,
                visitor: visible.friend,
                message: record.message,
                visitedAt: record.visitedAt,
              });
            }
          }
        }
        visits.sort(
          (left, right) =>
            right.visitedAt.localeCompare(left.visitedAt) || left.id.localeCompare(right.id),
        );
        data = { visits, visitorCount };
      } else if (event.action === 'deleteVisit') {
        const id = opaqueId(payload.id);
        await options.store.transaction(async (tx) => {
          await actor(tx, auth, true);
          const record = await tx.get('companion_visits', id);
          if (
            record?.kind === 'entry' &&
            (record.ownerUserId === auth.user._id || record.visitorUserId === auth.user._id)
          )
            await tx.remove('companion_visits', id);
        });
        // Unknown and unauthorized IDs are intentionally indistinguishable.
        data = { deleted: true };
      } else if (event.action === 'deleteMyData') {
        await deleteData(auth, requestId, now);
        data = { deleted: true };
      }
      return { ok: true, data, requestId };
    } catch (error) {
      if (error instanceof PublicError) {
        return { ok: false, code: error.code, message: error.message, requestId };
      }
      return { ok: false, code: 'INTERNAL_ERROR', message: '小屋服务暂时不可用', requestId };
    }
  };
}

module.exports = { createCompanionHandler };
