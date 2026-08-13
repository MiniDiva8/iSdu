import { validateRatio } from '../utils/map-coordinates';

export const MEMORY_TEXT_MAX_LENGTH = 2000;
export const MEMORY_PLACE_MAX_LENGTH = 60;
export const MEMORY_IMAGE_MAX_COUNT = 3;
export const MEMORY_ID_MAX_LENGTH = 100;
export const MEMORY_MAP_ASSET_VERSION_MAX_LENGTH = 80;
export const MEMORY_CUSTOM_LABEL_MAX_LENGTH = 20;

const MEMORY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const MEMORY_MAP_ASSET_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export const MEMORY_MOODS = [
  'happy',
  'calm',
  'excited',
  'grateful',
  'relaxed',
  'nostalgic',
  'inspired',
  'proud',
  'lonely',
  'sad',
  'tired',
  'custom',
] as const;
export type MemoryMood = (typeof MEMORY_MOODS)[number];

export const MEMORY_CATEGORIES = [
  'campus-life',
  'friendship',
  'study',
  'nature',
  'food',
  'club',
  'event',
  'graduation',
  'custom',
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export type MemoryOrigin = 'demo' | 'user';

export interface MemoryContentInput {
  text: string;
  imagePaths: string[];
  placeName: string;
  mood: MemoryMood;
  customMood: string;
  category: MemoryCategory;
  customCategory: string;
  mapAssetVersion: string;
  mapXRatio: number;
  mapYRatio: number;
  recordedAt: string;
}

export interface CreateMemoryInput extends MemoryContentInput {
  id: string;
}

export type UpdateMemoryInput = MemoryContentInput;

export interface Memory extends CreateMemoryInput {
  origin: MemoryOrigin;
  createdAt: string;
  updatedAt: string;
}

export class MemoryValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = 'MemoryValidationError';
    this.field = field;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new MemoryValidationError(field, `${field} 必须是字符串`);
  }

  return value;
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new MemoryValidationError(field, `${field} 必须是字符串数组`);
  }

  return value as string[];
}

export function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function isMemoryMood(value: unknown): value is MemoryMood {
  return typeof value === 'string' && (MEMORY_MOODS as readonly string[]).includes(value);
}

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && (MEMORY_CATEGORIES as readonly string[]).includes(value);
}

export function isMemoryId(value: unknown): value is string {
  return typeof value === 'string' && MEMORY_ID_PATTERN.test(value);
}

export function isMapAssetVersion(value: unknown): value is string {
  return typeof value === 'string' && MEMORY_MAP_ASSET_VERSION_PATTERN.test(value);
}

export function createMemoryId(timestamp = Date.now(), randomValue = Math.random()): string {
  const randomPart = Math.floor(randomValue * 0x1000000)
    .toString(16)
    .padStart(6, '0');

  return `memory-${timestamp}-${randomPart}`;
}

export function normalizeMemoryContent(input: MemoryContentInput): MemoryContentInput {
  const text = input.text.trim();
  const placeName = input.placeName.trim();
  const customMood = input.customMood.trim();
  const customCategory = input.customCategory.trim();
  const imagePaths = input.imagePaths.map((path) => path.trim()).filter(Boolean);
  const mapAssetVersion =
    typeof input.mapAssetVersion === 'string' ? input.mapAssetVersion.trim() : '';

  if (text.length > MEMORY_TEXT_MAX_LENGTH) {
    throw new MemoryValidationError('text', `正文不能超过 ${MEMORY_TEXT_MAX_LENGTH} 字`);
  }

  if (placeName.length > MEMORY_PLACE_MAX_LENGTH) {
    throw new MemoryValidationError('placeName', `地点不能超过 ${MEMORY_PLACE_MAX_LENGTH} 字`);
  }

  if (imagePaths.length > MEMORY_IMAGE_MAX_COUNT) {
    throw new MemoryValidationError('imagePaths', `最多选择 ${MEMORY_IMAGE_MAX_COUNT} 张照片`);
  }

  if (new Set(imagePaths).size !== imagePaths.length) {
    throw new MemoryValidationError('imagePaths', '照片路径不能重复');
  }

  if (!text && imagePaths.length === 0) {
    throw new MemoryValidationError('content', '请至少填写一段文字或选择一张照片');
  }

  if (!isMemoryMood(input.mood)) {
    throw new MemoryValidationError('mood', '请选择有效的心情');
  }

  if (!isMemoryCategory(input.category)) {
    throw new MemoryValidationError('category', '请选择有效的回忆分类');
  }

  if (customMood.length > MEMORY_CUSTOM_LABEL_MAX_LENGTH) {
    throw new MemoryValidationError(
      'customMood',
      `自定义心情不能超过 ${MEMORY_CUSTOM_LABEL_MAX_LENGTH} 字`,
    );
  }

  if (input.mood === 'custom' && !customMood) {
    throw new MemoryValidationError('customMood', '请填写自定义心情');
  }

  if (customCategory.length > MEMORY_CUSTOM_LABEL_MAX_LENGTH) {
    throw new MemoryValidationError(
      'customCategory',
      `自定义分类不能超过 ${MEMORY_CUSTOM_LABEL_MAX_LENGTH} 字`,
    );
  }

  if (input.category === 'custom' && !customCategory) {
    throw new MemoryValidationError('customCategory', '请填写自定义回忆分类');
  }

  if (!isMapAssetVersion(mapAssetVersion)) {
    throw new MemoryValidationError('mapAssetVersion', '地图资源版本无效');
  }

  if (!validateRatio(input.mapXRatio) || !validateRatio(input.mapYRatio)) {
    throw new MemoryValidationError('mapRatio', '地图位置无效，请重新选择');
  }

  if (!isIsoDateString(input.recordedAt)) {
    throw new MemoryValidationError('recordedAt', '记录时间格式无效');
  }

  return {
    text,
    imagePaths,
    mapAssetVersion,
    placeName,
    mood: input.mood,
    customMood: input.mood === 'custom' ? customMood : '',
    category: input.category,
    customCategory: input.category === 'custom' ? customCategory : '',
    mapXRatio: input.mapXRatio,
    mapYRatio: input.mapYRatio,
    recordedAt: input.recordedAt,
  };
}

export function normalizeCreateMemoryInput(input: CreateMemoryInput): CreateMemoryInput {
  const id = input.id.trim();

  if (!isMemoryId(id)) {
    throw new MemoryValidationError('id', '日记 ID 无效');
  }

  return {
    id,
    ...normalizeMemoryContent(input),
  };
}

export function parseMemoryRecord(value: unknown): Memory {
  if (!isRecord(value)) {
    throw new MemoryValidationError('memory', '日记数据必须是对象');
  }

  const id = requireString(value.id, 'id');
  const text = requireString(value.text, 'text');
  const imagePaths = requireStringArray(value.imagePaths, 'imagePaths');
  const placeName = requireString(value.placeName, 'placeName');
  const customMood =
    value.customMood === undefined ? '' : requireString(value.customMood, 'customMood');
  const customCategory =
    value.customCategory === undefined ? '' : requireString(value.customCategory, 'customCategory');
  const mood = value.mood;
  const category = value.category;
  const mapXRatio = value.mapXRatio;
  const mapYRatio = value.mapYRatio;
  const mapAssetVersion = value.mapAssetVersion;
  const recordedAt = value.recordedAt;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;
  const origin = value.origin;

  if (!isMemoryMood(mood)) {
    throw new MemoryValidationError('mood', '本地日记心情字段无效');
  }

  if (!isMemoryCategory(category)) {
    throw new MemoryValidationError('category', '本地日记分类字段无效');
  }

  if (typeof mapXRatio !== 'number' || typeof mapYRatio !== 'number') {
    throw new MemoryValidationError('mapRatio', '本地日记地图坐标字段无效');
  }

  const content = normalizeMemoryContent({
    text,
    imagePaths,
    mapAssetVersion: requireString(mapAssetVersion, 'mapAssetVersion'),
    placeName,
    mood,
    customMood,
    category,
    customCategory,
    mapXRatio,
    mapYRatio,
    recordedAt: requireString(recordedAt, 'recordedAt'),
  });

  if (!isIsoDateString(createdAt) || !isIsoDateString(updatedAt)) {
    throw new MemoryValidationError('timestamps', '本地日记时间戳无效');
  }

  if (origin !== 'demo' && origin !== 'user') {
    throw new MemoryValidationError('origin', '本地日记来源字段无效');
  }

  return {
    id: normalizeCreateMemoryInput({ id, ...content }).id,
    ...content,
    origin,
    createdAt,
    updatedAt,
  };
}

export function cloneMemory(memory: Memory): Memory {
  return {
    ...memory,
    imagePaths: [...memory.imagePaths],
  };
}

export function sortMemoriesByDate(memories: readonly Memory[]): Memory[] {
  return memories
    .map(cloneMemory)
    .sort(
      (left, right) =>
        right.recordedAt.localeCompare(left.recordedAt) ||
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

export const MEMORY_MOOD_LABELS: Readonly<Record<MemoryMood, string>> = {
  happy: '开心',
  calm: '平静',
  excited: '兴奋',
  grateful: '感恩',
  relaxed: '放松',
  nostalgic: '怀念',
  inspired: '有灵感',
  proud: '自豪',
  lonely: '孤单',
  sad: '难过',
  tired: '疲惫',
  custom: '自定义',
};

export const MEMORY_CATEGORY_LABELS: Readonly<Record<MemoryCategory, string>> = {
  'campus-life': '校园生活',
  friendship: '朋友相遇',
  study: '学习成长',
  nature: '运动自然',
  food: '美食日常',
  club: '社团活动',
  event: '校园活动',
  graduation: '毕业纪念',
  custom: '自定义',
};

export function getMemoryMoodLabel(
  memory: Pick<MemoryContentInput, 'customMood' | 'mood'>,
): string {
  return memory.mood === 'custom'
    ? memory.customMood.trim() || MEMORY_MOOD_LABELS.custom
    : MEMORY_MOOD_LABELS[memory.mood];
}

export function getMemoryCategoryLabel(
  memory: Pick<MemoryContentInput, 'category' | 'customCategory'>,
): string {
  return memory.category === 'custom'
    ? memory.customCategory.trim() || MEMORY_CATEGORY_LABELS.custom
    : MEMORY_CATEGORY_LABELS[memory.category];
}
