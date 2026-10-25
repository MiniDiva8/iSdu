import {
  isMemoryCategory,
  isMemoryMood,
  type MemoryCategory,
  type MemoryMood,
} from '../models/memory';
import { wechatStorageAdapter, type StorageAdapter } from './repository/storage-adapter';
export const JOURNAL_PREFERENCES_STORAGE_KEY = 'isdu:journal-preferences:v1';
export interface JournalPreferences {
  readonly defaultMood: MemoryMood;
  readonly defaultCategory: MemoryCategory;
  readonly haptics: boolean;
}
const defaults: JournalPreferences = {
  defaultMood: 'calm',
  defaultCategory: 'campus-life',
  haptics: false,
};
function parsePreferences(value: unknown): JournalPreferences | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (
    !isMemoryMood(item.defaultMood) ||
    !isMemoryCategory(item.defaultCategory) ||
    typeof item.haptics !== 'boolean'
  )
    return null;
  return {
    defaultMood: item.defaultMood,
    defaultCategory: item.defaultCategory,
    haptics: item.haptics,
  };
}
export class JournalPreferencesService {
  private readonly storage: StorageAdapter;
  constructor(storage: StorageAdapter = wechatStorageAdapter) {
    this.storage = storage;
  }
  read(): JournalPreferences {
    try {
      if (!this.storage.has(JOURNAL_PREFERENCES_STORAGE_KEY)) return { ...defaults };
      const raw = this.storage.read(JOURNAL_PREFERENCES_STORAGE_KEY);
      if (typeof raw !== 'string') return { ...defaults };
      const envelope = JSON.parse(raw) as { schemaVersion?: unknown; preferences?: unknown } | null;
      return envelope?.schemaVersion === 1
        ? (parsePreferences(envelope.preferences) ?? { ...defaults })
        : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }
  save(patch: Partial<JournalPreferences>): JournalPreferences {
    if (
      !patch ||
      typeof patch !== 'object' ||
      Object.keys(patch).some((key) => !['defaultMood', 'defaultCategory', 'haptics'].includes(key))
    )
      throw new Error('偏好设置格式无效');
    const preferences = parsePreferences({ ...this.read(), ...patch });
    if (!preferences) throw new Error('偏好设置格式无效');
    this.storage.write(
      JOURNAL_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, preferences }),
    );
    return preferences;
  }
  clear(): void {
    this.storage.remove(JOURNAL_PREFERENCES_STORAGE_KEY);
  }
}
export const journalPreferencesService = new JournalPreferencesService();
