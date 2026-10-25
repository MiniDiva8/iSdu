import {
  isIsoDateString,
  isMemoryCategory,
  isMemoryMood,
  MEMORY_CUSTOM_LABEL_MAX_LENGTH,
  MEMORY_PLACE_MAX_LENGTH,
  MEMORY_TEXT_MAX_LENGTH,
  type MemoryMood,
  type MemoryCategory,
} from '../models/memory';
import { validateRatio } from '../utils/map-coordinates';
import { wechatStorageAdapter, type StorageAdapter } from './repository/storage-adapter';

export const JOURNAL_DRAFT_STORAGE_KEY = 'isdu:journal-text-draft:v1';
export interface JournalDraft {
  readonly text: string;
  readonly mood: MemoryMood;
  readonly customMood: string;
  readonly category: MemoryCategory;
  readonly customCategory: string;
  readonly placeName: string;
  readonly recordedAt: string;
  readonly mapAssetVersion: string;
  readonly xRatio: number;
  readonly yRatio: number;
  readonly hadPhotos?: boolean;
}
function parseDraft(value: unknown): JournalDraft | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const limits: Record<string, number> = {
    text: MEMORY_TEXT_MAX_LENGTH,
    customMood: MEMORY_CUSTOM_LABEL_MAX_LENGTH,
    customCategory: MEMORY_CUSTOM_LABEL_MAX_LENGTH,
    placeName: MEMORY_PLACE_MAX_LENGTH,
  };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof item[field] !== 'string' || item[field].length > limit) return null;
  }
  if (
    !isMemoryMood(item.mood) ||
    !isMemoryCategory(item.category) ||
    !isIsoDateString(item.recordedAt) ||
    typeof item.mapAssetVersion !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(item.mapAssetVersion) ||
    !validateRatio(item.xRatio) ||
    !validateRatio(item.yRatio)
  )
    return null;
  return {
    text: item.text as string,
    mood: item.mood,
    customMood: item.customMood as string,
    category: item.category,
    customCategory: item.customCategory as string,
    placeName: item.placeName as string,
    recordedAt: item.recordedAt,
    mapAssetVersion: item.mapAssetVersion,
    xRatio: item.xRatio,
    yRatio: item.yRatio,
    hadPhotos: item.hadPhotos === true,
  };
}
export class JournalDraftService {
  private readonly storage: StorageAdapter;
  constructor(storage: StorageAdapter = wechatStorageAdapter) {
    this.storage = storage;
  }
  read(): JournalDraft | null {
    if (!this.storage.has(JOURNAL_DRAFT_STORAGE_KEY)) return null;
    const raw = this.storage.read(JOURNAL_DRAFT_STORAGE_KEY);
    if (typeof raw !== 'string') return null;
    try {
      const value = JSON.parse(raw) as { schemaVersion?: unknown; draft?: unknown };
      return value.schemaVersion === 1 ? parseDraft(value.draft) : null;
    } catch {
      return null;
    }
  }
  save(input: JournalDraft): void {
    const draft = parseDraft(input);
    if (!draft) throw new Error('文字草稿格式无效，未写入存储');
    this.storage.write(JOURNAL_DRAFT_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, draft }));
  }
  clear(): void {
    this.storage.remove(JOURNAL_DRAFT_STORAGE_KEY);
  }
}
export const journalDraftService = new JournalDraftService();
