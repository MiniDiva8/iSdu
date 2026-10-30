import {
  isCompanionOpaqueId,
  parseGuestVisit,
  parseHomeSnapshot,
  parsePublishedHome,
  type CompanionHomeVisibility,
  type GuestVisit,
  type HomeSnapshot,
  type PublishedHome,
} from '../../models/companion-cloud';
import {
  wechatCloudFunctionClient,
  type CloudFunctionClient,
} from '../cloud/cloud-function-client';

export class CompanionRepositoryError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId = '') {
    super(message);
    this.name = 'CompanionRepositoryError';
    this.code = code;
    this.requestId = requestId;
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalidInput(): never {
  throw new CompanionRepositoryError('INVALID_INPUT', '小屋请求资料格式无效');
}
function invalidResponse(requestId = ''): never {
  throw new CompanionRepositoryError('INVALID_RESPONSE', '小屋服务返回了无效结果', requestId);
}
function parseResult<T>(value: unknown, parser: (data: unknown) => T): T {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !isCompanionOpaqueId(value.requestId))
    invalidResponse();
  if (!value.ok) {
    if (typeof value.code !== 'string' || !value.code || typeof value.message !== 'string') {
      invalidResponse(value.requestId);
    }
    throw new CompanionRepositoryError(value.code, value.message, value.requestId);
  }
  try {
    return parser(value.data);
  } catch {
    return invalidResponse(value.requestId);
  }
}
function requireId(value: unknown): string {
  if (!isCompanionOpaqueId(value)) invalidInput();
  return value;
}
function deleted(data: unknown): void {
  if (!isRecord(data) || data.deleted !== true) invalidResponse();
}

export class CloudCompanionRepository {
  private readonly client: CloudFunctionClient;

  constructor(client: CloudFunctionClient = wechatCloudFunctionClient) {
    this.client = client;
  }

  async getMine(): Promise<{ home: PublishedHome | null; userId: string }> {
    return parseResult(await this.client.call('companion-api', 'getMine'), (data) => {
      if (!isRecord(data) || !isCompanionOpaqueId(data.userId)) invalidResponse();
      const home = data.home === null ? null : parsePublishedHome(data.home);
      if (home && home.owner.userId !== data.userId) invalidResponse();
      return { home, userId: data.userId };
    });
  }

  async publishHome(
    snapshot: HomeSnapshot,
    visibility: CompanionHomeVisibility,
    expectedRevision: number,
  ): Promise<PublishedHome> {
    let publicSnapshot: HomeSnapshot;
    try {
      publicSnapshot = parseHomeSnapshot(snapshot);
    } catch {
      return invalidInput();
    }
    if (
      !['private', 'friends'].includes(visibility) ||
      !Number.isSafeInteger(expectedRevision) ||
      expectedRevision < 0
    )
      invalidInput();
    const response = await this.client.call('companion-api', 'publishHome', {
      snapshot: publicSnapshot,
      visibility,
      expectedRevision,
    });
    return parseResult(response, (data) => {
      const home = parsePublishedHome(data);
      if (home.revision !== expectedRevision + 1 || home.visibility !== visibility)
        invalidResponse();
      return home;
    });
  }

  async getHome(targetUserId: string): Promise<PublishedHome> {
    const response = await this.client.call('companion-api', 'getHome', {
      targetUserId: requireId(targetUserId),
    });
    return parseResult(response, (data) => {
      const home = parsePublishedHome(data);
      if (home.owner.userId !== targetUserId) invalidResponse();
      return home;
    });
  }

  async visitHome(
    targetUserId: string,
    requestId: string,
    message?: string,
  ): Promise<{ visited: true; duplicate: boolean }> {
    requireId(targetUserId);
    requireId(requestId);
    if (message !== undefined && typeof message !== 'string') invalidInput();
    const text = message?.trim();
    if (text !== undefined && Array.from(text).length > 80) invalidInput();
    const payload =
      text === undefined ? { targetUserId, requestId } : { targetUserId, requestId, message: text };
    return parseResult(await this.client.call('companion-api', 'visitHome', payload), (data) => {
      if (!isRecord(data) || data.visited !== true || typeof data.duplicate !== 'boolean') {
        invalidResponse();
      }
      return { visited: true, duplicate: data.duplicate };
    });
  }

  async listVisits(): Promise<{ visits: GuestVisit[]; visitorCount: number }> {
    return parseResult(await this.client.call('companion-api', 'listVisits'), (data) => {
      if (
        !isRecord(data) ||
        !Array.isArray(data.visits) ||
        typeof data.visitorCount !== 'number' ||
        !Number.isSafeInteger(data.visitorCount) ||
        data.visitorCount < 0
      )
        invalidResponse();
      return { visits: data.visits.map(parseGuestVisit), visitorCount: data.visitorCount };
    });
  }

  async deleteVisit(id: string): Promise<void> {
    parseResult(
      await this.client.call('companion-api', 'deleteVisit', { id: requireId(id) }),
      deleted,
    );
  }

  async deleteMyData(): Promise<void> {
    parseResult(await this.client.call('companion-api', 'deleteMyData'), deleted);
  }
}

export const cloudCompanionRepository = new CloudCompanionRepository();
