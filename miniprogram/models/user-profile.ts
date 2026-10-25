export const USER_PROFILE_NAME_MAX_LENGTH = 20;
export const USER_PROFILE_SIGNATURE_MAX_LENGTH = 80;
export const USER_PROFILE_CAMPUS_MAX_LENGTH = 40;

export interface UserProfileInput {
  displayName: string;
  signature: string;
}

export interface UserProfile extends UserProfileInput {
  campusName: string;
  updatedAt: string;
}

export class UserProfileValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'UserProfileValidationError';
    this.field = field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeUserProfileInput(input: UserProfileInput): UserProfileInput {
  const displayName = input.displayName.trim().replace(/\s+/gu, ' ');
  const signature = input.signature.trim().replace(/\s+/gu, ' ');

  if (!displayName) {
    throw new UserProfileValidationError('displayName', '请为自己取一个名字');
  }

  if (displayName.length > USER_PROFILE_NAME_MAX_LENGTH) {
    throw new UserProfileValidationError(
      'displayName',
      `名字不能超过 ${USER_PROFILE_NAME_MAX_LENGTH} 字`,
    );
  }

  if (signature.length > USER_PROFILE_SIGNATURE_MAX_LENGTH) {
    throw new UserProfileValidationError(
      'signature',
      `个性签名不能超过 ${USER_PROFILE_SIGNATURE_MAX_LENGTH} 字`,
    );
  }

  return { displayName, signature };
}

export function createUserProfile(
  input: UserProfileInput,
  campusName: string,
  updatedAt: string,
): UserProfile {
  const normalized = normalizeUserProfileInput(input);
  const normalizedCampusName = campusName.trim();

  if (!normalizedCampusName || normalizedCampusName.length > USER_PROFILE_CAMPUS_MAX_LENGTH) {
    throw new UserProfileValidationError('campusName', '校区名称无效');
  }

  if (!Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString() !== updatedAt) {
    throw new UserProfileValidationError('updatedAt', '资料更新时间无效');
  }

  return {
    ...normalized,
    campusName: normalizedCampusName,
    updatedAt,
  };
}

export function parseUserProfile(value: unknown): UserProfile {
  if (!isRecord(value)) {
    throw new UserProfileValidationError('profile', '用户资料必须是对象');
  }

  if (
    typeof value.displayName !== 'string' ||
    typeof value.signature !== 'string' ||
    typeof value.campusName !== 'string' ||
    typeof value.updatedAt !== 'string'
  ) {
    throw new UserProfileValidationError('profile', '用户资料字段不完整');
  }

  return createUserProfile(
    { displayName: value.displayName, signature: value.signature },
    value.campusName,
    value.updatedAt,
  );
}
