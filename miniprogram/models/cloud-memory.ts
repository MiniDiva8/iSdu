import { parseMemoryRecord, type Memory } from './memory';

export const MEMORY_VISIBILITIES = ['private', 'selected_friends', 'friends'] as const;
export type MemoryVisibility = (typeof MEMORY_VISIBILITIES)[number];

export interface CloudMemory extends Memory {
  readonly canEdit: boolean;
  readonly imageIds: readonly string[];
  readonly likeCount: number;
  readonly likedByMe: boolean;
  readonly ownerDisplayName: string;
  readonly ownerUserId: string;
  readonly publishedAt: string | null;
  readonly selectedFriendIds: readonly string[];
  readonly visibility: MemoryVisibility;
}

export interface CloudMemoryInput {
  readonly category: Memory['category'];
  readonly customCategory: string;
  readonly customMood: string;
  readonly mapAssetVersion: string;
  readonly mapXRatio: number;
  readonly mapYRatio: number;
  readonly mood: Memory['mood'];
  readonly placeName: string;
  readonly recordedAt: string;
  readonly text: string;
}

export interface CloudImageUploadTarget {
  readonly cloudPath: string;
  readonly imageId: string;
}

export interface CloudImageUploadPlan {
  readonly expiresAt: string;
  readonly files: readonly CloudImageUploadTarget[];
  readonly planId: string;
}

export interface UploadedCloudImage {
  readonly fileId: string;
  readonly imageId: string;
}

export interface MigrationItemResult {
  readonly cloudMemoryId: string;
  readonly localMemoryId: string;
  readonly status: 'created' | 'existing';
}

export interface MigrationReport {
  readonly completedAt: string | null;
  readonly failed: readonly { readonly localMemoryId: string; readonly message: string }[];
  readonly migrated: number;
  readonly skippedDemo: number;
  readonly total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} 格式无效`);
  }

  const result: string[] = [];
  for (const item of value as unknown[]) {
    if (typeof item !== 'string') {
      throw new Error(`${field} 格式无效`);
    }
    result.push(item);
  }
  return result;
}

export function isMemoryVisibility(value: unknown): value is MemoryVisibility {
  return typeof value === 'string' && (MEMORY_VISIBILITIES as readonly string[]).includes(value);
}

export function toCloudMemoryInput(memory: Memory): CloudMemoryInput {
  return {
    category: memory.category,
    customCategory: memory.customCategory,
    customMood: memory.customMood,
    mapAssetVersion: memory.mapAssetVersion,
    mapXRatio: memory.mapXRatio,
    mapYRatio: memory.mapYRatio,
    mood: memory.mood,
    placeName: memory.placeName,
    recordedAt: memory.recordedAt,
    text: memory.text,
  };
}

export function parseCloudMemory(value: unknown): CloudMemory {
  if (!isRecord(value)) {
    throw new Error('云端回忆格式无效');
  }

  const visibility = value.visibility;
  const publishedAt = value.publishedAt;
  const likeCount = value.likeCount;

  if (!isMemoryVisibility(visibility)) {
    throw new Error('云端回忆可见范围无效');
  }

  if (publishedAt !== null && typeof publishedAt !== 'string') {
    throw new Error('云端回忆发布时间无效');
  }

  if (!Number.isInteger(likeCount) || (likeCount as number) < 0) {
    throw new Error('云端回忆点赞数无效');
  }

  if (
    typeof value.canEdit !== 'boolean' ||
    typeof value.likedByMe !== 'boolean' ||
    typeof value.ownerDisplayName !== 'string' ||
    typeof value.ownerUserId !== 'string'
  ) {
    throw new Error('云端回忆权限字段无效');
  }

  const memory = parseMemoryRecord(value);

  return {
    ...memory,
    canEdit: value.canEdit,
    imageIds: requireStringArray(value.imageIds, 'imageIds'),
    likeCount: likeCount as number,
    likedByMe: value.likedByMe,
    ownerDisplayName: value.ownerDisplayName,
    ownerUserId: value.ownerUserId,
    publishedAt,
    selectedFriendIds: requireStringArray(value.selectedFriendIds, 'selectedFriendIds'),
    visibility,
  };
}
