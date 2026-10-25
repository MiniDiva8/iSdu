import {
  createWechatLocalImageFileSystemAdapter,
  type LocalImageFileSystemAdapter,
} from './local-image-service';
import { wechatStorageAdapter, type StorageAdapter } from './repository/storage-adapter';

export const TIMELINE_COVER_STORAGE_KEY = 'sdu-memory:timeline-cover:v1';
const COVER_DIRECTORY = 'sdu-memory/timeline-cover';
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
let coverSequence = 0;

class TimelineCoverError extends Error {
  readonly code: 'CORRUPT_DATA' | 'READ_FAILED' | 'SAVE_FAILED' | 'CLEAR_FAILED';

  constructor(code: TimelineCoverError['code'], message: string) {
    super(message);
    this.name = 'TimelineCoverError';
    this.code = code;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '');
}

function hasParentTraversal(path: string): boolean {
  return path.split('/').includes('..');
}

export class TimelineCoverService {
  private readonly storage: StorageAdapter;
  private readonly files: LocalImageFileSystemAdapter;
  private readonly managedRoot: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(storage: StorageAdapter, files: LocalImageFileSystemAdapter, userDataPath: string) {
    const root = normalizePath(userDataPath.trim());
    if (!root || hasParentTraversal(root)) {
      throw new TimelineCoverError('SAVE_FAILED', '封面保存目录无效。');
    }
    this.storage = storage;
    this.files = files;
    this.managedRoot = `${root}/${COVER_DIRECTORY}`;
  }

  private readCover(): string {
    try {
      if (!this.storage.has(TIMELINE_COVER_STORAGE_KEY)) return '';
      const raw = this.storage.read(TIMELINE_COVER_STORAGE_KEY);
      let snapshot: unknown;
      try {
        snapshot = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : null;
      } catch {
        snapshot = null;
      }
      if (
        typeof snapshot !== 'object' ||
        snapshot === null ||
        !('schemaVersion' in snapshot) ||
        snapshot.schemaVersion !== 1 ||
        !('imagePath' in snapshot) ||
        typeof snapshot.imagePath !== 'string' ||
        !snapshot.imagePath.startsWith(`${this.managedRoot}/`) ||
        !FILE_NAME_PATTERN.test(snapshot.imagePath.slice(this.managedRoot.length + 1))
      ) {
        throw new TimelineCoverError('CORRUPT_DATA', '封面设置已损坏，请重新选择封面。');
      }
      return snapshot.imagePath;
    } catch (error: unknown) {
      if (error instanceof TimelineCoverError) throw error;
      throw new TimelineCoverError('READ_FAILED', '读取封面失败，请稍后重试。');
    }
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  getCover(): Promise<string> {
    return this.mutationQueue.then(() => this.readCover());
  }

  saveCover(tempFilePath: string): Promise<string> {
    return this.enqueueMutation(() => this.persistCover(tempFilePath));
  }

  private async persistCover(tempFilePath: string): Promise<string> {
    if (
      !tempFilePath.trim() ||
      tempFilePath.includes('\0') ||
      hasParentTraversal(normalizePath(tempFilePath))
    ) {
      throw new TimelineCoverError('SAVE_FAILED', '图片无法读取，请重新选择封面。');
    }
    let previousPath = '';
    try {
      previousPath = this.readCover();
    } catch (error: unknown) {
      if (!(error instanceof TimelineCoverError) || error.code !== 'CORRUPT_DATA') throw error;
    }
    const extension =
      /\.(png|jpe?g|webp|heic|heif|gif)$/iu.exec(tempFilePath)?.[1]?.toLowerCase() ?? 'jpg';
    const fileName = `${Date.now().toString(36)}-${coverSequence++}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
    const imagePath = `${this.managedRoot}/${fileName}`;
    try {
      await this.files.ensureDirectory(this.managedRoot);
      await this.files.saveFile(tempFilePath, imagePath);
      this.storage.write(
        TIMELINE_COVER_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, imagePath }),
      );
    } catch {
      await this.files.removeFile(imagePath).catch(() => undefined);
      throw new TimelineCoverError('SAVE_FAILED', '封面保存失败，请检查本机空间后重试。');
    }
    if (previousPath) {
      await this.files.removeFile(previousPath).catch(() => undefined);
    }
    return imagePath;
  }

  clearCover(): Promise<void> {
    return this.enqueueMutation(() => this.removeCover());
  }

  private async removeCover(): Promise<void> {
    try {
      this.storage.remove(TIMELINE_COVER_STORAGE_KEY);
    } catch {
      throw new TimelineCoverError('CLEAR_FAILED', '恢复默认封面失败，请稍后重试。');
    }
    try {
      await this.files.removeDirectory(this.managedRoot);
    } catch {
      throw new TimelineCoverError(
        'CLEAR_FAILED',
        '封面已恢复默认，但旧图片未能清理，请稍后重试。',
      );
    }
  }
}

let defaultService: TimelineCoverService | undefined;

function getDefaultService(): TimelineCoverService {
  defaultService ??= new TimelineCoverService(
    wechatStorageAdapter,
    createWechatLocalImageFileSystemAdapter(wx.getFileSystemManager()),
    wx.env.USER_DATA_PATH,
  );
  return defaultService;
}

export const timelineCoverService = {
  getCover: (): Promise<string> => getDefaultService().getCover(),
  saveCover: (tempFilePath: string): Promise<string> => getDefaultService().saveCover(tempFilePath),
  clearCover: (): Promise<void> => getDefaultService().clearCover(),
};
