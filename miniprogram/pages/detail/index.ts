import { hasJournalLocation } from '../../utils/journal';
import { getMemoryCategoryLabel, getMemoryMoodLabel, type Memory } from '../../models/memory';
import { localImageService } from '../../services/local-image-service';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { memoryRepository } from '../../services/repository/index';
import { formatMemoryDateTime } from '../../utils/date-format';
import { campusMapConfig } from '../../config/campus-map';
import { consumeMapFocusIntent, setMapFocusIntent } from '../../services/map-focus-intent';
import type { CloudMemory } from '../../models/cloud-memory';
import { cloudMemoryRepository } from '../../services/repository/cloud-memory-repository';
import { cloudLikeRepository } from '../../services/repository/cloud-like-repository';

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

function friendMapUnavailableReason(memory: Memory): string {
  if (!hasJournalLocation(memory)) return '这篇日记没有关联校园地点。';
  if (memory.mapAssetVersion !== campusMapConfig.assetVersion)
    return '这篇日记使用旧版地图，暂时无法在当前校园地图中定位。';
  const publishedAt = (memory as CloudMemory).publishedAt;
  const publishedTime = typeof publishedAt === 'string' ? Date.parse(publishedAt) : NaN;
  const now = Date.now();
  if (!Number.isFinite(publishedTime) || publishedTime > now)
    return '暂时无法确认分享时间，重新打开日记后再试。';
  return publishedTime < now - 24 * 60 * 60 * 1000
    ? '已超过分享后的 24 小时，好友校园地图中不再显示；仍可在这里阅读日记。'
    : '';
}

Page({
  data: {
    actionMessage: '',
    canRetryLoad: false,
    categoryLabel: '',
    coordinateLabel: '',
    displayPlaceName: '',
    formattedRecordedAt: '',
    hasText: false,
    hasLocation: false,
    canShowOnMap: false,
    mapUnavailableReason: '',
    isDeleting: false,
    isFriendMemory: false,
    isLikeSaving: false,
    isLoading: true,
    loadError: '',
    loadErrorTitle: '',
    memory: null as Memory | null,
    memoryId: '',
    moodLabel: '',
    ownerDisplayName: '',
    likeCount: 0,
    likedByMe: false,
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

    this.setData({ isFriendMemory: query.source === 'friend', memoryId });
  },

  onShow() {
    if (this.data.memoryId && !this.data.isDeleting) {
      void this.loadMemory();
    }
  },

  async loadMemory() {
    if (!this.data.memoryId || this.data.isDeleting) return;
    this.setData({
      actionMessage: '',
      canRetryLoad: false,
      isLoading: true,
      loadError: '',
      loadErrorTitle: '',
    });

    try {
      const memory = this.data.isFriendMemory
        ? await cloudMemoryRepository.getSharedMemoryById(this.data.memoryId)
        : await memoryRepository.getMemoryById(this.data.memoryId);

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

      const cloudMemory = this.data.isFriendMemory ? (memory as CloudMemory) : null;
      const mapUnavailableReason = cloudMemory ? friendMapUnavailableReason(memory) : '';
      this.setData({
        hasLocation: hasJournalLocation(memory),
        canShowOnMap: hasJournalLocation(memory) && !mapUnavailableReason,
        mapUnavailableReason,
        categoryLabel: getMemoryCategoryLabel(memory),
        coordinateLabel: hasJournalLocation(memory)
          ? '已关联校园地图上的位置'
          : '这篇日记没有关联校园地点',
        displayPlaceName: memory.placeName || getMemoryMoodLabel(memory),
        formattedRecordedAt: formatMemoryDateTime(memory.recordedAt),
        hasText: Boolean(memory.text),
        isLoading: false,
        memory,
        likeCount: cloudMemory?.likeCount ?? 0,
        likedByMe: cloudMemory?.likedByMe ?? false,
        ownerDisplayName: cloudMemory?.ownerDisplayName ?? '',
        moodLabel: getMemoryMoodLabel(memory),
        mapPreviewMarkerX: `${(memory.mapXRatio * 100).toFixed(3)}%`,
        mapPreviewMarkerY: `${(memory.mapYRatio * 100).toFixed(3)}%`,
        photoItems: createPhotoItems(memory.imagePaths),
      });
    } catch (error: unknown) {
      this.setData({
        canRetryLoad: true,
        isLoading: false,
        loadError: describeError(error, '读取本地日记失败，请稍后重试。'),
        loadErrorTitle: '记忆暂时无法读取',
        memory: null,
        photoItems: [],
      });
    }
  },

  async toggleLike() {
    if (!this.data.isFriendMemory || this.data.isLikeSaving || !this.data.memory) return;
    const target = !this.data.likedByMe;
    this.setData({ actionMessage: '', isLikeSaving: true });
    try {
      const state = await cloudLikeRepository.setLiked(this.data.memory.id, target);
      this.setData({
        isLikeSaving: false,
        likeCount: state.likeCount,
        likedByMe: state.likedByMe,
      });
    } catch (error: unknown) {
      this.setData({
        actionMessage: describeError(error, '点赞失败，好友关系或回忆权限可能已经改变。'),
        isLikeSaving: false,
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

  previewPhoto(event: WechatMiniprogram.BaseEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const current = this.data.photoItems[index];
    const urls = this.data.photoItems.filter((item) => !item.isMissing).map((item) => item.path);
    if (current && !current.isMissing) void wx.previewImage({ current: current.path, urls });
  },

  editMemory() {
    if (!this.data.memory || this.data.isDeleting || this.data.isFriendMemory) {
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

    if (!hasJournalLocation(memory)) {
      this.setData({ actionMessage: '这篇日记还没有关联校园地点，可以编辑后添加。' });
      return;
    }

    if (this.data.isFriendMemory) {
      const reason = friendMapUnavailableReason(memory);
      if (reason) {
        this.setData({ canShowOnMap: false, mapUnavailableReason: reason, actionMessage: reason });
        return;
      }
    }

    setMapFocusIntent({
      mapXRatio: memory.mapXRatio,
      mapYRatio: memory.mapYRatio,
      memoryId: memory.id,
      source: this.data.isFriendMemory ? 'friend-timeline' : 'detail',
    });

    void switchToMap().catch((error: unknown) => {
      consumeMapFocusIntent();
      this.setData({
        actionMessage: describeError(error, '地图暂时无法打开，请稍后重试。'),
      });
    });
  },

  async deleteMemory() {
    const memory = this.data.memory;

    if (!memory || this.data.isDeleting || this.data.isFriendMemory) {
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
      actionMessage: cleanupWarning || '日记已删除，正在返回日记首页。',
      canRetryLoad: false,
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
      await new Promise<void>((resolve, reject) =>
        wx.switchTab({
          url: '/pages/journal/index',
          success: () => resolve(),
          fail: (error) => reject(new Error(error.errMsg)),
        }),
      );
    } catch (error: unknown) {
      this.setData({
        loadError: `日记已删除，但返回日记首页失败：${describeError(error, '请手动返回日记首页。')}`,
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
