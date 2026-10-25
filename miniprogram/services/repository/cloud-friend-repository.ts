import {
  parseFriendListItem,
  parseFriendProfile,
  type FriendInvite,
  type FriendInvitePreview,
  type FriendListItem,
} from '../../models/cloud-friend';
import {
  wechatCloudFunctionClient,
  type CloudFunctionClient,
} from '../cloud/cloud-function-client';
import type { FriendRepository } from './friend-repository';

export class FriendRepositoryError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId = '') {
    super(message);
    this.name = 'FriendRepositoryError';
    this.code = code;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseResult<T>(value: unknown, parser: (data: unknown) => T): T {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.requestId !== 'string') {
    throw new FriendRepositoryError('INVALID_RESPONSE', '好友服务返回了无效结果');
  }
  if (!value.ok) {
    throw new FriendRepositoryError(
      typeof value.code === 'string' ? value.code : 'UNKNOWN_ERROR',
      typeof value.message === 'string' ? value.message : '好友服务请求失败',
      value.requestId,
    );
  }
  return parser(value.data);
}

export class CloudFriendRepository implements FriendRepository {
  private readonly client: CloudFunctionClient;

  constructor(client: CloudFunctionClient = wechatCloudFunctionClient) {
    this.client = client;
  }

  async createInvite(): Promise<FriendInvite> {
    const response = await this.client.call('friend-api', 'createInvite');
    return parseResult(response, (data) => {
      if (
        !isRecord(data) ||
        typeof data.token !== 'string' ||
        typeof data.sharePath !== 'string' ||
        typeof data.expiresAt !== 'string'
      ) {
        throw new FriendRepositoryError('INVALID_RESPONSE', '邀请结果格式无效');
      }
      return { token: data.token, sharePath: data.sharePath, expiresAt: data.expiresAt };
    });
  }

  async resolveInvite(token: string): Promise<FriendInvitePreview> {
    const response = await this.client.call('friend-api', 'resolveInvite', { token });
    return parseResult(response, (data) => {
      if (!isRecord(data) || typeof data.expiresAt !== 'string') {
        throw new FriendRepositoryError('INVALID_RESPONSE', '邀请预览格式无效');
      }
      return { expiresAt: data.expiresAt, inviter: parseFriendProfile(data.inviter) };
    });
  }

  async acceptInvite(token: string): Promise<FriendListItem> {
    const response = await this.client.call('friend-api', 'acceptInvite', { token });
    return parseResult(response, (data) => {
      if (!isRecord(data) || !('friendship' in data)) {
        throw new FriendRepositoryError('INVALID_RESPONSE', '接受邀请结果格式无效');
      }
      return parseFriendListItem(data.friendship);
    });
  }

  async listFriends(): Promise<FriendListItem[]> {
    const response = await this.client.call('friend-api', 'listFriends');
    return parseResult(response, (data) => {
      if (!isRecord(data) || !Array.isArray(data.friends)) {
        throw new FriendRepositoryError('INVALID_RESPONSE', '好友列表格式无效');
      }
      return data.friends.map(parseFriendListItem);
    });
  }

  async removeFriend(friendUserId: string): Promise<void> {
    const response = await this.client.call('friend-api', 'removeFriend', { friendUserId });
    parseResult(response, () => undefined);
  }
}

export const cloudFriendRepository = new CloudFriendRepository();
