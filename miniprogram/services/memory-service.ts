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

export class MemoryService {
  private readonly cloud: CloudMemoryRepository;
  private readonly local: LocalMemoryRepository;
  private readonly mode: CloudModeService;

  constructor(
    mode: CloudModeService = cloudModeService,
    local: LocalMemoryRepository = localMemoryRepository,
    cloud: CloudMemoryRepository = cloudMemoryRepository,
  ) {
    this.mode = mode;
    this.local = local;
    this.cloud = cloud;
  }

  get activeRepository(): MemoryRepository {
    return this.mode.getState().mode === 'cloud' ? this.cloud : this.local;
  }

  listMemories: MemoryRepository['listMemories'] = () => this.activeRepository.listMemories();
  getMemoryById: MemoryRepository['getMemoryById'] = (id) =>
    this.activeRepository.getMemoryById(id);
  createMemory: MemoryRepository['createMemory'] = (input) =>
    this.activeRepository.createMemory(input);
  updateMemory: MemoryRepository['updateMemory'] = (id, input) =>
    this.activeRepository.updateMemory(id, input);
  deleteMemory: MemoryRepository['deleteMemory'] = (id) => this.activeRepository.deleteMemory(id);
  clearMemories: MemoryRepository['clearMemories'] = () => this.activeRepository.clearMemories();
}

export const memoryService = new MemoryService();
