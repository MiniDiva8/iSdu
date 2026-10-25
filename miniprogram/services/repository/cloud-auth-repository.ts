import {
  parseCloudUserProfile,
  type AuthBootstrapResult,
  type CloudUserProfile,
  type CloudUserProfileInput,
} from '../../models/cloud-user';
import {
  wechatCloudFunctionClient,
  type CloudFunctionClient,
} from '../cloud/cloud-function-client';
import type { AuthRepository } from './auth-repository';

interface CloudSuccess<T> {
  readonly data: T;
  readonly ok: true;
  readonly requestId: string;
}

interface CloudFailure {
  readonly code: string;
  readonly message: string;
  readonly ok: false;
  readonly requestId: string;
}

export class CloudAuthRepositoryError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId = '') {
    super(message);
    this.name = 'CloudAuthRepositoryError';
    this.code = code;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseCloudResponse<T>(value: unknown, parseData: (data: unknown) => T): CloudSuccess<T> {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.requestId !== 'string') {
    throw new CloudAuthRepositoryError('INVALID_RESPONSE', '云端身份服务返回了无效结果');
  }

  if (!value.ok) {
    const failure = value as unknown as CloudFailure;
    const code = typeof failure.code === 'string' ? failure.code : 'UNKNOWN_ERROR';
    const message = typeof failure.message === 'string' ? failure.message : '云端身份服务请求失败';
    throw new CloudAuthRepositoryError(code, message, value.requestId);
  }

  if (!('data' in value)) {
    throw new CloudAuthRepositoryError('INVALID_RESPONSE', '云端身份服务缺少返回数据');
  }

  return {
    data: parseData(value.data),
    ok: true,
    requestId: value.requestId,
  };
}

function parseBootstrapData(value: unknown): AuthBootstrapResult {
  if (
    !isRecord(value) ||
    typeof value.isNew !== 'boolean' ||
    typeof value.profileComplete !== 'boolean'
  ) {
    throw new CloudAuthRepositoryError('INVALID_RESPONSE', '云端登录结果格式错误');
  }

  return {
    isNew: value.isNew,
    profileComplete: value.profileComplete,
    user: parseCloudUserProfile(value.user),
  };
}

function parseProfileData(value: unknown): CloudUserProfile {
  if (!isRecord(value) || !('user' in value)) {
    throw new CloudAuthRepositoryError('INVALID_RESPONSE', '云端用户资料格式错误');
  }

  return parseCloudUserProfile(value.user);
}

function parseDeletionData(value: unknown): {
  readonly deleted: true;
  readonly orphanFileCount: number;
} {
  if (
    !isRecord(value) ||
    value.deleted !== true ||
    !Number.isInteger(value.orphanFileCount) ||
    (value.orphanFileCount as number) < 0
  ) {
    throw new CloudAuthRepositoryError('INVALID_RESPONSE', '云端数据删除结果格式错误');
  }
  return { deleted: true, orphanFileCount: value.orphanFileCount as number };
}

export class CloudAuthRepository implements AuthRepository {
  private readonly client: CloudFunctionClient;

  constructor(client: CloudFunctionClient = wechatCloudFunctionClient) {
    this.client = client;
  }

  async bootstrap(): Promise<AuthBootstrapResult> {
    const response = await this.client.call('auth-api', 'bootstrap');
    return parseCloudResponse(response, parseBootstrapData).data;
  }

  async deleteCloudAccount(): Promise<{
    readonly deleted: true;
    readonly orphanFileCount: number;
  }> {
    const response = await this.client.call('auth-api', 'deleteCloudAccount', {
      confirmation: 'DELETE_MY_CLOUD_DATA',
    });
    return parseCloudResponse(response, parseDeletionData).data;
  }

  async getMyProfile(): Promise<CloudUserProfile> {
    const response = await this.client.call('auth-api', 'getMyProfile');
    return parseCloudResponse(response, parseProfileData).data;
  }

  async updateMyProfile(input: CloudUserProfileInput): Promise<CloudUserProfile> {
    const response = await this.client.call('auth-api', 'updateMyProfile', {
      displayName: input.displayName,
      signature: input.signature,
    });
    return parseCloudResponse(response, parseProfileData).data;
  }
}

export const cloudAuthRepository = new CloudAuthRepository();
