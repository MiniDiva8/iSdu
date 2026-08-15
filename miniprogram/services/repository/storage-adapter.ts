export interface StorageAdapter {
  has(key: string): boolean;
  read(key: string): unknown;
  remove(key: string): void;
  write(key: string, value: string): void;
}

export const wechatStorageAdapter: StorageAdapter = {
  has: (key) => wx.getStorageInfoSync().keys.includes(key),
  read: (key) => wx.getStorageSync(key),
  remove: (key) => {
    wx.removeStorageSync(key);
  },
  write: (key, value) => {
    wx.setStorageSync(key, value);
  },
};
