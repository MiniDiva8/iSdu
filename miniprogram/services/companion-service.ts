import type {
  CompanionCommand,
  CompanionFacts,
  CompanionResult,
  CompanionState,
} from '../models/companion';
import { EMPTY_COMPANION_FACTS } from '../models/companion';
import type { Memory } from '../models/memory';
import { memoryRepository } from './repository/index';
import { type StorageAdapter, wechatStorageAdapter } from './repository/storage-adapter';
import {
  applyCompanionCommand,
  CompanionError,
  companionDayKey,
  createCompanionState,
  parseCompanionState,
} from '../utils/companion-engine';
export const COMPANION_STORAGE_KEY = 'isdu:companion:v1';
export const COMPANION_CLOUD_USED_KEY = 'isdu:companion:cloud-used:v1';
export class CompanionService {
  private readonly storage: StorageAdapter;
  private readonly list: () => Promise<Memory[]>;
  private readonly now: () => string;
  private readonly random: () => number;
  constructor(
    storage: StorageAdapter = wechatStorageAdapter,
    list: () => Promise<Memory[]> = () => memoryRepository.listMemories(),
    now: () => string = () => new Date().toISOString(),
    random: () => number = Math.random,
  ) {
    this.storage = storage;
    this.list = list;
    this.now = now;
    this.random = random;
  }
  read(): CompanionState {
    if (!this.storage.has(COMPANION_STORAGE_KEY)) return createCompanionState(this.now());
    return parseCompanionState(this.storage.read(COMPANION_STORAGE_KEY));
  }
  async facts(at = this.now()): Promise<CompanionFacts> {
    const today = companionDayKey(at);
    const all = (await this.list()).filter((m) => m.origin !== 'demo');
    const recent = all.filter((m) => {
      try {
        return companionDayKey(m.createdAt) === today;
      } catch {
        return false;
      }
    });
    const recorded = new Set(
      all
        .map((m) => {
          try {
            return companionDayKey(m.recordedAt);
          } catch {
            return '';
          }
        })
        .filter(Boolean),
    );
    return {
      totalEntries: all.length,
      entriesToday: recent.length,
      photosToday: recent.filter((m) => m.imagePaths.length > 0).length,
      recordedDays: recorded.size,
      latestMood:
        [...all].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0]?.mood ?? 'calm',
    };
  }
  async dispatch(command: CompanionCommand): Promise<CompanionResult> {
    const at = this.now();
    const needsFacts = ['claim', 'claimAll', 'readLetter'].includes(command.type);
    const facts = needsFacts ? await this.facts(at) : EMPTY_COMPANION_FACTS;
    if (needsFacts && companionDayKey(at) !== companionDayKey(this.now())) {
      throw new CompanionError('DAY_CHANGED', '新的一天开始啦，请刷新任务后再领取。');
    }
    // Read immediately before the synchronous write, even after an asynchronous facts lookup.
    const next = applyCompanionCommand(this.read(), command, facts, at, this.random);
    this.storage.write(COMPANION_STORAGE_KEY, JSON.stringify(next.state));
    return next;
  }
  cloudWasUsed(): boolean {
    return this.storage.has(COMPANION_CLOUD_USED_KEY);
  }
  markCloudUsed(): void {
    this.storage.write(COMPANION_CLOUD_USED_KEY, '1');
  }
  clearCloudMarker(): void {
    this.storage.remove(COMPANION_CLOUD_USED_KEY);
  }
  clear(): void {
    this.storage.remove(COMPANION_STORAGE_KEY);
  }
}
export const companionService = new CompanionService();
