import { isMemoryId } from '../models/memory';

const MIN_IMAGE_COUNT = 1;
const MAX_IMAGE_COUNT = 3;
const MANAGED_IMAGE_DIRECTORY = 'sdu-memory/images';

const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_IMAGE_EXTENSIONS = new Set(['gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);

export type LocalImageServiceErrorCode =
  | 'CLEANUP_FAILED'
  | 'INVALID_IMAGE_COUNT'
  | 'INVALID_MEMORY_ID'
  | 'INVALID_TEMP_FILE_PATH'
  | 'SAVE_FAILED';

export interface LocalImageCleanupResult {
  readonly failedPaths: string[];
  readonly removedPaths: string[];
}

export interface LocalImageFileSystemAdapter {
  ensureDirectory(directoryPath: string): Promise<void>;
  removeDirectory(directoryPath: string): Promise<void>;
  removeFile(filePath: string): Promise<void>;
  saveFile(tempFilePath: string, destinationPath: string): Promise<void>;
}

export interface ImageFileNameContext {
  readonly index: number;
  readonly tempFilePath: string;
}

export interface LocalImageServiceOptions {
  readonly adapter: LocalImageFileSystemAdapter;
  readonly createFileName?: (context: ImageFileNameContext) => string;
  readonly userDataPath: string;
}

export interface LocalImageServiceApi {
  clearAllManagedImages(): Promise<void>;
  cleanupManagedImages(filePaths: readonly string[]): Promise<LocalImageCleanupResult>;
  isManagedImagePath(filePath: string): boolean;
  persistTempImages(memoryId: string, tempFilePaths: readonly string[]): Promise<string[]>;
}

export class LocalImageServiceError extends Error {
  readonly code: LocalImageServiceErrorCode;
  readonly failedPaths: string[];

  constructor(
    code: LocalImageServiceErrorCode,
    message: string,
    failedPaths: readonly string[] = [],
  ) {
    super(message);
    this.name = 'LocalImageServiceError';
    this.code = code;
    this.failedPaths = [...failedPaths];
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '');
}

function hasParentTraversal(path: string): boolean {
  return path.split('/').some((segment) => segment === '..');
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : '未知文件系统错误';
}

function extractSafeExtension(tempFilePath: string): string {
  const pathWithoutQuery = tempFilePath.split(/[?#]/u, 1)[0] ?? '';
  const match = /\.([A-Za-z0-9]+)$/u.exec(pathWithoutQuery);
  const extension = match?.[1]?.toLowerCase();

  return extension && SAFE_IMAGE_EXTENSIONS.has(extension) ? `.${extension}` : '';
}

function defaultCreateFileName(context: ImageFileNameContext): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  const extension = extractSafeExtension(context.tempFilePath);

  return `${timestamp}-${context.index + 1}-${randomPart}${extension}`;
}

function validateMemoryId(memoryId: string): void {
  if (!isMemoryId(memoryId)) {
    throw new LocalImageServiceError(
      'INVALID_MEMORY_ID',
      'memoryId 必须由字母、数字、下划线或连字符组成，且长度不超过 100 个字符',
    );
  }
}

function validateTempFilePaths(tempFilePaths: readonly string[]): void {
  if (tempFilePaths.length < MIN_IMAGE_COUNT || tempFilePaths.length > MAX_IMAGE_COUNT) {
    throw new LocalImageServiceError(
      'INVALID_IMAGE_COUNT',
      `每次需要保存 ${MIN_IMAGE_COUNT} 至 ${MAX_IMAGE_COUNT} 张图片`,
    );
  }

  const uniquePaths = new Set<string>();

  for (const tempFilePath of tempFilePaths) {
    if (!tempFilePath.trim() || uniquePaths.has(tempFilePath)) {
      throw new LocalImageServiceError('INVALID_TEMP_FILE_PATH', '临时图片路径不能为空或重复');
    }

    uniquePaths.add(tempFilePath);
  }
}

function validateFileName(fileName: string): void {
  if (!FILE_NAME_PATTERN.test(fileName) || fileName.includes('..')) {
    throw new LocalImageServiceError('SAVE_FAILED', '图片文件名不安全，已阻止写入用户目录');
  }
}

export class LocalImageService implements LocalImageServiceApi {
  private readonly adapter: LocalImageFileSystemAdapter;
  private readonly createFileName: (context: ImageFileNameContext) => string;
  private readonly managedRoot: string;

  constructor(options: LocalImageServiceOptions) {
    const userDataPath = normalizePath(options.userDataPath.trim());

    if (!userDataPath || hasParentTraversal(userDataPath)) {
      throw new LocalImageServiceError('SAVE_FAILED', 'USER_DATA_PATH 无效');
    }

    this.adapter = options.adapter;
    this.createFileName = options.createFileName ?? defaultCreateFileName;
    this.managedRoot = `${userDataPath}/${MANAGED_IMAGE_DIRECTORY}`;
  }

  async persistTempImages(memoryId: string, tempFilePaths: readonly string[]): Promise<string[]> {
    validateMemoryId(memoryId);
    validateTempFilePaths(tempFilePaths);

    const directoryPath = `${this.managedRoot}/${memoryId}`;
    const savedPaths: string[] = [];

    try {
      await this.adapter.ensureDirectory(directoryPath);

      for (const [index, tempFilePath] of tempFilePaths.entries()) {
        const fileName = this.createFileName({ index, tempFilePath });
        validateFileName(fileName);

        const destinationPath = `${directoryPath}/${fileName}`;
        await this.adapter.saveFile(tempFilePath, destinationPath);
        savedPaths.push(destinationPath);
      }

      return savedPaths;
    } catch (error: unknown) {
      const rollbackResult = await this.cleanupManagedImages([...savedPaths].reverse());

      if (error instanceof LocalImageServiceError) {
        throw new LocalImageServiceError(error.code, error.message, rollbackResult.failedPaths);
      }

      throw new LocalImageServiceError(
        'SAVE_FAILED',
        `本地图片保存失败：${describeError(error)}`,
        rollbackResult.failedPaths,
      );
    }
  }

  async clearAllManagedImages(): Promise<void> {
    try {
      await this.adapter.removeDirectory(this.managedRoot);
    } catch (error: unknown) {
      throw new LocalImageServiceError(
        'CLEANUP_FAILED',
        `本地照片清理失败：${describeError(error)}`,
      );
    }
  }

  async cleanupManagedImages(filePaths: readonly string[]): Promise<LocalImageCleanupResult> {
    const failedPaths: string[] = [];
    const removedPaths: string[] = [];
    const visitedPaths = new Set<string>();

    for (const filePath of filePaths) {
      const normalizedPath = normalizePath(filePath.trim());

      if (!normalizedPath || visitedPaths.has(normalizedPath)) {
        continue;
      }

      visitedPaths.add(normalizedPath);

      if (!this.isManagedImagePath(normalizedPath)) {
        failedPaths.push(normalizedPath || filePath);
        continue;
      }

      try {
        await this.adapter.removeFile(normalizedPath);
        removedPaths.push(normalizedPath);
      } catch {
        failedPaths.push(normalizedPath);
      }
    }

    return {
      failedPaths,
      removedPaths,
    };
  }

  isManagedImagePath(filePath: string): boolean {
    const normalizedPath = normalizePath(filePath.trim());
    const managedPrefix = `${this.managedRoot}/`;

    return (
      normalizedPath.startsWith(managedPrefix) &&
      normalizedPath.length > managedPrefix.length &&
      !hasParentTraversal(normalizedPath)
    );
  }
}

export function createWechatLocalImageFileSystemAdapter(
  fileSystemManager: WechatMiniprogram.FileSystemManager,
): LocalImageFileSystemAdapter {
  return {
    ensureDirectory: (directoryPath) =>
      new Promise<void>((resolve, reject) => {
        fileSystemManager.mkdir({
          dirPath: directoryPath,
          recursive: true,
          success: () => {
            resolve();
          },
          fail: (result) => {
            reject(new Error(result.errMsg));
          },
        });
      }),
    removeDirectory: (directoryPath) =>
      new Promise<void>((resolve, reject) => {
        fileSystemManager.rmdir({
          dirPath: directoryPath,
          recursive: true,
          success: () => {
            resolve();
          },
          fail: (result) => {
            if (/no such file|not exist/iu.test(result.errMsg)) {
              resolve();
              return;
            }

            reject(new Error(result.errMsg));
          },
        });
      }),
    removeFile: (filePath) =>
      new Promise<void>((resolve, reject) => {
        fileSystemManager.unlink({
          filePath,
          success: () => {
            resolve();
          },
          fail: (result) => {
            reject(new Error(result.errMsg));
          },
        });
      }),
    saveFile: (tempFilePath, destinationPath) =>
      new Promise<void>((resolve, reject) => {
        fileSystemManager.saveFile({
          filePath: destinationPath,
          tempFilePath,
          success: () => {
            resolve();
          },
          fail: (result) => {
            reject(new Error(result.errMsg));
          },
        });
      }),
  };
}

export function createWechatLocalImageService(): LocalImageService {
  return new LocalImageService({
    adapter: createWechatLocalImageFileSystemAdapter(wx.getFileSystemManager()),
    userDataPath: wx.env.USER_DATA_PATH,
  });
}

let defaultWechatLocalImageService: LocalImageService | undefined;

function getDefaultWechatLocalImageService(): LocalImageService {
  if (!defaultWechatLocalImageService) {
    defaultWechatLocalImageService = createWechatLocalImageService();
  }

  return defaultWechatLocalImageService;
}

export const localImageService: LocalImageServiceApi = {
  clearAllManagedImages: () => getDefaultWechatLocalImageService().clearAllManagedImages(),
  cleanupManagedImages: (filePaths) =>
    getDefaultWechatLocalImageService().cleanupManagedImages(filePaths),
  isManagedImagePath: (filePath) =>
    getDefaultWechatLocalImageService().isManagedImagePath(filePath),
  persistTempImages: (memoryId, tempFilePaths) =>
    getDefaultWechatLocalImageService().persistTempImages(memoryId, tempFilePaths),
};
