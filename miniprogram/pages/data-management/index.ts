import { localImageService } from '../../services/local-image-service';
import { memoryMigrationService } from '../../services/memory-migration-service';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { cloudAuthRepository } from '../../services/repository/cloud-auth-repository';
import { localMemoryRepository } from '../../services/repository/local-memory-repository';
import { userProfileRepository } from '../../services/repository/index';

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

function confirmCloudBackup(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '开启云端与好友功能？',
      content:
        '开启后，iSdu 会在你确认时把本机回忆、照片、正文和插画地图比例位置备份到 CloudBase。所有迁移回忆默认仅自己可见；不会读取微信好友、通讯录、手机号或 GPS。',
      confirmText: '同意',
      cancelText: '暂不开启',
      success: (result) => resolve(result.confirm),
      fail: (result) => reject(new Error(result.errMsg)),
    });
  });
}

function confirmDeleteCloudData(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '删除全部 iSdu 云端数据？',
      content:
        '这会删除你的云端回忆、云端照片、点赞、好友关系和云端资料，且无法恢复。本机迁移前备份不会自动删除，完成后将切回本地模式。',
      confirmText: '删除云端数据',
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
    cloudModeActive: false,
    cloudStatusLabel: '尚未开启',
    isMigrating: false,
    isDeletingCloud: false,
    migrationProgressLabel: '',
    isClearing: false,
  },

  onShow() {
    this.refreshCloudStatus();
  },

  refreshCloudStatus() {
    const state = cloudModeService.getState();
    this.setData({
      cloudModeActive: state.mode === 'cloud',
      cloudStatusLabel:
        state.mode === 'cloud' && state.migrationCompletedAt
          ? `云端主数据已启用 · 本机备份保留于 ${state.migrationCompletedAt.slice(0, 10)}`
          : '尚未开启，回忆仍只保存在本机',
    });
  },

  async enableCloudAndMigrate() {
    if (this.data.isMigrating || this.data.cloudModeActive) {
      return;
    }

    try {
      if (!(await confirmCloudBackup())) {
        return;
      }
    } catch (error: unknown) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : '隐私确认窗口打开失败。',
      });
      return;
    }

    cloudModeService.acceptPrivacy();
    this.setData({
      actionMessage: '正在确认云端身份…',
      isMigrating: true,
      migrationProgressLabel: '',
    });

    try {
      await cloudAuthRepository.bootstrap();
      const localProfile = await userProfileRepository.getProfile();
      if (localProfile?.displayName) {
        await cloudAuthRepository.updateMyProfile({
          displayName: localProfile.displayName,
          signature: localProfile.signature,
        });
      }

      const report = await memoryMigrationService.migrateAll((progress) => {
        this.setData({
          migrationProgressLabel: `正在备份 ${progress.completed + 1}/${progress.total}`,
        });
      });

      if (report.failed.length > 0) {
        this.setData({
          actionMessage: `已备份 ${report.migrated}/${report.total} 条，${report.failed.length} 条失败。本机数据完整保留，请检查照片后重试。`,
          isMigrating: false,
          migrationProgressLabel: '',
        });
        return;
      }

      this.setData({
        actionMessage: `云端备份核验完成：${report.migrated} 条用户回忆；${report.skippedDemo} 条演示数据未上传。`,
        isMigrating: false,
        migrationProgressLabel: '',
      });
      this.refreshCloudStatus();
      void wx.showToast({ title: '云端备份完成', icon: 'success' });
    } catch (error: unknown) {
      this.setData({
        actionMessage:
          error instanceof Error
            ? `云端开启失败：${error.message}。本机数据没有被清除。`
            : '云端开启失败，本机数据没有被清除。',
        isMigrating: false,
        migrationProgressLabel: '',
      });
    }
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
      await localMemoryRepository.clearMemories();
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

  async deleteAllCloudData() {
    if (this.data.isDeletingCloud || !this.data.cloudModeActive) return;
    try {
      if (!(await confirmDeleteCloudData())) return;
      this.setData({ actionMessage: '正在删除全部云端数据…', isDeletingCloud: true });
      const result = await cloudAuthRepository.deleteCloudAccount();
      cloudModeService.resetToLocal();
      this.setData({
        actionMessage:
          result.orphanFileCount > 0
            ? `云端业务数据已删除，但 ${result.orphanFileCount} 个云存储文件未能确认清理，请联系运营者处理。`
            : '全部云端数据已删除，已切回本地模式；本机备份仍保留。',
        isDeletingCloud: false,
      });
      this.refreshCloudStatus();
    } catch (error: unknown) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : '云端数据删除失败，请稍后重试。',
        isDeletingCloud: false,
      });
    }
  },

  returnToMap() {
    void wx.switchTab({
      url: '/pages/map/index',
    });
  },
});
