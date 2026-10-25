export const CLOUD_USER_NAME_MAX_LENGTH = 20;
export const CLOUD_USER_SIGNATURE_MAX_LENGTH = 80;

export interface CloudUserProfile {
  readonly avatarFileId: string;
  readonly createdAt: string;
  readonly displayName: string;
  readonly signature: string;
  readonly updatedAt: string;
  readonly userId: string;
}

export interface CloudUserProfileInput {
  readonly displayName: string;
  readonly signature: string;
}

export interface AuthBootstrapResult {
  readonly isNew: boolean;
  readonly profileComplete: boolean;
  readonly user: CloudUserProfile;
}

export class CloudUserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudUserValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoDate(value: string): boolean {
  return Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function parseCloudUserProfile(value: unknown): CloudUserProfile {
  if (!isRecord(value)) {
    throw new CloudUserValidationError('云端用户资料格式错误');
  }

  const { avatarFileId, createdAt, displayName, signature, updatedAt, userId } = value;

  if (
    typeof avatarFileId !== 'string' ||
    typeof createdAt !== 'string' ||
    typeof displayName !== 'string' ||
    typeof signature !== 'string' ||
    typeof updatedAt !== 'string' ||
    typeof userId !== 'string'
  ) {
    throw new CloudUserValidationError('云端用户资料字段不完整');
  }

  if (!/^usr_[a-f0-9]{32}$/u.test(userId)) {
    throw new CloudUserValidationError('云端用户标识无效');
  }

  if (
    displayName.length > CLOUD_USER_NAME_MAX_LENGTH ||
    signature.length > CLOUD_USER_SIGNATURE_MAX_LENGTH
  ) {
    throw new CloudUserValidationError('云端用户资料长度无效');
  }

  if (!isIsoDate(createdAt) || !isIsoDate(updatedAt)) {
    throw new CloudUserValidationError('云端用户资料时间无效');
  }

  return { avatarFileId, createdAt, displayName, signature, updatedAt, userId };
}
