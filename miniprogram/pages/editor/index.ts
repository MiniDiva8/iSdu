import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  MEMORY_CUSTOM_LABEL_MAX_LENGTH,
  MEMORY_IMAGE_MAX_COUNT,
  MEMORY_MOODS,
  MEMORY_MOOD_LABELS,
  MEMORY_PLACE_MAX_LENGTH,
  MEMORY_TEXT_MAX_LENGTH,
  MemoryValidationError,
  createMemoryId,
  isMemoryCategory,
  isMemoryMood,
  type Memory,
  type MemoryCategory,
  type MemoryContentInput,
  type MemoryMood,
} from '../../models/memory';
import {
  isMemoryVisibility,
  type CloudMemory,
  type MemoryVisibility,
} from '../../models/cloud-memory';
import type { FriendListItem } from '../../models/cloud-friend';
import { CURRENT_MAP_ASSET_VERSION } from '../../config/campus-map';
import { LocalImageServiceError, localImageService } from '../../services/local-image-service';
import { memoryRepository } from '../../services/repository/index';
import { cloudFriendRepository } from '../../services/repository/cloud-friend-repository';
import { cloudMemoryRepository } from '../../services/repository/cloud-memory-repository';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { validateRatio } from '../../utils/map-coordinates';
import { formatMemoryDateTime } from '../../utils/date-format';

interface EditorImage {
  id: string;
  isTemporary: boolean;
  loadFailed: boolean;
  path: string;
}

interface SelectOption<T extends string> {
  label: string;
  value: T;
}

interface FriendChoice extends FriendListItem {
  readonly selected: boolean;
}

const MAX_LOCAL_IMAGE_BYTES = 5 * 1024 * 1024;
function createDefaultVisibility(): MemoryVisibility {
  return 'private';
}

const moodOptions: SelectOption<MemoryMood>[] = MEMORY_MOODS.map((value) => ({
  label: MEMORY_MOOD_LABELS[value],
  value,
}));
const categoryOptions: SelectOption<MemoryCategory>[] = MEMORY_CATEGORIES.map((value) => ({
  label: MEMORY_CATEGORY_LABELS[value],
  value,
}));
const visibilityOptions: SelectOption<MemoryVisibility>[] = [
  { label: '仅自己', value: 'private' },
  { label: '部分好友', value: 'selected_friends' },
  { label: '全部好友', value: 'friends' },
];

function isCloudMemory(memory: Memory): memory is CloudMemory {
  return (
    'visibility' in memory &&
    isMemoryVisibility((memory as Memory & { visibility?: unknown }).visibility)
  );
}

let navigationTimer: ReturnType<typeof setTimeout> | undefined;
let editorImageSequence = 0;

function getErrorMessage(error: unknown): string {
  if (error instanceof LocalImageServiceError && error.failedPaths.length > 0) {
    return `${error.message}；另有 ${error.failedPaths.length} 个本地文件未能回滚清理。`;
  }

  if (error instanceof MemoryValidationError || error instanceof Error) {
    return error.message;
  }

  return '保存失败，请稍后重试';
}

function showEditorNotice(title: string, content: string): Promise<void> {
  return new Promise<void>((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '知道了',
      complete: () => resolve(),
    });
  });
}

function confirmPhotoUse(): Promise<boolean> {
  const cloudMode = cloudModeService.getState().mode === 'cloud';
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '添加本机照片',
      content: cloudMode
        ? '你选择的照片只用于这段回忆，并会随保存上传到你的 iSdu 云端空间；可见范围默认仅自己。你也可以取消并只写文字。'
        : '你选择的照片只用于创建这段回忆，并保存在当前设备；不会上传到 iSdu 云端。你也可以取消并只写文字。',
      confirmText: '继续选择',
      cancelText: '暂不添加',
      success: (result) => resolve(result.confirm),
      fail: (result) => reject(new Error(result.errMsg)),
    });
  });
}

function createEditorImage(path: string, index: number, isTemporary: boolean): EditorImage {
  return {
    id: `${isTemporary ? 'temp' : 'saved'}-${Date.now()}-${index}-${editorImageSequence++}`,
    isTemporary,
    loadFailed: false,
    path,
  };
}

async function cleanupUnreferencedImages(candidatePaths: readonly string[]): Promise<string[]> {
  if (candidatePaths.length === 0) {
    return [];
  }

  try {
    const memories = await memoryRepository.listMemories();
    const referencedPaths = new Set(memories.flatMap((memory) => memory.imagePaths));
    const pathsToRemove = candidatePaths.filter(
      (path) => !referencedPaths.has(path) && localImageService.isManagedImagePath(path),
    );
    const result = await localImageService.cleanupManagedImages(pathsToRemove);
    return result.failedPaths;
  } catch {
    return [...candidatePaths];
  }
}

Page({
  data: {
    category: 'campus-life',
    categoryOptions,
    coordinateLabel: '尚未选择位置',
    customCategory: '',
    customLabelMaxLength: MEMORY_CUSTOM_LABEL_MAX_LENGTH,
    customMood: '',
    formError: '',
    hasSaved: false,
    imageLimit: MEMORY_IMAGE_MAX_COUNT,
    imageMaxSizeLabel: '5 MB',
    images: [] as EditorImage[],
    friendChoices: [] as FriendChoice[],
    friendLoadError: '',
    isDirty: false,
    isEditMode: false,
    isFormReady: false,
    isLoading: false,
    isCloudMode: false,
    isPageActive: true,
    isSaving: false,
    mapAssetVersion: CURRENT_MAP_ASSET_VERSION,
    memoryId: '',
    mood: 'calm',
    moodOptions,
    originalImagePaths: [] as string[],
    pageSubtitle: '补充照片和文字，让这个地点成为你的校园回忆。',
    pageTitle: '写下这段回忆',
    placeMaxLength: MEMORY_PLACE_MAX_LENGTH,
    placeName: '',
    recordedAt: '',
    recordedAtLabel: '',
    selectedFriendIds: [] as string[],
    text: '',
    textMaxLength: MEMORY_TEXT_MAX_LENGTH,
    textRemaining: MEMORY_TEXT_MAX_LENGTH,
    visibility: createDefaultVisibility(),
    visibilityOptions,
    xRatio: 0.5,
    yRatio: 0.5,
  },

  onLoad(query: Record<string, string | undefined>) {
    this.data.isPageActive = true;
    const isCloudMode = cloudModeService.getState().mode === 'cloud';
    this.setData({ isCloudMode });
    if (isCloudMode) void this.loadFriendChoices();
    const memoryId = query.memoryId?.trim();

    if (memoryId) {
      this.setData({
        isEditMode: true,
        isLoading: true,
        memoryId,
        pageSubtitle: '可以修改文字、照片、地点、心情与分类；地图位置保持不变。',
        pageTitle: '编辑校园回忆',
      });
      void this.loadMemory(memoryId);
      return;
    }

    const xRatio = Number(query.mapXRatio);
    const yRatio = Number(query.mapYRatio);

    if (!validateRatio(xRatio) || !validateRatio(yRatio)) {
      this.setData({
        formError: '没有收到有效的地图位置，请返回地图重新选择。',
        isFormReady: false,
      });
      return;
    }

    const recordedAt = new Date().toISOString();
    this.setData({
      coordinateLabel: `横向 ${(xRatio * 100).toFixed(1)}% · 纵向 ${(yRatio * 100).toFixed(1)}%`,
      isFormReady: true,
      memoryId: createMemoryId(),
      recordedAt,
      recordedAtLabel: formatMemoryDateTime(recordedAt),
      xRatio,
      yRatio,
    });
  },

  async loadFriendChoices() {
    try {
      const friends = await cloudFriendRepository.listFriends();
      const selectedIds = new Set(this.data.selectedFriendIds);
      this.setData({
        friendChoices: friends.map((item) => ({
          ...item,
          selected: selectedIds.has(item.friend.userId),
        })),
        friendLoadError: '',
      });
    } catch (error: unknown) {
      this.setData({
        friendLoadError: error instanceof Error ? error.message : '好友列表读取失败，请稍后重试。',
      });
    }
  },

  async loadMemory(memoryId: string) {
    try {
      const memory = await memoryRepository.getMemoryById(memoryId);

      if (!memory) {
        this.setData({
          formError: '这条回忆不存在，可能已经被删除。',
          isFormReady: false,
          isLoading: false,
        });
        return;
      }

      this.populateMemory(memory);
    } catch (error) {
      this.setData({
        formError: getErrorMessage(error),
        isFormReady: false,
        isLoading: false,
      });
    }
  },

  populateMemory(memory: Memory) {
    const cloudMemory = isCloudMemory(memory) ? memory : null;
    const selectedIds = new Set(cloudMemory?.selectedFriendIds ?? []);
    this.setData({
      category: memory.category,
      coordinateLabel: `横向 ${(memory.mapXRatio * 100).toFixed(1)}% · 纵向 ${(
        memory.mapYRatio * 100
      ).toFixed(1)}%`,
      images: memory.imagePaths.map((path, index) => createEditorImage(path, index, false)),
      isFormReady: true,
      isLoading: false,
      mapAssetVersion: memory.mapAssetVersion,
      mood: memory.mood,
      customCategory: memory.customCategory,
      customMood: memory.customMood,
      originalImagePaths: [...memory.imagePaths],
      placeName: memory.placeName,
      recordedAt: memory.recordedAt,
      recordedAtLabel: formatMemoryDateTime(memory.recordedAt),
      text: memory.text,
      textRemaining: MEMORY_TEXT_MAX_LENGTH - memory.text.length,
      xRatio: memory.mapXRatio,
      yRatio: memory.mapYRatio,
      visibility: cloudMemory?.visibility ?? 'private',
      selectedFriendIds: [...selectedIds],
      friendChoices: this.data.friendChoices.map((item) => ({
        ...item,
        selected: selectedIds.has(item.friend.userId),
      })),
    });
  },

  selectVisibility(event: WechatMiniprogram.BaseEvent) {
    const value = (event.currentTarget.dataset as { value?: unknown }).value;
    if (!isMemoryVisibility(value) || this.data.isSaving || this.data.hasSaved) return;
    this.setData({ formError: '', visibility: value });
    this.markDirty();
  },

  toggleFriendSelection(event: WechatMiniprogram.BaseEvent) {
    const userId = (event.currentTarget.dataset as { userId?: unknown }).userId;
    if (typeof userId !== 'string' || this.data.isSaving || this.data.hasSaved) return;
    const friendChoices = this.data.friendChoices.map((item) =>
      item.friend.userId === userId ? { ...item, selected: !item.selected } : item,
    );
    this.setData({
      formError: '',
      friendChoices,
      selectedFriendIds: friendChoices
        .filter((item) => item.selected)
        .map((item) => item.friend.userId),
    });
    this.markDirty();
  },

  markDirty() {
    if (this.data.isDirty) {
      return;
    }

    this.setData({ isDirty: true });
    wx.enableAlertBeforeUnload({
      message: '当前回忆尚未保存，确定要离开吗？',
      fail: () => undefined,
    });
  },

  handleTextInput(event: WechatMiniprogram.TextareaInput) {
    if (this.data.hasSaved) {
      return;
    }

    const text = event.detail.value.slice(0, MEMORY_TEXT_MAX_LENGTH);
    this.setData({
      formError: '',
      text,
      textRemaining: MEMORY_TEXT_MAX_LENGTH - text.length,
    });
    this.markDirty();
  },

  handlePlaceInput(event: WechatMiniprogram.Input) {
    if (this.data.hasSaved) {
      return;
    }

    this.setData({
      formError: '',
      placeName: event.detail.value.slice(0, MEMORY_PLACE_MAX_LENGTH),
    });
    this.markDirty();
  },

  selectMood(event: WechatMiniprogram.BaseEvent) {
    if (this.data.hasSaved) {
      return;
    }

    const dataset = event.currentTarget.dataset as { value?: unknown };

    if (isMemoryMood(dataset.value)) {
      this.setData({
        customMood: dataset.value === 'custom' ? this.data.customMood : '',
        formError: '',
        mood: dataset.value,
      });
      this.markDirty();
    }
  },

  handleCustomMoodInput(event: WechatMiniprogram.Input) {
    if (this.data.hasSaved) {
      return;
    }

    this.setData({
      customMood: event.detail.value.slice(0, MEMORY_CUSTOM_LABEL_MAX_LENGTH),
      formError: '',
    });
    this.markDirty();
  },

  selectCategory(event: WechatMiniprogram.BaseEvent) {
    if (this.data.hasSaved) {
      return;
    }

    const dataset = event.currentTarget.dataset as { value?: unknown };

    if (isMemoryCategory(dataset.value)) {
      this.setData({
        category: dataset.value,
        customCategory: dataset.value === 'custom' ? this.data.customCategory : '',
        formError: '',
      });
      this.markDirty();
    }
  },

  handleCustomCategoryInput(event: WechatMiniprogram.Input) {
    if (this.data.hasSaved) {
      return;
    }

    this.setData({
      customCategory: event.detail.value.slice(0, MEMORY_CUSTOM_LABEL_MAX_LENGTH),
      formError: '',
    });
    this.markDirty();
  },

  async chooseImages() {
    const remainingCount = MEMORY_IMAGE_MAX_COUNT - this.data.images.length;

    if (remainingCount <= 0 || this.data.isSaving || this.data.hasSaved) {
      return;
    }

    try {
      if (!(await confirmPhotoUse())) {
        return;
      }
    } catch (error: unknown) {
      this.setData({
        formError:
          error instanceof Error ? error.message : '照片用途说明暂时无法显示，请稍后重试。',
      });
      return;
    }

    wx.chooseMedia({
      count: remainingCount,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      camera: 'back',
      success: (result) => {
        const selectedFiles = result.tempFiles.slice(0, remainingCount);

        if (
          selectedFiles.some(
            (file) =>
              !Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_LOCAL_IMAGE_BYTES,
          )
        ) {
          this.setData({
            formError: `压缩后每张照片不能超过 ${this.data.imageMaxSizeLabel}，请重新选择较小的图片。`,
          });
          return;
        }

        const selectedImages = selectedFiles
          .map((file) => file.tempFilePath)
          .filter(Boolean)
          .map((path, index) => createEditorImage(path, index, true));

        if (selectedImages.length === 0) {
          return;
        }

        this.setData({
          formError: '',
          images: [...this.data.images, ...selectedImages],
        });
        this.markDirty();
      },
      fail: (result) => {
        if (!/cancel/iu.test(result.errMsg)) {
          this.setData({ formError: '照片选择失败，请检查相册权限后重试。' });
        }
      },
    });
  },

  removeImage(event: WechatMiniprogram.BaseEvent) {
    if (this.data.hasSaved) {
      return;
    }

    const dataset = event.currentTarget.dataset as { index?: unknown };
    const index = Number(dataset.index);

    if (!Number.isInteger(index) || index < 0 || index >= this.data.images.length) {
      return;
    }

    this.setData({
      formError: '',
      images: this.data.images.filter((_, imageIndex) => imageIndex !== index),
    });
    this.markDirty();
  },

  previewImage(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { path?: unknown };
    const current = typeof dataset.path === 'string' ? dataset.path : '';
    const urls = this.data.images.filter((image) => !image.loadFailed).map((image) => image.path);

    if (!current || urls.length === 0) {
      return;
    }

    void wx.previewImage({
      current,
      urls,
      fail: () => {
        this.setData({ formError: '照片预览失败，本地文件可能已经失效。' });
      },
    });
  },

  handleImageError(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { index?: unknown };
    const index = Number(dataset.index);

    if (!Number.isInteger(index) || index < 0 || index >= this.data.images.length) {
      return;
    }

    this.setData({
      formError: '有一张本地照片已无法读取，请删除后重新选择。',
      images: this.data.images.map((image, imageIndex) =>
        imageIndex === index ? { ...image, loadFailed: true } : image,
      ),
    });
  },

  buildMemoryContent(imagePaths: string[]): MemoryContentInput {
    return {
      category: this.data.category as MemoryCategory,
      customCategory: this.data.customCategory,
      customMood: this.data.customMood,
      imagePaths,
      mapAssetVersion: this.data.mapAssetVersion,
      mapXRatio: this.data.xRatio,
      mapYRatio: this.data.yRatio,
      mood: this.data.mood as MemoryMood,
      placeName: this.data.placeName,
      recordedAt: this.data.recordedAt,
      text: this.data.text,
    };
  },

  async saveMemory() {
    if (!this.data.isFormReady || this.data.isSaving || this.data.hasSaved) {
      return;
    }

    if (this.data.images.some((image) => image.loadFailed)) {
      this.setData({ formError: '请先移除无法读取的照片，再保存回忆。' });
      return;
    }

    const selectedFriendIds = this.data.selectedFriendIds;
    if (
      this.data.isCloudMode &&
      this.data.visibility === 'selected_friends' &&
      selectedFriendIds.length === 0
    ) {
      this.setData({ formError: '请选择至少一位好友，或将可见范围改为“仅自己”。' });
      return;
    }

    this.setData({ formError: '', isSaving: true });
    const persistentPaths = this.data.images
      .filter((image) => !image.isTemporary)
      .map((image) => image.path);
    const temporaryPaths = this.data.images
      .filter((image) => image.isTemporary)
      .map((image) => image.path);
    const wasEditMode = this.data.isEditMode;
    let newlySavedPaths: string[] = [];
    let savedMemory: Memory;

    try {
      if (temporaryPaths.length > 0) {
        newlySavedPaths = await localImageService.persistTempImages(
          this.data.memoryId,
          temporaryPaths,
        );
      }

      const finalImagePaths = [...persistentPaths, ...newlySavedPaths];
      const content = this.buildMemoryContent(finalImagePaths);

      if (wasEditMode) {
        savedMemory = await memoryRepository.updateMemory(this.data.memoryId, content);
      } else {
        savedMemory = await memoryRepository.createMemory({ id: this.data.memoryId, ...content });
      }

      let visibilityWarning = '';
      if (this.data.isCloudMode) {
        try {
          savedMemory = await cloudMemoryRepository.setVisibility(
            savedMemory.id,
            this.data.visibility,
            selectedFriendIds,
          );
        } catch (error: unknown) {
          visibilityWarning = `正文已保存，但可见范围未更新，仍按服务端原范围处理：${getErrorMessage(error)}`;
        }
      }

      const removedOriginalPaths = this.data.originalImagePaths.filter(
        (path) => !finalImagePaths.includes(path),
      );
      const cleanupFailures = await cleanupUnreferencedImages(removedOriginalPaths);

      wx.disableAlertBeforeUnload({ fail: () => undefined });
      this.setData({
        formError:
          visibilityWarning ||
          (cleanupFailures.length > 0 ? '回忆已保存，但部分旧照片未能清理，可稍后重试。' : ''),
        images: (savedMemory?.imagePaths ?? finalImagePaths).map((path, index) =>
          createEditorImage(path, index, false),
        ),
        hasSaved: true,
        isDirty: false,
        isEditMode: true,
        isSaving: false,
        originalImagePaths: [...(savedMemory?.imagePaths ?? finalImagePaths)],
        pageSubtitle:
          cloudModeService.getState().mode === 'cloud'
            ? '这段回忆已经安全保存到云端，可以继续修改。'
            : '这段回忆已经保存在本机，可以继续修改。',
        pageTitle: '编辑校园回忆',
      });

      if (cleanupFailures.length > 0) {
        await showEditorNotice(
          '回忆已保存，照片清理未完成',
          `正文和新照片已经安全保存，但有 ${cleanupFailures.length} 个旧文件未能清理，可能仍占用本地空间。`,
        );
        this.navigateBackToMap();
        return;
      }

      void wx.showToast({
        title: wasEditMode ? '修改已保存' : '回忆已保存',
        icon: 'success',
        fail: () => {
          this.setData({ formError: '回忆已保存，但成功提示未能显示。' });
        },
      });

      navigationTimer = setTimeout(() => this.navigateBackToMap(), 650);
    } catch (error) {
      let rollbackWarning = '';
      const selectedImagesInvalidated = temporaryPaths.length > 0;

      if (newlySavedPaths.length > 0) {
        try {
          const rollbackResult = await localImageService.cleanupManagedImages(newlySavedPaths);

          if (rollbackResult.failedPaths.length > 0) {
            rollbackWarning = `；另有 ${rollbackResult.failedPaths.length} 个新增图片文件未能回滚清理`;
          }
        } catch {
          rollbackWarning = '；新增图片文件回滚失败，可能仍占用本地空间';
        }
      }

      this.setData({
        formError: `${getErrorMessage(error)}${rollbackWarning}${
          selectedImagesInvalidated ? '；本轮新选照片已失效，请重新选择' : ''
        }`,
        images: selectedImagesInvalidated
          ? this.data.images.filter((image) => !image.isTemporary)
          : this.data.images,
        isSaving: false,
      });
    }
  },

  cancelEditing() {
    const leave = () => {
      wx.disableAlertBeforeUnload({ fail: () => undefined });
      this.navigateBackToMap();
    };

    if (!this.data.isDirty) {
      leave();
      return;
    }

    wx.showModal({
      title: '放弃这次编辑？',
      content: '未保存的文字和照片选择会丢失。',
      confirmText: '放弃',
      confirmColor: '#a85f62',
      success: (result) => {
        if (result.confirm) {
          leave();
        }
      },
      fail: () => {
        this.setData({ formError: '离开确认窗口打开失败，请稍后重试。' });
      },
    });
  },

  navigateBackToMap() {
    void wx.navigateBack({
      delta: 1,
      fail: () => {
        void wx.switchTab({
          url: '/pages/map/index',
          fail: () => {
            this.setData({ formError: '返回地图失败，请使用左上角返回或底部地图 Tab。' });
          },
        });
      },
    });
  },

  onUnload() {
    if (navigationTimer) {
      clearTimeout(navigationTimer);
      navigationTimer = undefined;
    }

    editorImageSequence = 0;
  },
});
