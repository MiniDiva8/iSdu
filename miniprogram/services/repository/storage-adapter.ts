export interface StorageAdapter {
  has(key: string): boolean;
  read(key: string): unknown;
  write(key: string, value: string): void;
}

export const wechatStorageAdapter: StorageAdapter = {
  has: (key) => wx.getStorageInfoSync().keys.includes(key),
  read: (key) => wx.getStorageSync(key),
  write: (key, value) => {
    wx.setStorageSync(key, value);
  },
};
