import {
  createWechatLocalImageFileSystemAdapter,
  type LocalImageFileSystemAdapter,
} from './local-image-service';
import { wechatStorageAdapter, type StorageAdapter } from './repository/storage-adapter';

export const JOURNAL_BACKGROUND_STORAGE_KEY = 'sdu-memory:journal-background:v1';
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const defaults = { imagePath: '', clarity: 55 };
let sequence = 0;

export interface JournalBackground {
  readonly imagePath: string;
  readonly clarity: number;
}

class JournalBackgroundError extends Error {
  readonly code: 'CORRUPT_DATA' | 'READ_FAILED' | 'SAVE_FAILED' | 'CLEAR_FAILED';
  constructor(code: JournalBackgroundError['code'], message: string) {
    super(message);
    this.name = 'JournalBackgroundError';
    this.code = code;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '');
}

function hasTraversal(path: string): boolean {
  return normalizePath(path).split('/').includes('..');
}

export class JournalBackgroundService {
  private readonly storage: StorageAdapter;
  private readonly files: LocalImageFileSystemAdapter;
  private readonly root: string;
  private mutations: Promise<void> = Promise.resolve();

  constructor(storage: StorageAdapter, files: LocalImageFileSystemAdapter, userDataPath: string) {
    const root = normalizePath(userDataPath.trim());
    if (!root || hasTraversal(root)) throw new Error('背景保存目录无效。');
    this.storage = storage;
    this.files = files;
    this.root = `${root}/sdu-memory/journal-background`;
  }

  private readStored(): JournalBackground {
    try {
      if (!this.storage.has(JOURNAL_BACKGROUND_STORAGE_KEY)) return { ...defaults };
      const raw = this.storage.read(JOURNAL_BACKGROUND_STORAGE_KEY);
      let value: unknown;
      try {
        value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : null;
      } catch {
        value = null;
      }
      const item = value as Record<string, unknown> | null;
      if (
        !item ||
        item.schemaVersion !== 1 ||
        typeof item.imagePath !== 'string' ||
        !item.imagePath.startsWith(`${this.root}/`) ||
        !FILE_NAME_PATTERN.test(item.imagePath.slice(this.root.length + 1)) ||
        !Number.isInteger(item.clarity) ||
        (item.clarity as number) < 10 ||
        (item.clarity as number) > 100
      ) {
        throw new JournalBackgroundError('CORRUPT_DATA', '背景设置已损坏，请重新选择图片。');
      }
      return { imagePath: item.imagePath, clarity: item.clarity as number };
    } catch (error: unknown) {
      if (error instanceof JournalBackgroundError) throw error;
      throw new JournalBackgroundError('READ_FAILED', '背景设置读取失败，请稍后重试。');
    }
  }

  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.mutations.then(operation);
    this.mutations = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  read(): Promise<JournalBackground> {
    return this.mutations.then(() => this.readStored());
  }

  private write(value: JournalBackground): void {
    this.storage.write(
      JOURNAL_BACKGROUND_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, ...value }),
    );
  }

  saveImage(tempFilePath: string): Promise<JournalBackground> {
    return this.enqueue(async () => {
      if (
        typeof tempFilePath !== 'string' ||
        !tempFilePath.trim() ||
        tempFilePath.includes('\0') ||
        hasTraversal(tempFilePath) ||
        (/^[A-Za-z]+:\/\//u.test(tempFilePath) &&
          !/^(wxfile:\/\/|https?:\/\/tmp\/)/u.test(tempFilePath))
      ) {
        throw new JournalBackgroundError('SAVE_FAILED', '图片无法读取，请重新选择。');
      }
      let previous = { ...defaults };
      try {
        previous = this.readStored();
      } catch (error: unknown) {
        if (!(error instanceof JournalBackgroundError) || error.code !== 'CORRUPT_DATA')
          throw error;
      }
      const extension =
        /\.(png|jpe?g|webp|heic|heif|gif)$/iu.exec(tempFilePath)?.[1]?.toLowerCase() ?? 'jpg';
      const name = `${Date.now().toString(36)}-${sequence++}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
      const next = { imagePath: `${this.root}/${name}`, clarity: previous.clarity };
      try {
        await this.files.ensureDirectory(this.root);
        await this.files.saveFile(tempFilePath, next.imagePath);
        this.write(next);
      } catch {
        await this.files.removeFile(next.imagePath).catch(() => undefined);
        throw new JournalBackgroundError('SAVE_FAILED', '背景保存失败，请检查本机空间后重试。');
      }
      if (previous.imagePath)
        await this.files.removeFile(previous.imagePath).catch(() => undefined);
      return next;
    });
  }

  setClarity(clarity: number): Promise<JournalBackground> {
    return this.enqueue(() => {
      if (!Number.isInteger(clarity) || clarity < 10 || clarity > 100) {
        throw new JournalBackgroundError('SAVE_FAILED', '请选择有效的背景清晰度。');
      }
      const current = this.readStored();
      if (!current.imagePath) return current;
      const next = { ...current, clarity };
      try {
        this.write(next);
      } catch {
        throw new JournalBackgroundError('SAVE_FAILED', '背景设置保存失败，原清晰度已保留。');
      }
      return next;
    });
  }

  clear(): Promise<void> {
    return this.enqueue(async () => {
      try {
        this.storage.remove(JOURNAL_BACKGROUND_STORAGE_KEY);
      } catch {
        throw new JournalBackgroundError('CLEAR_FAILED', '恢复默认背景失败，请稍后重试。');
      }
      try {
        await this.files.removeDirectory(this.root);
      } catch {
        throw new JournalBackgroundError(
          'CLEAR_FAILED',
          '背景已恢复默认，但旧图片未能清理，请稍后重试。',
        );
      }
    });
  }
}

let defaultService: JournalBackgroundService | undefined;
function service(): JournalBackgroundService {
  if (!defaultService) {
    const manager = wx.getFileSystemManager();
    const files = createWechatLocalImageFileSystemAdapter(manager);
    defaultService = new JournalBackgroundService(
      wechatStorageAdapter,
      {
        ...files,
        // Copy keeps the selected temporary image available for retry after metadata failure.
        saveFile: (source, destination) =>
          new Promise<void>((resolve, reject) => {
            manager.copyFile({
              srcPath: source,
              destPath: destination,
              success: () => resolve(),
              fail: (result) => reject(new Error(result.errMsg)),
            });
          }),
      },
      wx.env.USER_DATA_PATH,
    );
  }
  return defaultService;
}

export const journalBackgroundService = {
  read: (): Promise<JournalBackground> => service().read(),
  saveImage: (path: string): Promise<JournalBackground> => service().saveImage(path),
  setClarity: (clarity: number): Promise<JournalBackground> => service().setClarity(clarity),
  clear: (): Promise<void> => service().clear(),
};
