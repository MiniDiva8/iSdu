import { cloudModeService, type CloudModeService } from './cloud/cloud-mode-service';
import {
  cloudMemoryRepository,
  type CloudMemoryRepository,
} from './repository/cloud-memory-repository';
import {
  localMemoryRepository,
  type LocalMemoryRepository,
} from './repository/local-memory-repository';
import type { MemoryRepository } from './repository/memory-repository';

import type { Memory } from '../models/memory';

const LIST_CACHE_MS = 30_000;
function copyMemories(memories: readonly Memory[]): Memory[] {
  return JSON.parse(JSON.stringify(memories)) as Memory[];
}

export class MemoryService {
  private readonly cloud: CloudMemoryRepository;
  private readonly local: LocalMemoryRepository;
  private readonly mode: CloudModeService;
  private readonly now: () => number;
  private scope = '';
  private generation = 0;
  private cache: { memories: Memory[]; loadedAt: number } | null = null;
  private pending: Promise<Memory[]> | null = null;

  constructor(
    mode: CloudModeService = cloudModeService,
    local: LocalMemoryRepository = localMemoryRepository,
    cloud: CloudMemoryRepository = cloudMemoryRepository,
    now: () => number = Date.now,
  ) {
    this.mode = mode;
    this.local = local;
    this.cloud = cloud;
    this.now = now;
  }

  get activeRepository(): MemoryRepository {
    return this.mode.getState().mode === 'cloud' ? this.cloud : this.local;
  }

  getListScope(): string {
    return this.readListContext().scope;
  }

  private readListContext(): { scope: string; isCloud: boolean } {
    const state = this.mode.getState();
    const scope = JSON.stringify(state);
    if (scope !== this.scope) {
      this.scope = scope;
      this.invalidateList();
    }
    return { scope: scope + ':' + this.generation, isCloud: state.mode === 'cloud' };
  }

  invalidateList(): void {
    this.generation++;
    this.cache = null;
    this.pending = null;
  }

  getCachedMemories(): Memory[] | null {
    const context = this.readListContext();
    return context.isCloud ? this.readCachedMemories() : null;
  }

  private readCachedMemories(): Memory[] | null {
    const now = this.now();
    if (!this.cache || now < this.cache.loadedAt || now - this.cache.loadedAt >= LIST_CACHE_MS)
      return null;
    return copyMemories(this.cache.memories);
  }

  async listMemories(forceRefresh = false): Promise<Memory[]> {
    const { scope, isCloud } = this.readListContext();
    if (!isCloud) return this.local.listMemories();
    const cached = !forceRefresh ? this.readCachedMemories() : null;
    if (cached) return cached;
    if (this.pending) return copyMemories(await this.pending);

    const pending = this.cloud
      .listMemories()
      .then((memories) => {
        // A reply started before a mutation or mode change must never restore the cache.
        if (scope === this.getListScope()) {
          this.cache = { memories: copyMemories(memories), loadedAt: this.now() };
        }
        return memories;
      })
      .catch((error: unknown) => {
        // Keep the page's displayed snapshot, but never report this failed refresh as a cache hit.
        if (scope === this.getListScope()) this.cache = null;
        throw error;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = null;
      });
    this.pending = pending;
    return copyMemories(await pending);
  }

  private async mutate<T>(action: () => Promise<T>): Promise<T> {
    this.invalidateList();
    try {
      return await action();
    } finally {
      // Also covers a list started while the write was in progress or had an uncertain reply.
      this.invalidateList();
    }
  }

  getMemoryById: MemoryRepository['getMemoryById'] = (id) =>
    this.activeRepository.getMemoryById(id);
  createMemory: MemoryRepository['createMemory'] = (input) =>
    this.mutate(() => this.activeRepository.createMemory(input));
  updateMemory: MemoryRepository['updateMemory'] = (id, input) =>
    this.mutate(() => this.activeRepository.updateMemory(id, input));
  deleteMemory: MemoryRepository['deleteMemory'] = (id) =>
    this.mutate(() => this.activeRepository.deleteMemory(id));
  clearMemories: MemoryRepository['clearMemories'] = () =>
    this.mutate(() => this.activeRepository.clearMemories());
}

export const memoryService = new MemoryService();
