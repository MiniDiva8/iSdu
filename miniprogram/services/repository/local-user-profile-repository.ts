import { campusMapConfig } from '../../config/campus-map';
import {
  createUserProfile,
  parseUserProfile,
  type UserProfile,
  type UserProfileInput,
} from '../../models/user-profile';
import { wechatStorageAdapter, type StorageAdapter } from './storage-adapter';

export const USER_PROFILE_STORAGE_KEY = 'sdu-memory:user-profile:v1';
const USER_PROFILE_SCHEMA_VERSION = 1;

interface UserProfileSnapshot {
  profile: UserProfile;
  schemaVersion: typeof USER_PROFILE_SCHEMA_VERSION;
}

export class UserProfileRepositoryError extends Error {
  readonly code: 'CORRUPT_DATA' | 'READ_FAILED' | 'WRITE_FAILED';

  constructor(code: UserProfileRepositoryError['code'], message: string) {
    super(message);
    this.name = 'UserProfileRepositoryError';
    this.code = code;
  }
}

export function parseUserProfileStorage(value: unknown): UserProfile {
  if (typeof value !== 'string' || !value.trim()) {
    throw new UserProfileRepositoryError('CORRUPT_DATA', '本地用户资料为空或格式错误');
  }

  let snapshot: unknown;

  try {
    snapshot = JSON.parse(value) as unknown;
  } catch {
    throw new UserProfileRepositoryError('CORRUPT_DATA', '本地用户资料无法解析');
  }

  if (
    typeof snapshot !== 'object' ||
    snapshot === null ||
    !('schemaVersion' in snapshot) ||
    snapshot.schemaVersion !== USER_PROFILE_SCHEMA_VERSION ||
    !('profile' in snapshot)
  ) {
    throw new UserProfileRepositoryError('CORRUPT_DATA', '本地用户资料版本不受支持');
  }

  try {
    return parseUserProfile(snapshot.profile);
  } catch {
    throw new UserProfileRepositoryError('CORRUPT_DATA', '本地用户资料内容损坏');
  }
}

export class LocalUserProfileRepository {
  private readonly campusName: string;
  private readonly now: () => string;
  private readonly storage: StorageAdapter;

  constructor(
    storage: StorageAdapter = wechatStorageAdapter,
    now: () => string = () => new Date().toISOString(),
    campusName: string = campusMapConfig.displayName,
  ) {
    this.storage = storage;
    this.now = now;
    this.campusName = campusName;
  }

  getProfile(): Promise<UserProfile | null> {
    return Promise.resolve().then(() => {
      try {
        if (!this.storage.has(USER_PROFILE_STORAGE_KEY)) {
          return null;
        }

        const storedProfile = parseUserProfileStorage(this.storage.read(USER_PROFILE_STORAGE_KEY));
        return { ...storedProfile, campusName: this.campusName };
      } catch (error) {
        if (error instanceof UserProfileRepositoryError) {
          throw error;
        }

        throw new UserProfileRepositoryError('READ_FAILED', '读取本地用户资料失败');
      }
    });
  }

  saveProfile(input: UserProfileInput): Promise<UserProfile> {
    return Promise.resolve().then(() => {
      const profile = createUserProfile(input, this.campusName, this.now());
      const snapshot: UserProfileSnapshot = {
        profile,
        schemaVersion: USER_PROFILE_SCHEMA_VERSION,
      };

      try {
        this.storage.write(USER_PROFILE_STORAGE_KEY, JSON.stringify(snapshot));
        return profile;
      } catch {
        throw new UserProfileRepositoryError('WRITE_FAILED', '保存本地用户资料失败');
      }
    });
  }
}

export const localUserProfileRepository = new LocalUserProfileRepository();
