'use strict';

const MAX_IMAGES = 3;
const MAX_TEXT = 2000;
const MAX_PLACE = 60;
const VALID_VISIBILITY = new Set(['private', 'selected_friends', 'friends']);
const VALID_MOODS = new Set([
  'happy',
  'calm',
  'excited',
  'grateful',
  'relaxed',
  'nostalgic',
  'inspired',
  'proud',
  'lonely',
  'sad',
  'tired',
  'custom',
]);
const VALID_CATEGORIES = new Set([
  'campus-life',
  'friendship',
  'study',
  'nature',
  'food',
  'club',
  'event',
  'graduation',
  'custom',
]);

class PublicError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value, field, maxLength, allowEmpty = true) {
  if (typeof value !== 'string') {
    throw new PublicError('INVALID_INPUT', `${field} 格式无效`);
  }
  const normalized = value.trim();
  if ((!allowEmpty && !normalized) || normalized.length > maxLength) {
    throw new PublicError('INVALID_INPUT', `${field} 长度无效`);
  }
  return normalized;
}

function requireIso(value, field) {
  if (
    typeof value !== 'string' ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value
  ) {
    throw new PublicError('INVALID_INPUT', `${field} 时间无效`);
  }
  return value;
}

function normalizeContent(value, imageCount) {
  if (!isRecord(value)) {
    throw new PublicError('INVALID_INPUT', '回忆内容无效');
  }
  const text = requireString(value.text, '正文', MAX_TEXT);
  const placeName = requireString(value.placeName, '地点', MAX_PLACE);
  const customMood = requireString(value.customMood, '自定义心情', 20);
  const customCategory = requireString(value.customCategory, '自定义分类', 20);
  if (!VALID_MOODS.has(value.mood) || !VALID_CATEGORIES.has(value.category)) {
    throw new PublicError('INVALID_INPUT', '心情或分类无效');
  }
  if (value.mood === 'custom' && !customMood) {
    throw new PublicError('INVALID_INPUT', '请填写自定义心情');
  }
  if (value.category === 'custom' && !customCategory) {
    throw new PublicError('INVALID_INPUT', '请填写自定义分类');
  }
  if (!Number.isFinite(value.mapXRatio) || !Number.isFinite(value.mapYRatio)) {
    throw new PublicError('INVALID_INPUT', '地图坐标无效');
  }
  if (value.mapXRatio < 0 || value.mapXRatio > 1 || value.mapYRatio < 0 || value.mapYRatio > 1) {
    throw new PublicError('INVALID_INPUT', '地图坐标越界');
  }
  if (!text && imageCount === 0) {
    throw new PublicError('INVALID_INPUT', '请至少填写文字或选择照片');
  }
  return {
    text,
    placeName,
    mood: value.mood,
    customMood: value.mood === 'custom' ? customMood : '',
    category: value.category,
    customCategory: value.category === 'custom' ? customCategory : '',
    mapAssetVersion: requireString(value.mapAssetVersion, '地图版本', 80, false),
    mapXRatio: value.mapXRatio,
    mapYRatio: value.mapYRatio,
    recordedAt: requireIso(value.recordedAt, '记录'),
  };
}

function normalizeUploaded(value) {
  if (!Array.isArray(value) || value.length > MAX_IMAGES) {
    throw new PublicError('INVALID_INPUT', '上传图片数量无效');
  }
  return value.map((item) => {
    if (!isRecord(item)) {
      throw new PublicError('INVALID_INPUT', '上传图片格式无效');
    }
    return {
      fileId: requireString(item.fileId, 'fileID', 1000, false),
      imageId: requireString(item.imageId, '图片 ID', 80, false),
    };
  });
}

async function resolveUser(options) {
  const context = options.getTrustedContext();
  if (!context || !context.APPID || !context.OPENID) {
    throw new PublicError('UNAUTHENTICATED', '无法确认当前微信用户');
  }
  const identityHash = options.hash(`${context.APPID}\0${context.OPENID}`);
  const user = await options.store.findUserByIdentityHash(identityHash);
  if (!user) {
    throw new PublicError('PROFILE_REQUIRED', '请先开启云端身份');
  }
  return user;
}

async function resolveImages(options, ownerUserId, payload, now) {
  const uploaded = normalizeUploaded(payload.uploaded ?? []);
  if (uploaded.length === 0) {
    if (payload.planId) {
      throw new PublicError('INVALID_INPUT', '空图片不需要上传计划');
    }
    return [];
  }
  const planId = requireString(payload.planId, '上传计划', 80, false);
  const plan = await options.store.consumeUploadPlan(planId, ownerUserId, now);
  if (!plan || !Array.isArray(plan.files) || plan.files.length !== uploaded.length) {
    throw new PublicError('UPLOAD_PLAN_INVALID', '图片上传计划无效或已过期');
  }
  return plan.files.map((expected) => {
    const actual = uploaded.find((item) => item.imageId === expected.imageId);
    if (!actual || !actual.fileId.endsWith(`/${expected.cloudPath}`)) {
      throw new PublicError('UPLOAD_PLAN_INVALID', '上传图片与计划不匹配');
    }
    return { fileId: actual.fileId, imageId: expected.imageId };
  });
}

async function toOwnerView(options, user, memory) {
  const images = Array.isArray(memory.images) ? memory.images : [];
  const urls = await options.getTempUrls(images.map((image) => image.fileId));
  return {
    id: memory._id,
    text: memory.text,
    imagePaths: urls,
    imageIds: images.map((image) => image.imageId),
    placeName: memory.placeName,
    mood: memory.mood,
    customMood: memory.customMood,
    category: memory.category,
    customCategory: memory.customCategory,
    mapAssetVersion: memory.mapAssetVersion,
    mapXRatio: memory.mapXRatio,
    mapYRatio: memory.mapYRatio,
    recordedAt: memory.recordedAt,
    origin: 'user',
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    canEdit: true,
    likeCount: memory.likeCount ?? 0,
    likedByMe: false,
    ownerDisplayName: user.displayName || 'iSdu 用户',
    ownerUserId: user._id,
    publishedAt: memory.publishedAt ?? null,
    selectedFriendIds: Array.isArray(memory.selectedGrants)
      ? memory.selectedGrants.map((grant) => grant.friendUserId)
      : [],
    visibility: VALID_VISIBILITY.has(memory.visibility) ? memory.visibility : 'private',
  };
}

function createPairKey(options, leftUserId, rightUserId) {
  return options.hash([...new Set([leftUserId, rightUserId])].sort().join('\0'));
}

function canFriendViewMemory(memory, viewerUserId, friendship) {
  if (!friendship || memory.visibility === 'private') return false;
  if (memory.visibility === 'friends') return true;
  return (
    memory.visibility === 'selected_friends' &&
    Array.isArray(memory.selectedGrants) &&
    memory.selectedGrants.some(
      (grant) =>
        grant.friendUserId === viewerUserId && grant.relationshipId === friendship.relationshipId,
    )
  );
}

function parseMapCursor(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.publishedAt !== 'string') {
    throw new PublicError('INVALID_INPUT', '分页游标无效');
  }
  return { id: value.id, publishedAt: requireIso(value.publishedAt, '分页') };
}

function isAfterCursor(memory, cursor) {
  if (!cursor) return true;
  return (
    memory.publishedAt < cursor.publishedAt ||
    (memory.publishedAt === cursor.publishedAt && memory._id > cursor.id)
  );
}

function toFriendMapPoint(memory, owner) {
  return {
    id: memory._id,
    ownerDisplayName: owner.displayName || 'iSdu 好友',
    ownerUserId: owner._id,
    placeName: memory.placeName,
    mood: memory.mood,
    customMood: memory.customMood,
    category: memory.category,
    customCategory: memory.customCategory,
    mapAssetVersion: memory.mapAssetVersion,
    mapXRatio: memory.mapXRatio,
    mapYRatio: memory.mapYRatio,
    publishedAt: memory.publishedAt,
  };
}

function createFriendTimelineSummary(text, hasImage) {
  const normalized = typeof text === 'string' ? text.trim().replace(/\s+/gu, ' ') : '';
  if (!normalized) return hasImage ? '分享了一段照片回忆' : '分享了一段校园回忆';
  return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
}

function toFriendTimelineItem(memory, owner, thumbnailUrl) {
  const images = Array.isArray(memory.images) ? memory.images : [];
  return {
    id: memory._id,
    ownerDisplayName: owner.displayName || 'iSdu 好友',
    ownerUserId: owner._id,
    placeName: memory.placeName,
    summary: createFriendTimelineSummary(memory.text, images.length > 0),
    mood: memory.mood,
    customMood: memory.customMood,
    category: memory.category,
    customCategory: memory.customCategory,
    mapAssetVersion: memory.mapAssetVersion,
    mapXRatio: memory.mapXRatio,
    mapYRatio: memory.mapYRatio,
    recordedAt: memory.recordedAt,
    publishedAt: memory.publishedAt,
    hasImage: images.length > 0,
    thumbnailUrl,
    likeCount: Number.isInteger(memory.likeCount) && memory.likeCount >= 0 ? memory.likeCount : 0,
  };
}

async function resolveSharedMemory(options, viewer, memoryId) {
  const memory = await options.store.getMemory(memoryId);
  if (!memory || memory.ownerUserId === viewer._id) {
    throw new PublicError('VIEW_FORBIDDEN', '这段好友回忆当前不可访问');
  }
  const friendshipPairKey = createPairKey(options, viewer._id, memory.ownerUserId);
  const friendship = await options.store.getActiveFriendship(friendshipPairKey);
  if (!canFriendViewMemory(memory, viewer._id, friendship)) {
    throw new PublicError('VIEW_FORBIDDEN', '这段好友回忆当前不可访问');
  }
  return { friendship, friendshipPairKey, memory };
}

async function toSharedView(options, viewer, memory) {
  const owner = await options.store.getUser(memory.ownerUserId);
  if (!owner) throw new PublicError('VIEW_FORBIDDEN', '这段好友回忆当前不可访问');
  const images = Array.isArray(memory.images) ? memory.images : [];
  const urls = await options.getTempUrls(images.map((image) => image.fileId));
  const likePairKey = options.hash(`${memory._id}\0${viewer._id}`);
  const likedByMe = Boolean(await options.store.findLike(likePairKey));
  return {
    id: memory._id,
    text: memory.text,
    imagePaths: urls,
    imageIds: [],
    placeName: memory.placeName,
    mood: memory.mood,
    customMood: memory.customMood,
    category: memory.category,
    customCategory: memory.customCategory,
    mapAssetVersion: memory.mapAssetVersion,
    mapXRatio: memory.mapXRatio,
    mapYRatio: memory.mapYRatio,
    recordedAt: memory.recordedAt,
    origin: 'user',
    createdAt: memory.createdAt,
    updatedAt: memory.updatedAt,
    canEdit: false,
    likeCount: memory.likeCount ?? 0,
    likedByMe,
    ownerDisplayName: owner.displayName || 'iSdu 好友',
    ownerUserId: owner._id,
    publishedAt: memory.publishedAt ?? null,
    selectedFriendIds: [],
    visibility: VALID_VISIBILITY.has(memory.visibility) ? memory.visibility : 'private',
  };
}

function normalizeSelectedFriendIds(value) {
  if (!Array.isArray(value) || value.length > 100) {
    throw new PublicError('INVALID_INPUT', '部分好友选择无效');
  }
  const ids = value.map((item) => requireString(item, '好友标识', 80, false));
  if (new Set(ids).size !== ids.length) {
    throw new PublicError('INVALID_INPUT', '部分好友选择存在重复');
  }
  return ids;
}

async function buildSelectedGrants(options, ownerUserId, selectedFriendIds) {
  const relationships = await options.store.listActiveFriendships(ownerUserId);
  const byFriendId = new Map();
  for (const relationship of relationships) {
    const friendUserId =
      relationship.userAId === ownerUserId ? relationship.userBId : relationship.userAId;
    byFriendId.set(friendUserId, relationship);
  }
  return selectedFriendIds.map((friendUserId) => {
    const relationship = byFriendId.get(friendUserId);
    if (!relationship) {
      throw new PublicError('NOT_FRIENDS', '所选用户已不是你的好友，请刷新后重试');
    }
    return { friendUserId, relationshipId: relationship.relationshipId };
  });
}

function createMemoryDocument(options, user, content, images, payload, now) {
  return {
    _id: options.newId('memory'),
    ownerUserId: user._id,
    clientRequestId: requireString(
      payload.clientRequestId ?? options.newId('request'),
      '请求 ID',
      100,
    ),
    ...content,
    images,
    visibility: 'private',
    selectedGrants: [],
    publishedAt: null,
    likeCount: 0,
    schemaVersion: 2,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function createMemoryHandler(options) {
  return async function handle(event) {
    const requestId = options.newRequestId();
    try {
      if (!isRecord(event) || typeof event.action !== 'string') {
        throw new PublicError('INVALID_REQUEST', '请求格式无效');
      }
      const payload = isRecord(event.payload) ? event.payload : {};
      const user = await resolveUser(options);
      const now = options.now();

      if (event.action === 'createImageUploadPlan') {
        const imageCount = Number(payload.imageCount);
        if (!Number.isInteger(imageCount) || imageCount < 1 || imageCount > MAX_IMAGES) {
          throw new PublicError('INVALID_INPUT', '图片数量无效');
        }
        const uploadAllowed = await options.store.consumeRateLimit(
          user._id,
          'uploadPlan',
          now,
          10 * 60 * 1000,
          20,
        );
        if (!uploadAllowed) {
          throw new PublicError('RATE_LIMITED', '图片上传请求过于频繁，请稍后再试');
        }
        const planId = options.newId('upload');
        const expiresAt = new Date(Date.parse(now) + 10 * 60 * 1000).toISOString();
        const files = Array.from({ length: imageCount }, () => {
          const imageId = options.newId('image');
          return {
            imageId,
            cloudPath: `users/${user._id}/memories/${planId}/${imageId}.jpg`,
          };
        });
        await options.store.createUploadPlan({
          _id: planId,
          ownerUserId: user._id,
          files,
          expiresAt,
          usedAt: null,
          createdAt: now,
        });
        return { ok: true, data: { planId, expiresAt, files }, requestId };
      }

      if (event.action === 'migrate') {
        const localMemoryId = requireString(payload.sourceLocalMemoryId, '本地回忆 ID', 100, false);
        const migrationKey = options.hash(`${user._id}\0${localMemoryId}`);
        const existing = await options.store.findMigration(migrationKey);
        if (existing) {
          return {
            ok: true,
            data: { cloudMemoryId: existing.cloudMemoryId, localMemoryId, status: 'existing' },
            requestId,
          };
        }
        const images = await resolveImages(options, user._id, payload, now);
        const content = normalizeContent(payload.content, images.length);
        const timestamps = isRecord(payload.localTimestamps) ? payload.localTimestamps : {};
        const memory = createMemoryDocument(
          options,
          user,
          content,
          images,
          { clientRequestId: localMemoryId },
          now,
        );
        memory.createdAt = requireIso(timestamps.createdAt, '创建');
        memory.updatedAt = requireIso(timestamps.updatedAt, '更新');
        const result = await options.store.createMigratedMemory(memory, {
          _id: options.newId('migration'),
          migrationKey,
          ownerUserId: user._id,
          sourceLocalMemoryId: localMemoryId,
          cloudMemoryId: memory._id,
          createdAt: now,
        });
        return {
          ok: true,
          data: { cloudMemoryId: result.memoryId, localMemoryId, status: result.status },
          requestId,
        };
      }

      if (event.action === 'create') {
        const images = await resolveImages(options, user._id, payload, now);
        const content = normalizeContent(payload.content, images.length);
        const memory = createMemoryDocument(options, user, content, images, payload, now);
        const created = await options.store.createMemory(memory);
        return { ok: true, data: { memory: await toOwnerView(options, user, created) }, requestId };
      }

      if (event.action === 'listMine') {
        const items = await options.store.listMine(user._id);
        const views = [];
        for (const item of items) {
          views.push(await toOwnerView(options, user, item));
        }
        return { ok: true, data: { memories: views }, requestId };
      }

      if (event.action === 'getMineById') {
        const memoryId = requireString(payload.memoryId, '回忆 ID', 80, false);
        const memory = await options.store.getMine(user._id, memoryId);
        if (!memory) {
          throw new PublicError('NOT_FOUND', '没有找到这段云端回忆');
        }
        return { ok: true, data: { memory: await toOwnerView(options, user, memory) }, requestId };
      }

      if (event.action === 'setVisibility') {
        const memoryId = requireString(payload.memoryId, '回忆 ID', 80, false);
        const visibility = payload.visibility;
        if (!VALID_VISIBILITY.has(visibility)) {
          throw new PublicError('INVALID_INPUT', '可见范围无效');
        }
        const current = await options.store.getMine(user._id, memoryId);
        if (!current) throw new PublicError('NOT_FOUND', '没有找到这段云端回忆');

        const selectedFriendIds = normalizeSelectedFriendIds(payload.selectedFriendIds ?? []);
        if (visibility === 'selected_friends' && selectedFriendIds.length === 0) {
          throw new PublicError('FRIEND_SELECTION_REQUIRED', '部分好友可见至少需要选择一位好友');
        }
        const selectedGrants =
          visibility === 'selected_friends'
            ? await buildSelectedGrants(options, user._id, selectedFriendIds)
            : [];
        const publishedAt =
          visibility !== 'private' && !current.publishedAt ? now : (current.publishedAt ?? null);
        const updated = await options.store.updateMine(user._id, memoryId, {
          visibility,
          selectedGrants,
          publishedAt,
          updatedAt: now,
        });
        return {
          ok: true,
          data: { memory: await toOwnerView(options, user, updated) },
          requestId,
        };
      }

      if (event.action === 'getSharedById') {
        const memoryId = requireString(payload.memoryId, '回忆 ID', 80, false);
        const { memory } = await resolveSharedMemory(options, user, memoryId);
        return {
          ok: true,
          data: { memory: await toSharedView(options, user, memory) },
          requestId,
        };
      }

      if (event.action === 'setLike') {
        const memoryId = requireString(payload.memoryId, '回忆 ID', 80, false);
        if (typeof payload.liked !== 'boolean') {
          throw new PublicError('INVALID_INPUT', '点赞状态无效');
        }
        const { friendshipPairKey } = await resolveSharedMemory(options, user, memoryId);
        const likeAllowed = await options.store.consumeRateLimit(
          user._id,
          'like',
          now,
          60 * 1000,
          60,
        );
        if (!likeAllowed) {
          throw new PublicError('RATE_LIMITED', '点赞操作过于频繁，请稍后再试');
        }
        const result = await options.store.setLikeState({
          friendshipPairKey,
          likeId: options.newId('like'),
          likePairKey: options.hash(`${memoryId}\0${user._id}`),
          liked: payload.liked,
          memoryId,
          now,
          userId: user._id,
        });
        if (result.code) throw new PublicError('VIEW_FORBIDDEN', '这段好友回忆当前不可点赞');
        return { ok: true, data: result, requestId };
      }

      if (event.action === 'listFriendRecentMap') {
        const mapAssetVersion = requireString(payload.mapAssetVersion, '地图版本', 80, false);
        const cursor = parseMapCursor(payload.cursor);
        const friendships = await options.store.listActiveFriendships(user._id);
        const relationshipByOwner = new Map();
        for (const friendship of friendships) {
          const friendUserId =
            friendship.userAId === user._id ? friendship.userBId : friendship.userAId;
          relationshipByOwner.set(friendUserId, friendship);
        }
        const ownerIds = [...relationshipByOwner.keys()];
        const since = new Date(Date.parse(now) - 24 * 60 * 60 * 1000).toISOString();
        const candidates = [];
        for (let index = 0; index < ownerIds.length; index += 20) {
          candidates.push(
            ...(await options.store.listRecentMemoriesByOwners(
              ownerIds.slice(index, index + 20),
              since,
            )),
          );
        }
        const allowed = candidates
          .filter(
            (memory) =>
              memory.publishedAt >= since &&
              memory.mapAssetVersion === mapAssetVersion &&
              Number.isFinite(memory.mapXRatio) &&
              memory.mapXRatio >= 0 &&
              memory.mapXRatio <= 1 &&
              Number.isFinite(memory.mapYRatio) &&
              memory.mapYRatio >= 0 &&
              memory.mapYRatio <= 1 &&
              canFriendViewMemory(memory, user._id, relationshipByOwner.get(memory.ownerUserId)),
          )
          .sort(
            (left, right) =>
              right.publishedAt.localeCompare(left.publishedAt) ||
              left._id.localeCompare(right._id),
          )
          .filter((memory) => isAfterCursor(memory, cursor));
        const page = allowed.slice(0, 50);
        const points = [];
        for (const memory of page) {
          const owner = await options.store.getUser(memory.ownerUserId);
          if (owner) points.push(toFriendMapPoint(memory, owner));
        }
        const last = allowed.length > page.length ? page[page.length - 1] : null;
        return {
          ok: true,
          data: {
            nextCursor: last ? { id: last._id, publishedAt: last.publishedAt } : null,
            points,
          },
          requestId,
        };
      }

      if (event.action === 'listFriendTimeline') {
        const cursor = parseMapCursor(payload.cursor);
        const friendships = await options.store.listActiveFriendships(user._id);
        const relationshipByOwner = new Map();
        for (const friendship of friendships) {
          const friendUserId =
            friendship.userAId === user._id ? friendship.userBId : friendship.userAId;
          relationshipByOwner.set(friendUserId, friendship);
        }
        const ownerIds = [...relationshipByOwner.keys()];
        const candidates = [];
        for (let index = 0; index < ownerIds.length; index += 20) {
          candidates.push(
            ...(await options.store.listRecentMemoriesByOwners(
              ownerIds.slice(index, index + 20),
              '1970-01-01T00:00:00.000Z',
              cursor?.publishedAt ?? now,
            )),
          );
        }
        const allowed = candidates
          .filter(
            (memory) =>
              typeof memory.publishedAt === 'string' &&
              Number.isFinite(Date.parse(memory.publishedAt)) &&
              canFriendViewMemory(memory, user._id, relationshipByOwner.get(memory.ownerUserId)),
          )
          .sort(
            (left, right) =>
              right.publishedAt.localeCompare(left.publishedAt) ||
              left._id.localeCompare(right._id),
          )
          .filter((memory) => isAfterCursor(memory, cursor));
        const page = allowed.slice(0, 20);
        const ownerById = new Map();
        for (const ownerUserId of [...new Set(page.map((memory) => memory.ownerUserId))]) {
          const owner = await options.store.getUser(ownerUserId);
          if (owner) ownerById.set(ownerUserId, owner);
        }
        const thumbnailFileIds = page.map((memory) => {
          const images = Array.isArray(memory.images) ? memory.images : [];
          return images[0]?.fileId ?? '';
        });
        const signedIndexes = [];
        const signedFileIds = [];
        thumbnailFileIds.forEach((fileId, index) => {
          if (fileId) {
            signedIndexes.push(index);
            signedFileIds.push(fileId);
          }
        });
        const signedUrls = signedFileIds.length > 0 ? await options.getTempUrls(signedFileIds) : [];
        const thumbnailUrls = page.map(() => '');
        signedIndexes.forEach((pageIndex, signedIndex) => {
          thumbnailUrls[pageIndex] = signedUrls[signedIndex] ?? '';
        });
        const items = page
          .map((memory, index) => {
            const owner = ownerById.get(memory.ownerUserId);
            return owner ? toFriendTimelineItem(memory, owner, thumbnailUrls[index]) : null;
          })
          .filter(Boolean);
        const last = allowed.length > page.length ? page[page.length - 1] : null;
        return {
          ok: true,
          data: {
            items,
            nextCursor: last ? { id: last._id, publishedAt: last.publishedAt } : null,
          },
          requestId,
        };
      }

      if (event.action === 'update') {
        const memoryId = requireString(payload.memoryId, '回忆 ID', 80, false);
        const current = await options.store.getMine(user._id, memoryId);
        if (!current) {
          throw new PublicError('NOT_FOUND', '没有找到这段云端回忆');
        }
        const keepIds = Array.isArray(payload.keepImageIds) ? payload.keepImageIds : [];
        if (keepIds.some((id) => typeof id !== 'string')) {
          throw new PublicError('INVALID_INPUT', '保留图片列表无效');
        }
        const kept = current.images.filter((image) => keepIds.includes(image.imageId));
        const added = await resolveImages(options, user._id, payload, now);
        const images = [...kept, ...added];
        if (images.length > MAX_IMAGES) {
          throw new PublicError('INVALID_INPUT', '照片不能超过 3 张');
        }
        const content = normalizeContent(payload.content, images.length);
        const updated = await options.store.updateMine(user._id, memoryId, {
          ...content,
          images,
          updatedAt: now,
        });
        return { ok: true, data: { memory: await toOwnerView(options, user, updated) }, requestId };
      }

      if (event.action === 'delete' || event.action === 'clearMine') {
        const removed =
          event.action === 'delete'
            ? [
                await options.store.deleteMine(
                  user._id,
                  requireString(payload.memoryId, '回忆 ID', 80, false),
                  now,
                ),
              ].filter(Boolean)
            : await options.store.clearMine(user._id, now);
        if (event.action === 'delete' && removed.length === 0) {
          throw new PublicError('NOT_FOUND', '没有找到这段云端回忆');
        }
        const fileIds = removed.flatMap((item) => item.images.map((image) => image.fileId));
        try {
          await options.deleteFiles(fileIds);
        } catch {
          return {
            ok: true,
            data: { cleanupWarning: true, deletedCount: removed.length },
            requestId,
          };
        }
        return {
          ok: true,
          data: { cleanupWarning: false, deletedCount: removed.length },
          requestId,
        };
      }

      throw new PublicError('UNSUPPORTED_ACTION', '暂不支持这个云端回忆操作');
    } catch (error) {
      if (error instanceof PublicError) {
        return { ok: false, code: error.code, message: error.message, requestId };
      }
      return { ok: false, code: 'INTERNAL_ERROR', message: '云端回忆服务暂时不可用', requestId };
    }
  };
}

module.exports = { createMemoryHandler };
