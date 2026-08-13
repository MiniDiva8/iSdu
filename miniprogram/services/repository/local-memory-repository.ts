import {
  cloneMemory,
  isMemoryId,
  isIsoDateString,
  normalizeCreateMemoryInput,
  normalizeMemoryContent,
  parseMemoryRecord,
  sortMemoriesByDate,
  type CreateMemoryInput,
  type Memory,
  type UpdateMemoryInput,
} from '../../models/memory';
import { LEGACY_MAP_ASSET_VERSION } from '../../config/campus-map';
import { MemoryRepositoryError, type MemoryRepository } from './memory-repository';
import { wechatStorageAdapter, type StorageAdapter } from './storage-adapter';

export const MEMORY_STORAGE_KEY = 'sdu-memory:memories:v1';
const LEGACY_MEMORY_SCHEMA_VERSION = 1;
const PRE_CUSTOM_LABEL_SCHEMA_VERSION = 2;
const MEMORY_SCHEMA_VERSION = 3;

interface MemoryStorageEnvelope {
  schemaVersion: number;
  updatedAt: string;
  memories: Memory[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseMemoryStorage(rawValue: unknown): Memory[] {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    throw new MemoryRepositoryError('CORRUPT_DATA', '本地日记数据为空或结构无效');
  }

  let parsed: unknown = rawValue;

  if (typeof rawValue === 'string') {
    try {
      parsed = JSON.parse(rawValue) as unknown;
    } catch {
      throw new MemoryRepositoryError('CORRUPT_DATA', '本地日记数据无法解析');
    }
  }

  if (!isRecord(parsed)) {
    throw new MemoryRepositoryError('CORRUPT_DATA', '本地日记数据结构无效');
  }

  if (
    parsed.schemaVersion !== LEGACY_MEMORY_SCHEMA_VERSION &&
    parsed.schemaVersion !== PRE_CUSTOM_LABEL_SCHEMA_VERSION &&
    parsed.schemaVersion !== MEMORY_SCHEMA_VERSION
  ) {
    throw new MemoryRepositoryError('UNSUPPORTED_SCHEMA', '本地日记版本暂不支持');
  }

  if (!isIsoDateString(parsed.updatedAt) || !Array.isArray(parsed.memories)) {
    throw new MemoryRepositoryError('CORRUPT_DATA', '本地日记快照字段无效');
  }

  try {
    const memories = parsed.memories.map((memory) => {
      if (parsed.schemaVersion === LEGACY_MEMORY_SCHEMA_VERSION && isRecord(memory)) {
        return parseMemoryRecord({
          ...memory,
          mapAssetVersion: LEGACY_MAP_ASSET_VERSION,
        });
      }

      return parseMemoryRecord(memory);
    });

    if (new Set(memories.map((memory) => memory.id)).size !== memories.length) {
      throw new MemoryRepositoryError('CORRUPT_DATA', '本地日记包含重复 ID');
    }

    return memories;
  } catch (error) {
    if (error instanceof MemoryRepositoryError) {
      throw error;
    }

    throw new MemoryRepositoryError(
      'CORRUPT_DATA',
      error instanceof Error ? error.message : '本地日记记录无效',
    );
  }
}

function assertValidId(id: string): string {
  const normalizedId = id.trim();

  if (!isMemoryId(normalizedId)) {
    throw new MemoryRepositoryError('INVALID_ID', '日记 ID 无效');
  }

  return normalizedId;
}

export class LocalMemoryRepository implements MemoryRepository {
  private readonly storage: StorageAdapter;
  private readonly now: () => string;

  constructor(
    storage: StorageAdapter = wechatStorageAdapter,
    now: () => string = () => new Date().toISOString(),
  ) {
    this.storage = storage;
    this.now = now;
  }

  listMemories(): Promise<Memory[]> {
    return Promise.resolve().then(() => sortMemoriesByDate(this.readMemories()));
  }

  initializeDemoMemories(seedMemories: readonly Memory[]): Promise<boolean> {
    return Promise.resolve().then(() => {
      let storageKeyExists: boolean;

      try {
        storageKeyExists = this.storage.has(MEMORY_STORAGE_KEY);
      } catch {
        throw new MemoryRepositoryError('STORAGE_READ_FAILED', '读取本地日记失败');
      }

      if (storageKeyExists) {
        return false;
      }

      const memories = seedMemories.map(parseMemoryRecord);
      const now = this.getNow();
      this.writeMemories(memories, now);
      return true;
    });
  }

  getMemoryById(id: string): Promise<Memory | null> {
    return Promise.resolve().then(() => {
      const normalizedId = assertValidId(id);
      const memory = this.readMemories().find((item) => item.id === normalizedId);
      return memory ? cloneMemory(memory) : null;
    });
  }

  createMemory(input: CreateMemoryInput): Promise<Memory> {
    return Promise.resolve().then(() => {
      const normalized = normalizeCreateMemoryInput(input);
      const memories = this.readMemories();

      if (memories.some((item) => item.id === normalized.id)) {
        throw new MemoryRepositoryError('DUPLICATE_ID', '这篇日记已经保存，请勿重复提交');
      }

      const now = this.getNow();
      const memory: Memory = {
        ...normalized,
        origin: 'user',
        createdAt: now,
        updatedAt: now,
      };

      this.writeMemories([...memories, memory], now);
      return cloneMemory(memory);
    });
  }

  updateMemory(id: string, input: UpdateMemoryInput): Promise<Memory> {
    return Promise.resolve().then(() => {
      const normalizedId = assertValidId(id);
      const normalized = normalizeMemoryContent(input);
      const memories = this.readMemories();
      const index = memories.findIndex((item) => item.id === normalizedId);

      if (index < 0) {
        throw new MemoryRepositoryError('NOT_FOUND', '要编辑的日记不存在');
      }

      const current = memories[index];

      if (!current) {
        throw new MemoryRepositoryError('NOT_FOUND', '要编辑的日记不存在');
      }

      const now = this.getNow();
      const updated: Memory = {
        ...current,
        ...normalized,
        updatedAt: now,
      };
      const nextMemories = memories.map((item) => (item.id === normalizedId ? updated : item));

      this.writeMemories(nextMemories, now);
      return cloneMemory(updated);
    });
  }

  deleteMemory(id: string): Promise<void> {
    return Promise.resolve().then(() => {
      const normalizedId = assertValidId(id);
      const memories = this.readMemories();

      if (!memories.some((item) => item.id === normalizedId)) {
        throw new MemoryRepositoryError('NOT_FOUND', '要删除的日记不存在');
      }

      const now = this.getNow();
      this.writeMemories(
        memories.filter((item) => item.id !== normalizedId),
        now,
      );
    });
  }

  private getNow(): string {
    const now = this.now();

    if (!isIsoDateString(now)) {
      throw new MemoryRepositoryError('STORAGE_WRITE_FAILED', '系统时间格式无效');
    }

    return now;
  }

  private readMemories(): Memory[] {
    let storageKeyExists: boolean;
    let rawValue: unknown;

    try {
      storageKeyExists = this.storage.has(MEMORY_STORAGE_KEY);

      if (!storageKeyExists) {
        return [];
      }

      rawValue = this.storage.read(MEMORY_STORAGE_KEY);
    } catch {
      throw new MemoryRepositoryError('STORAGE_READ_FAILED', '读取本地日记失败');
    }

    return parseMemoryStorage(rawValue);
  }

  private writeMemories(memories: readonly Memory[], updatedAt: string): void {
    const envelope: MemoryStorageEnvelope = {
      schemaVersion: MEMORY_SCHEMA_VERSION,
      updatedAt,
      memories: memories.map(cloneMemory),
    };

    try {
      this.storage.write(MEMORY_STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      throw new MemoryRepositoryError('STORAGE_WRITE_FAILED', '保存本地日记失败');
    }
  }
}

export const localMemoryRepository = new LocalMemoryRepository();
