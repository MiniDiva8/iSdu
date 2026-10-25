import { isMemoryCategory, isMemoryMood, type MemoryCategory, type MemoryMood } from './memory';

export interface FriendMapPoint {
  readonly category: MemoryCategory;
  readonly customCategory: string;
  readonly customMood: string;
  readonly id: string;
  readonly mapAssetVersion: string;
  readonly mapXRatio: number;
  readonly mapYRatio: number;
  readonly mood: MemoryMood;
  readonly ownerDisplayName: string;
  readonly ownerUserId: string;
  readonly placeName: string;
  readonly publishedAt: string;
}

export interface FriendMapCursor {
  readonly id: string;
  readonly publishedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseFriendMapPoint(value: unknown): FriendMapPoint {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.ownerDisplayName !== 'string' ||
    typeof value.ownerUserId !== 'string' ||
    typeof value.placeName !== 'string' ||
    typeof value.customMood !== 'string' ||
    typeof value.customCategory !== 'string' ||
    typeof value.mapAssetVersion !== 'string' ||
    typeof value.publishedAt !== 'string' ||
    !Number.isFinite(value.mapXRatio) ||
    !Number.isFinite(value.mapYRatio) ||
    !isMemoryMood(value.mood) ||
    !isMemoryCategory(value.category)
  ) {
    throw new Error('好友地图点格式无效');
  }
  return value as unknown as FriendMapPoint;
}

export function parseFriendMapCursor(value: unknown): FriendMapCursor | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.publishedAt !== 'string') {
    throw new Error('好友地图分页格式无效');
  }
  return { id: value.id, publishedAt: value.publishedAt };
}
