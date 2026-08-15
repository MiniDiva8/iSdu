import { getMemoryCategoryLabel, getMemoryMoodLabel, type Memory } from '../../models/memory';
import { localImageService } from '../../services/local-image-service';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { memoryRepository } from '../../services/repository/index';
import { formatMemoryDateTime } from '../../utils/date-format';
import { campusMapConfig } from '../../config/campus-map';
import { setMapFocusIntent } from '../../services/map-focus-intent';

interface DetailPhoto {
  isMissing: boolean;
  path: string;
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function confirmDelete(): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    wx.showModal({
      title: '删除这段校园记忆？',
      content:
        cloudModeService.getState().mode === 'cloud'
          ? '删除后，云端回忆和关联云端照片将被清理，且无法恢复；本机迁移前备份不受影响。'
          : '删除后，日记和不再被其他日记使用的本地照片将被清理，且无法恢复。',
      confirmText: '删除',
      confirmColor: '#a85f62',
      cancelText: '保留',
      success: (result) => {
        resolve(result.confirm);
      },
      fail: (result) => {
        reject(new Error(result.errMsg));
      },
    });
  });
}

function showNotice(title: string, content: string): Promise<void> {
  return new Promise<void>((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '知道了',
      complete: () => {
        resolve();
      },
    });
  });
}

function switchToMap(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    wx.switchTab({
      url: '/pages/map/index',
      success: () => {
        resolve();
      },
      fail: (result) => {
        reject(new Error(result.errMsg));
      },
    });
  });
}

function createPhotoItems(imagePaths: readonly string[]): DetailPhoto[] {
  return imagePaths.map((path) => ({
    isMissing: false,
    path,
  }));
}

Page({
  data: {
    actionMessage: '',
    categoryLabel: '',
    coordinateLabel: '',
    displayPlaceName: '',
    formattedRecordedAt: '',
    hasText: false,
    isDeleting: false,
    isLoading: true,
    loadError: '',
    loadErrorTitle: '',
    memory: null as Memory | null,
    memoryId: '',
    moodLabel: '',
    mapPreviewSource: campusMapConfig.assetPath,
    mapPreviewMarkerX: '50%',
    mapPreviewMarkerY: '50%',
    photoItems: [] as DetailPhoto[],
  },

  onLoad(query: Record<string, string | undefined>) {
    const memoryId = query.memoryId?.trim() ?? '';

    if (!memoryId) {
      this.setData({
        isLoading: false,
        loadError: '没有收到有效的日记 ID，请从地图上的记忆标记重新进入。',
        loadErrorTitle: '无法打开记忆',
      });
      return;
    }

    this.setData({ memoryId });
  },

  onShow() {
    if (this.data.memoryId && !this.data.isDeleting) {
      void this.loadMemory();
    }
  },

  async loadMemory() {
    this.setData({
      actionMessage: '',
      isLoading: true,
      loadError: '',
      loadErrorTitle: '',
    });

    try {
      const memory = await memoryRepository.getMemoryById(this.data.memoryId);

      if (!memory) {
        this.setData({
          isLoading: false,
          loadError: '这段记忆可能已经被删除，或链接中的日记 ID 不存在。',
          loadErrorTitle: '没有找到这段记忆',
          memory: null,
          photoItems: [],
        });
        return;
      }

      this.setData({
        categoryLabel: getMemoryCategoryLabel(memory),
        coordinateLabel: '已保存在校园地图上的原位置',
        displayPlaceName: memory.placeName || '未填写地点名称',
        formattedRecordedAt: formatMemoryDateTime(memory.recordedAt),
        hasText: Boolean(memory.text),
        isLoading: false,
        memory,
        moodLabel: getMemoryMoodLabel(memory),
        mapPreviewMarkerX: `${(memory.mapXRatio * 100).toFixed(3)}%`,
        mapPreviewMarkerY: `${(memory.mapYRatio * 100).toFixed(3)}%`,
        photoItems: createPhotoItems(memory.imagePaths),
      });
    } catch (error: unknown) {
      this.setData({
        isLoading: false,
        loadError: describeError(error, '读取本地日记失败，请稍后重试。'),
        loadErrorTitle: '记忆暂时无法读取',
        memory: null,
        photoItems: [],
      });
    }
  },

  handleImageError(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { index?: unknown };
    const index = typeof dataset.index === 'number' ? dataset.index : Number(dataset.index);

    if (!Number.isInteger(index) || index < 0 || index >= this.data.photoItems.length) {
      return;
    }

    this.setData({
      photoItems: this.data.photoItems.map((photo, photoIndex) =>
        photoIndex === index ? { ...photo, isMissing: true } : photo,
      ),
    });
  },

  editMemory() {
    if (!this.data.memory || this.data.isDeleting) {
      return;
    }

    void wx.navigateTo({
      url: `/pages/editor/index?memoryId=${encodeURIComponent(this.data.memory.id)}`,
      fail: () => {
        this.setData({
          actionMessage: '编辑页打开失败，请检查页面配置后重试。',
        });
      },
    });
  },

  showOnMap() {
    const memory = this.data.memory;
    if (!memory || this.data.isDeleting) {
      return;
    }

    setMapFocusIntent({
      mapXRatio: memory.mapXRatio,
      mapYRatio: memory.mapYRatio,
      memoryId: memory.id,
      source: 'detail',
    });

    void switchToMap().catch((error: unknown) => {
      this.setData({
        actionMessage: describeError(error, '地图暂时无法打开，请稍后重试。'),
      });
    });
  },

  async deleteMemory() {
    const memory = this.data.memory;

    if (!memory || this.data.isDeleting) {
      return;
    }

    try {
      const confirmed = await confirmDelete();

      if (!confirmed) {
        return;
      }
    } catch (error: unknown) {
      this.setData({
        actionMessage: describeError(error, '删除确认窗口打开失败，请稍后重试。'),
      });
      return;
    }

    this.setData({
      actionMessage:
        cloudModeService.getState().mode === 'cloud'
          ? '正在删除云端回忆并清理照片…'
          : '正在删除日记并清理本地照片…',
      isDeleting: true,
    });

    try {
      await memoryRepository.deleteMemory(memory.id);
    } catch (error: unknown) {
      this.setData({
        actionMessage: describeError(error, '删除回忆失败，请稍后重试。'),
        isDeleting: false,
      });
      return;
    }

    let cleanupWarning = '';

    try {
      const remainingMemories = await memoryRepository.listMemories();
      const referencedPaths = new Set(remainingMemories.flatMap((item) => item.imagePaths));
      const cleanupTargets = memory.imagePaths.filter(
        (path) => localImageService.isManagedImagePath(path) && !referencedPaths.has(path),
      );

      if (cleanupTargets.length > 0) {
        const cleanupResult = await localImageService.cleanupManagedImages(cleanupTargets);

        if (cleanupResult.failedPaths.length > 0) {
          cleanupWarning = `日记已经删除，但有 ${cleanupResult.failedPaths.length} 张本地照片未能清理，可能仍占用存储空间。`;
        }
      }
    } catch (error: unknown) {
      cleanupWarning = `日记已经删除，但无法确认照片是否仍被其他日记使用，因此没有继续清理照片。${describeError(
        error,
        '',
      )}`;
    }

    this.setData({
      actionMessage: cleanupWarning || '日记已删除，正在返回地图。',
      isDeleting: false,
      loadError: cleanupWarning || '这段记忆已经从本地日记中删除。',
      loadErrorTitle: '日记已删除',
      memory: null,
      photoItems: [],
    });

    if (cleanupWarning) {
      await showNotice('日记已删除，照片清理未完全完成', cleanupWarning);
    } else {
      void wx.showToast({
        title: '记忆已删除',
        icon: 'success',
        fail: () => {
          this.setData({ actionMessage: '日记已删除，但成功提示未能显示。' });
        },
      });
    }

    try {
      await switchToMap();
    } catch (error: unknown) {
      this.setData({
        loadError: `日记已删除，但返回地图失败：${describeError(error, '请手动返回地图。')}`,
        loadErrorTitle: '日记已删除',
      });
    }
  },

  returnToMap() {
    void switchToMap().catch((error: unknown) => {
      this.setData({
        actionMessage: describeError(error, '地图暂时无法打开，请稍后重试。'),
      });
    });
  },
});
