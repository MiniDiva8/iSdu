import type { MigrationReport } from '../models/cloud-memory';
import { cloudModeService, type CloudModeService } from './cloud/cloud-mode-service';
import {
  cloudMemoryRepository,
  type CloudMemoryRepository,
} from './repository/cloud-memory-repository';
import {
  localMemoryRepository,
  type LocalMemoryRepository,
} from './repository/local-memory-repository';

export type MigrationProgress = Readonly<{
  completed: number;
  currentLocalMemoryId: string;
  total: number;
}>;

export class MemoryMigrationService {
  private readonly cloud: CloudMemoryRepository;
  private readonly local: LocalMemoryRepository;
  private readonly mode: CloudModeService;

  constructor(
    local: LocalMemoryRepository = localMemoryRepository,
    cloud: CloudMemoryRepository = cloudMemoryRepository,
    mode: CloudModeService = cloudModeService,
  ) {
    this.local = local;
    this.cloud = cloud;
    this.mode = mode;
  }

  async migrateAll(onProgress?: (progress: MigrationProgress) => void): Promise<MigrationReport> {
    const allMemories = await this.local.listMemories();
    const memories = allMemories.filter((memory) => memory.origin === 'user');
    const failures: { localMemoryId: string; message: string }[] = [];
    let migrated = 0;

    for (const memory of memories) {
      onProgress?.({
        completed: migrated,
        currentLocalMemoryId: memory.id,
        total: memories.length,
      });
      try {
        await this.cloud.migrateMemory(memory);
        migrated += 1;
      } catch (error: unknown) {
        failures.push({
          localMemoryId: memory.id,
          message: error instanceof Error ? error.message : '迁移失败',
        });
      }
    }

    const completedAt = failures.length === 0 ? new Date().toISOString() : null;
    if (completedAt) {
      this.mode.activateCloud(completedAt);
    }

    return {
      completedAt,
      failed: failures,
      migrated,
      skippedDemo: allMemories.length - memories.length,
      total: memories.length,
    };
  }
}

export const memoryMigrationService = new MemoryMigrationService();
