import { localImageService } from '../../services/local-image-service';
import { memoryRepository, userProfileRepository } from '../../services/repository/index';

function confirmClearAllData(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '清除全部本机数据？',
      content:
        '这会永久删除本机保存的所有回忆、照片、名字和个性签名，且无法恢复。请确认当前没有需要保留的内容。',
      confirmText: '全部清除',
      confirmColor: '#c65a55',
      cancelText: '取消',
      success: (result) => resolve(result.confirm),
      fail: (result) => reject(new Error(result.errMsg)),
    });
  });
}

Page({
  data: {
    actionMessage: '',
    isClearing: false,
  },

  async clearAllLocalData() {
    if (this.data.isClearing) {
      return;
    }

    try {
      if (!(await confirmClearAllData())) {
        return;
      }
    } catch (error: unknown) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : '确认窗口打开失败，请稍后重试。',
      });
      return;
    }

    this.setData({ actionMessage: '正在清除本机数据…', isClearing: true });
    try {
      await memoryRepository.clearMemories();
    } catch (error: unknown) {
      this.setData({
        actionMessage:
          error instanceof Error
            ? `回忆数据未能清除，照片仍被保留：${error.message}`
            : '回忆数据未能清除，照片仍被保留；请勿假定数据已经删除。',
        isClearing: false,
      });
      return;
    }

    const cleanupWarnings: string[] = [];

    try {
      await userProfileRepository.clearProfile();
    } catch (error: unknown) {
      cleanupWarnings.push(error instanceof Error ? error.message : '个人资料未能清除');
    }

    try {
      await localImageService.clearAllManagedImages();
    } catch (error: unknown) {
      cleanupWarnings.push(error instanceof Error ? error.message : '照片目录未能完全清理');
    }

    const actionMessage =
      cleanupWarnings.length > 0
        ? `回忆已经清除，但仍有部分数据未完成：${cleanupWarnings.join('；')}`
        : '本机保存的回忆、照片和个人资料已清除。';

    this.setData({ actionMessage, isClearing: false });

    if (cleanupWarnings.length === 0) {
      void wx.showToast({ title: '本机数据已清除', icon: 'success' });
    }
  },

  returnToMap() {
    void wx.switchTab({
      url: '/pages/map/index',
    });
  },
});
