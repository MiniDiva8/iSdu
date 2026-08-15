import {
  parseCloudMemory,
  toCloudMemoryInput,
  type CloudImageUploadPlan,
  type CloudMemory,
  type MigrationItemResult,
  type UploadedCloudImage,
  type MemoryVisibility,
} from '../../models/cloud-memory';
import {
  normalizeCreateMemoryInput,
  normalizeMemoryContent,
  type CreateMemoryInput,
  type Memory,
  type UpdateMemoryInput,
} from '../../models/memory';
import { cloudImageService, type CloudImageServiceApi } from '../cloud/cloud-image-service';
import {
  wechatCloudFunctionClient,
  type CloudFunctionClient,
} from '../cloud/cloud-function-client';
import type { MemoryRepository } from './memory-repository';

export class CloudMemoryRepositoryError extends Error {
  readonly code: string;
  readonly requestId: string;

  constructor(code: string, message: string, requestId = '') {
    super(message);
    this.name = 'CloudMemoryRepositoryError';
    this.code = code;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseResult<T>(value: unknown, parser: (data: unknown) => T): T {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || typeof value.requestId !== 'string') {
    throw new CloudMemoryRepositoryError('INVALID_RESPONSE', '云端回忆服务返回了无效结果');
  }

  if (!value.ok) {
    throw new CloudMemoryRepositoryError(
      typeof value.code === 'string' ? value.code : 'UNKNOWN_ERROR',
      typeof value.message === 'string' ? value.message : '云端回忆请求失败',
      value.requestId,
    );
  }

  return parser(value.data);
}

function parseMemoryData(value: unknown): CloudMemory {
  if (!isRecord(value) || !('memory' in value)) {
    throw new CloudMemoryRepositoryError('INVALID_RESPONSE', '云端回忆结果缺少数据');
  }
  return parseCloudMemory(value.memory);
}

function parseMemoryList(value: unknown): CloudMemory[] {
  if (!isRecord(value) || !Array.isArray(value.memories)) {
    throw new CloudMemoryRepositoryError('INVALID_RESPONSE', '云端回忆列表格式无效');
  }
  return value.memories.map(parseCloudMemory);
}

function parseUploadPlan(value: unknown): CloudImageUploadPlan {
  if (
    !isRecord(value) ||
    typeof value.planId !== 'string' ||
    typeof value.expiresAt !== 'string' ||
    !Array.isArray(value.files)
  ) {
    throw new CloudMemoryRepositoryError('INVALID_RESPONSE', '云端图片上传计划格式无效');
  }

  const files = value.files.map((file) => {
    if (!isRecord(file) || typeof file.cloudPath !== 'string' || typeof file.imageId !== 'string') {
      throw new CloudMemoryRepositoryError('INVALID_RESPONSE', '云端图片上传目标格式无效');
    }
    return { cloudPath: file.cloudPath, imageId: file.imageId };
  });

  return { expiresAt: value.expiresAt, files, planId: value.planId };
}

function parseMigrationResult(value: unknown): MigrationItemResult {
  if (
    !isRecord(value) ||
    typeof value.cloudMemoryId !== 'string' ||
    typeof value.localMemoryId !== 'string' ||
    (value.status !== 'created' && value.status !== 'existing')
  ) {
    throw new CloudMemoryRepositoryError('INVALID_RESPONSE', '云端迁移结果格式无效');
  }
  return {
    cloudMemoryId: value.cloudMemoryId,
    localMemoryId: value.localMemoryId,
    status: value.status,
  };
}

export class CloudMemoryRepository implements MemoryRepository {
  private readonly client: CloudFunctionClient;
  private readonly imageIdsByMemory = new Map<string, Map<string, string>>();
  private readonly images: CloudImageServiceApi;

  constructor(
    client: CloudFunctionClient = wechatCloudFunctionClient,
    images: CloudImageServiceApi = cloudImageService,
  ) {
    this.client = client;
    this.images = images;
  }

  async listMemories(): Promise<Memory[]> {
    const response = await this.client.call('memory-api', 'listMine');
    const memories = parseResult(response, parseMemoryList);
    memories.forEach((memory) => this.cacheImages(memory));
    return memories;
  }

  async getMemoryById(id: string): Promise<Memory | null> {
    const response = await this.client.call('memory-api', 'getMineById', { memoryId: id });
    if (isRecord(response) && response.ok === false && response.code === 'NOT_FOUND') {
      return null;
    }
    const memory = parseResult(response, parseMemoryData);
    this.cacheImages(memory);
    return memory;
  }

  async getSharedMemoryById(id: string): Promise<CloudMemory> {
    const response = await this.client.call('memory-api', 'getSharedById', { memoryId: id });
    return parseResult(response, parseMemoryData);
  }

  async createMemory(input: CreateMemoryInput): Promise<Memory> {
    const normalized = normalizeCreateMemoryInput(input);
    const upload = await this.uploadNewImages(normalized.imagePaths, normalized.id);
    const response = await this.client.call('memory-api', 'create', {
      clientRequestId: normalized.id,
      content: toCloudMemoryInput({
        ...normalized,
        origin: 'user',
        createdAt: normalized.recordedAt,
        updatedAt: normalized.recordedAt,
      }),
      planId: upload.planId,
      uploaded: upload.uploaded,
    });
    const memory = parseResult(response, parseMemoryData);
    this.cacheImages(memory);
    return memory;
  }

  async updateMemory(id: string, input: UpdateMemoryInput): Promise<Memory> {
    const normalized = normalizeMemoryContent(input);
    const cache = this.imageIdsByMemory.get(id) ?? new Map<string, string>();
    const keepImageIds: string[] = [];
    const newImagePaths: string[] = [];

    normalized.imagePaths.forEach((path) => {
      const imageId = cache.get(path);
      if (imageId) {
        keepImageIds.push(imageId);
      } else {
        newImagePaths.push(path);
      }
    });

    const upload = await this.uploadNewImages(newImagePaths, id);
    const response = await this.client.call('memory-api', 'update', {
      content: {
        category: normalized.category,
        customCategory: normalized.customCategory,
        customMood: normalized.customMood,
        mapAssetVersion: normalized.mapAssetVersion,
        mapXRatio: normalized.mapXRatio,
        mapYRatio: normalized.mapYRatio,
        mood: normalized.mood,
        placeName: normalized.placeName,
        recordedAt: normalized.recordedAt,
        text: normalized.text,
      },
      keepImageIds,
      memoryId: id,
      planId: upload.planId,
      uploaded: upload.uploaded,
    });
    const memory = parseResult(response, parseMemoryData);
    this.cacheImages(memory);
    return memory;
  }

  async deleteMemory(id: string): Promise<void> {
    const response = await this.client.call('memory-api', 'delete', { memoryId: id });
    parseResult(response, () => undefined);
    this.imageIdsByMemory.delete(id);
  }

  async clearMemories(): Promise<void> {
    const response = await this.client.call('memory-api', 'clearMine');
    parseResult(response, () => undefined);
    this.imageIdsByMemory.clear();
  }

  async setVisibility(
    memoryId: string,
    visibility: MemoryVisibility,
    selectedFriendIds: readonly string[] = [],
  ): Promise<CloudMemory> {
    const response = await this.client.call('memory-api', 'setVisibility', {
      memoryId,
      selectedFriendIds: [...selectedFriendIds],
      visibility,
    });
    const memory = parseResult(response, parseMemoryData);
    this.cacheImages(memory);
    return memory;
  }

  async migrateMemory(memory: Memory): Promise<MigrationItemResult> {
    const upload = await this.uploadNewImages(memory.imagePaths, memory.id);
    const response = await this.client.call('memory-api', 'migrate', {
      content: toCloudMemoryInput(memory),
      localTimestamps: { createdAt: memory.createdAt, updatedAt: memory.updatedAt },
      sourceLocalMemoryId: memory.id,
      planId: upload.planId,
      uploaded: upload.uploaded,
    });
    return parseResult(response, parseMigrationResult);
  }

  private async uploadNewImages(
    imagePaths: readonly string[],
    operationId: string,
  ): Promise<{ readonly planId: string; readonly uploaded: UploadedCloudImage[] }> {
    if (imagePaths.length === 0) {
      return { planId: '', uploaded: [] };
    }

    const response = await this.client.call('memory-api', 'createImageUploadPlan', {
      imageCount: imagePaths.length,
      operationId,
    });
    const plan = parseResult(response, parseUploadPlan);
    return {
      planId: plan.planId,
      uploaded: await this.images.uploadPlannedFiles(plan, imagePaths),
    };
  }

  private cacheImages(memory: CloudMemory): void {
    const cache = new Map<string, string>();
    memory.imagePaths.forEach((path, index) => {
      const imageId = memory.imageIds[index];
      if (imageId) {
        cache.set(path, imageId);
      }
    });
    this.imageIdsByMemory.set(memory.id, cache);
  }
}

export const cloudMemoryRepository = new CloudMemoryRepository();
