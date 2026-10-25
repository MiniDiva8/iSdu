import { isMemoryCategory, isMemoryMood, type MemoryCategory, type MemoryMood } from './memory';

export interface FriendTimelineItem {
  readonly category: MemoryCategory;
  readonly customCategory: string;
  readonly customMood: string;
  readonly hasImage: boolean;
  readonly id: string;
  readonly likeCount: number;
  readonly mapAssetVersion: string;
  readonly mapXRatio: number;
  readonly mapYRatio: number;
  readonly mood: MemoryMood;
  readonly ownerDisplayName: string;
  readonly ownerUserId: string;
  readonly placeName: string;
  readonly publishedAt: string;
  readonly recordedAt: string;
  readonly summary: string;
  readonly thumbnailUrl: string;
}

export interface FriendTimelineCursor {
  readonly id: string;
  readonly publishedAt: string;
}

export interface FriendTimelinePage {
  readonly items: FriendTimelineItem[];
  readonly nextCursor: FriendTimelineCursor | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRatio(value: unknown): value is number {
  return Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 1;
}

export function parseFriendTimelineItem(value: unknown): FriendTimelineItem {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.ownerDisplayName !== 'string' ||
    typeof value.ownerUserId !== 'string' ||
    typeof value.placeName !== 'string' ||
    typeof value.summary !== 'string' ||
    typeof value.customMood !== 'string' ||
    typeof value.customCategory !== 'string' ||
    typeof value.mapAssetVersion !== 'string' ||
    typeof value.recordedAt !== 'string' ||
    typeof value.publishedAt !== 'string' ||
    typeof value.hasImage !== 'boolean' ||
    typeof value.thumbnailUrl !== 'string' ||
    !Number.isInteger(value.likeCount) ||
    Number(value.likeCount) < 0 ||
    !isRatio(value.mapXRatio) ||
    !isRatio(value.mapYRatio) ||
    !isMemoryMood(value.mood) ||
    !isMemoryCategory(value.category)
  ) {
    throw new Error('好友时光条目格式无效');
  }
  return value as unknown as FriendTimelineItem;
}

export function parseFriendTimelineCursor(value: unknown): FriendTimelineCursor | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.publishedAt !== 'string') {
    throw new Error('好友时光分页格式无效');
  }
  return { id: value.id, publishedAt: value.publishedAt };
}
