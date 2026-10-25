import {
  wechatCloudFunctionClient,
  type CloudFunctionClient,
} from '../cloud/cloud-function-client';
import type { LikeRepository, LikeState } from './like-repository';

export class LikeRepositoryError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId = '') {
    super(message);
    this.name = 'LikeRepositoryError';
    this.code = code;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLikeResult(value: unknown): LikeState {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.requestId !== 'string') {
    throw new LikeRepositoryError('INVALID_RESPONSE', '点赞服务返回了无效结果');
  }
  if (!value.ok) {
    throw new LikeRepositoryError(
      typeof value.code === 'string' ? value.code : 'UNKNOWN_ERROR',
      typeof value.message === 'string' ? value.message : '点赞请求失败',
      value.requestId,
    );
  }
  if (
    !isRecord(value.data) ||
    !Number.isInteger(value.data.likeCount) ||
    (value.data.likeCount as number) < 0 ||
    typeof value.data.likedByMe !== 'boolean'
  ) {
    throw new LikeRepositoryError('INVALID_RESPONSE', '点赞状态格式无效', value.requestId);
  }
  return { likeCount: value.data.likeCount as number, likedByMe: value.data.likedByMe };
}

export class CloudLikeRepository implements LikeRepository {
  private readonly client: CloudFunctionClient;

  constructor(client: CloudFunctionClient = wechatCloudFunctionClient) {
    this.client = client;
  }

  async setLiked(memoryId: string, liked: boolean): Promise<LikeState> {
    return parseLikeResult(await this.client.call('memory-api', 'setLike', { liked, memoryId }));
  }
}

export const cloudLikeRepository = new CloudLikeRepository();
