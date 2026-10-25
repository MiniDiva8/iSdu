'use strict';

const USER_NAME_MAX_LENGTH = 20;
const USER_SIGNATURE_MAX_LENGTH = 80;

class PublicAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PublicAuthError';
    this.code = code;
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTrustedValue(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : '';
}

function normalizeProfileInput(payload) {
  if (!isRecord(payload)) {
    throw new PublicAuthError('INVALID_INPUT', '用户资料格式无效');
  }

  const displayName =
    typeof payload.displayName === 'string' ? payload.displayName.trim().replace(/\s+/gu, ' ') : '';
  const signature =
    typeof payload.signature === 'string' ? payload.signature.trim().replace(/\s+/gu, ' ') : '';

  if (!displayName) {
    throw new PublicAuthError('INVALID_DISPLAY_NAME', '请填写名字');
  }

  if (displayName.length > USER_NAME_MAX_LENGTH) {
    throw new PublicAuthError('INVALID_DISPLAY_NAME', `名字不能超过 ${USER_NAME_MAX_LENGTH} 字`);
  }

  if (signature.length > USER_SIGNATURE_MAX_LENGTH) {
    throw new PublicAuthError(
      'INVALID_SIGNATURE',
      `个性签名不能超过 ${USER_SIGNATURE_MAX_LENGTH} 字`,
    );
  }

  return { displayName, signature };
}

function assertStoredUser(user) {
  if (!isRecord(user) || typeof user.userId !== 'string' || typeof user.status !== 'string') {
    throw new Error('Stored user is invalid');
  }

  if (user.status !== 'active') {
    throw new PublicAuthError('ACCOUNT_DISABLED', '当前账号暂时不可用');
  }

  return user;
}

function toPublicUser(user) {
  return {
    avatarFileId: typeof user.avatarFileId === 'string' ? user.avatarFileId : '',
    createdAt: user.createdAt,
    displayName: user.displayName,
    signature: user.signature,
    updatedAt: user.updatedAt,
    userId: user.userId,
  };
}

function success(data, requestId) {
  return { ok: true, data, requestId };
}

function failure(error, requestId) {
  if (error instanceof PublicAuthError) {
    return { ok: false, code: error.code, message: error.message, requestId };
  }

  return {
    ok: false,
    code: 'INTERNAL_ERROR',
    message: '云端身份服务暂时不可用，请稍后重试',
    requestId,
  };
}

function createAuthHandler(dependencies) {
  const { deleteFiles, getTrustedContext, hashIdentity, newRequestId, newUserId, now, userStore } =
    dependencies;

  async function findRequiredUser(identityHash) {
    const user = await userStore.findByIdentityHash(identityHash);

    if (!user) {
      throw new PublicAuthError('USER_NOT_INITIALIZED', '请先完成云端身份初始化');
    }

    return assertStoredUser(user);
  }

  async function bootstrap(identityHash) {
    const existing = await userStore.findByIdentityHash(identityHash);

    if (existing) {
      const user = assertStoredUser(existing);
      return {
        isNew: false,
        profileComplete: Boolean(user.displayName),
        user: toPublicUser(user),
      };
    }

    const timestamp = now();
    const user = {
      avatarFileId: '',
      createdAt: timestamp,
      displayName: '',
      identityHash,
      schemaVersion: 1,
      signature: '',
      status: 'active',
      updatedAt: timestamp,
      userId: newUserId(),
    };

    try {
      await userStore.create(user);
      return { isNew: true, profileComplete: false, user: toPublicUser(user) };
    } catch (error) {
      const concurrent = await userStore.findByIdentityHash(identityHash);
      if (!concurrent) {
        throw error;
      }

      const resolved = assertStoredUser(concurrent);
      return {
        isNew: false,
        profileComplete: Boolean(resolved.displayName),
        user: toPublicUser(resolved),
      };
    }
  }

  return async function handleAuthRequest(event) {
    const requestId = newRequestId();

    try {
      const trustedContext = getTrustedContext();
      const appId = normalizeTrustedValue(trustedContext && trustedContext.APPID);
      const openId = normalizeTrustedValue(trustedContext && trustedContext.OPENID);

      if (!appId || !openId) {
        throw new PublicAuthError('AUTH_CONTEXT_MISSING', '无法确认当前微信身份');
      }

      const identityHash = hashIdentity(appId, openId);
      if (!/^[a-f0-9]{64}$/u.test(identityHash)) {
        throw new Error('Identity hash is invalid');
      }

      const action = isRecord(event) && typeof event.action === 'string' ? event.action : '';
      const payload = isRecord(event) && 'payload' in event ? event.payload : {};

      if (action === 'bootstrap') {
        return success(await bootstrap(identityHash), requestId);
      }

      if (action === 'getMyProfile') {
        const user = await findRequiredUser(identityHash);
        return success({ user: toPublicUser(user) }, requestId);
      }

      if (action === 'updateMyProfile') {
        const user = await findRequiredUser(identityHash);
        const profile = normalizeProfileInput(payload);
        const updatedAt = now();
        await userStore.updateProfile(user.userId, { ...profile, updatedAt });
        return success({ user: toPublicUser({ ...user, ...profile, updatedAt }) }, requestId);
      }

      if (action === 'deleteCloudAccount') {
        const user = await findRequiredUser(identityHash);
        if (!isRecord(payload) || payload.confirmation !== 'DELETE_MY_CLOUD_DATA') {
          throw new PublicAuthError('CONFIRMATION_REQUIRED', '请再次确认删除全部云端数据');
        }
        const deletion = await userStore.deleteAccount(user.userId);
        let orphanFileCount = 0;
        if (deletion.fileIds.length > 0) {
          try {
            await deleteFiles(deletion.fileIds);
          } catch {
            orphanFileCount = deletion.fileIds.length;
          }
        }
        return success({ deleted: true, orphanFileCount }, requestId);
      }

      throw new PublicAuthError('UNSUPPORTED_ACTION', '不支持的身份操作');
    } catch (error) {
      return failure(error, requestId);
    }
  };
}

module.exports = {
  PublicAuthError,
  createAuthHandler,
  normalizeProfileInput,
};
