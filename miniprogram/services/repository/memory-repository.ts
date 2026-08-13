import type { CreateMemoryInput, Memory, UpdateMemoryInput } from '../../models/memory';

export interface MemoryRepository {
  listMemories(): Promise<Memory[]>;
  getMemoryById(id: string): Promise<Memory | null>;
  createMemory(input: CreateMemoryInput): Promise<Memory>;
  updateMemory(id: string, input: UpdateMemoryInput): Promise<Memory>;
  deleteMemory(id: string): Promise<void>;
}

export type MemoryRepositoryErrorCode =
  | 'CORRUPT_DATA'
  | 'DUPLICATE_ID'
  | 'INVALID_ID'
  | 'NOT_FOUND'
  | 'STORAGE_READ_FAILED'
  | 'STORAGE_WRITE_FAILED'
  | 'UNSUPPORTED_SCHEMA';

export class MemoryRepositoryError extends Error {
  readonly code: MemoryRepositoryErrorCode;

  constructor(code: MemoryRepositoryErrorCode, message: string) {
    super(message);
    this.name = 'MemoryRepositoryError';
    this.code = code;
  }
}
