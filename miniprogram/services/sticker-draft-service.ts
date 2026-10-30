import { parseStickerDocument, type StickerDocument } from '../utils/sticker-document';
import { wechatStorageAdapter, type StorageAdapter } from './repository/storage-adapter';

const STORAGE_KEY = 'isdu:sticker-draft:v1';
const MAX_BYTES = 650000;
export class StickerDraftService {
  private readonly storage: StorageAdapter;
  constructor(storage: StorageAdapter = wechatStorageAdapter) {
    this.storage = storage;
  }
  read(): StickerDocument | null {
    if (!this.storage.has(STORAGE_KEY)) return null;
    const raw = this.storage.read(STORAGE_KEY);
    if (typeof raw !== 'string' || raw.length > MAX_BYTES) return null;
    try {
      return parseStickerDocument(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }
  save(input: StickerDocument): void {
    const doc = parseStickerDocument(input);
    if (!doc) throw new Error('贴纸草稿格式无效，当前画面仍保留。');
    const serialized = JSON.stringify(doc);
    if (serialized.length > MAX_BYTES)
      throw new Error('贴纸内容过多，请先加入日记再开始新的创作。');
    this.storage.write(STORAGE_KEY, serialized);
  }
  clear(): void {
    this.storage.remove(STORAGE_KEY);
  }
}
export const stickerDraftService = new StickerDraftService();
