'use strict';

class PublicError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/u.test(value)) {
    throw new PublicError('INVITE_NOT_FOUND', '邀请无效或已经失效');
  }
  return value;
}

async function resolveUser(options) {
  const context = options.getTrustedContext();
  if (!context?.APPID || !context?.OPENID) {
    throw new PublicError('UNAUTHENTICATED', '无法确认当前微信用户');
  }
  const identityHash = options.hash(`${context.APPID}\0${context.OPENID}`);
  const user = await options.store.findUserByIdentityHash(identityHash);
  if (!user) throw new PublicError('PROFILE_REQUIRED', '请先开启云端身份');
  return user;
}

function publicProfile(user) {
  return {
    userId: user._id,
    displayName: user.displayName || 'iSdu 用户',
    signature: user.signature || '',
  };
}

function pairInfo(options, leftUserId, rightUserId) {
  const [userAId, userBId] = [leftUserId, rightUserId].sort();
  return { pairKey: options.hash(`${userAId}\0${userBId}`), userAId, userBId };
}

async function friendshipView(options, currentUser, friendship) {
  const friendUserId =
    friendship.userAId === currentUser._id ? friendship.userBId : friendship.userAId;
  const friend = await options.store.getUser(friendUserId);
  if (!friend) throw new PublicError('FRIEND_UNAVAILABLE', '好友账号当前不可用');
  return {
    relationshipId: friendship.relationshipId,
    createdAt: friendship.createdAt,
    friend: publicProfile(friend),
  };
}

function createFriendHandler(options) {
  return async function handle(event) {
    const requestId = options.newRequestId();
    try {
      if (!isRecord(event) || typeof event.action !== 'string') {
        throw new PublicError('INVALID_REQUEST', '请求格式无效');
      }
      const payload = isRecord(event.payload) ? event.payload : {};
      const user = await resolveUser(options);
      const now = options.now();

      if (event.action === 'createInvite') {
        const since = new Date(Date.parse(now) - 10 * 60 * 1000).toISOString();
        if ((await options.store.countRecentInvites(user._id, since)) >= 5) {
          throw new PublicError('RATE_LIMITED', '邀请创建过于频繁，请稍后再试');
        }
        const token = options.newToken();
        const tokenHash = options.hash(token);
        const expiresAt = new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString();
        await options.store.createInvite({
          _id: options.newId('invite'),
          tokenHash,
          creatorUserId: user._id,
          expiresAt,
          usedAt: null,
          usedByUserId: null,
          createdAt: now,
        });
        return {
          ok: true,
          data: {
            token,
            expiresAt,
            sharePath: `/pages/friend-invite/index?token=${encodeURIComponent(token)}`,
          },
          requestId,
        };
      }

      if (event.action === 'resolveInvite') {
        const token = requireToken(payload.token);
        const invite = await options.store.findInvite(options.hash(token));
        if (!invite || invite.usedAt) throw new PublicError('INVITE_NOT_FOUND', '邀请无效或已使用');
        if (invite.expiresAt <= now) throw new PublicError('INVITE_EXPIRED', '邀请已经过期');
        if (invite.creatorUserId === user._id)
          throw new PublicError('SELF_INVITE', '不能接受自己的邀请');
        const inviter = await options.store.getUser(invite.creatorUserId);
        if (!inviter) throw new PublicError('INVITE_NOT_FOUND', '邀请者账号不可用');
        return {
          ok: true,
          data: { expiresAt: invite.expiresAt, inviter: publicProfile(inviter) },
          requestId,
        };
      }

      if (event.action === 'acceptInvite') {
        const token = requireToken(payload.token);
        const tokenHash = options.hash(token);
        const invite = await options.store.findInvite(tokenHash);
        if (!invite) throw new PublicError('INVITE_NOT_FOUND', '邀请无效或已经失效');
        if (invite.creatorUserId === user._id)
          throw new PublicError('SELF_INVITE', '不能接受自己的邀请');
        const pair = pairInfo(options, invite.creatorUserId, user._id);
        const relationshipId = options.newId('relationship');
        const result = await options.store.acceptInvite({
          tokenHash,
          receiverUserId: user._id,
          pairKey: pair.pairKey,
          relationshipId,
          now,
          friendship: {
            _id: options.newId('friendship'),
            ...pair,
            relationshipId,
            status: 'active',
            removedAt: null,
            createdAt: now,
            updatedAt: now,
          },
          request: {
            _id: options.newId('request'),
            requesterUserId: invite.creatorUserId,
            receiverUserId: user._id,
            status: 'accepted',
            inviteTokenHash: tokenHash,
            expiresAt: invite.expiresAt,
            createdAt: now,
            updatedAt: now,
          },
        });
        if (result.code === 'INVITE_EXPIRED') throw new PublicError(result.code, '邀请已经过期');
        if (result.code) throw new PublicError(result.code, '邀请无效或已经使用');
        return {
          ok: true,
          data: { friendship: await friendshipView(options, user, result.friendship) },
          requestId,
        };
      }

      if (event.action === 'listFriends') {
        const relationships = await options.store.listFriendships(user._id);
        const friends = [];
        for (const relationship of relationships) {
          friends.push(await friendshipView(options, user, relationship));
        }
        return { ok: true, data: { friends }, requestId };
      }

      if (event.action === 'removeFriend') {
        if (typeof payload.friendUserId !== 'string' || payload.friendUserId === user._id) {
          throw new PublicError('INVALID_INPUT', '好友标识无效');
        }
        const pair = pairInfo(options, user._id, payload.friendUserId);
        const removed = await options.store.removeFriend(pair.pairKey, user._id, now);
        if (!removed) throw new PublicError('NOT_FRIENDS', '当前好友关系不存在');
        return { ok: true, data: { removed: true }, requestId };
      }

      throw new PublicError('UNSUPPORTED_ACTION', '暂不支持这个好友操作');
    } catch (error) {
      if (error instanceof PublicError) {
        return { ok: false, code: error.code, message: error.message, requestId };
      }
      return { ok: false, code: 'INTERNAL_ERROR', message: '好友服务暂时不可用', requestId };
    }
  };
}

module.exports = { createFriendHandler };
