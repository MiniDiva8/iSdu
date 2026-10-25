import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { memoryRepository } from '../../services/repository/index';
import {
  buildJournalMonth,
  getJournalDayKey,
  shiftJournalMonth,
  type JournalPhoto,
} from '../../utils/journal';
interface AlbumPhoto extends JournalPhoto {
  failed: boolean;
}
Page({
  loadVersion: 0,
  data: {
    monthKey: getJournalDayKey(new Date().toISOString()).slice(0, 7),
    monthLabel: '',
    photos: [] as AlbumPhoto[],
    isLoading: true,
    errorMessage: '',
  },
  onLoad(query: Record<string, string | undefined>) {
    if (query.month) {
      try {
        this.setData({ monthKey: shiftJournalMonth(query.month, 0) });
      } catch {
        /* Use current month for malformed links. */
      }
    }
  },
  onShow() {
    void this.loadPhotos();
  },
  onHide() {
    this.loadVersion += 1;
  },
  onUnload() {
    this.loadVersion += 1;
  },
  async loadPhotos() {
    const loadVersion = ++this.loadVersion;
    const sourceMode = cloudModeService.getState().mode;
    const monthKey = this.data.monthKey;
    this.setData({ isLoading: true, errorMessage: '', photos: [] });
    try {
      const memories = await memoryRepository.listMemories();
      if (loadVersion !== this.loadVersion || sourceMode !== cloudModeService.getState().mode)
        return;
      const model = buildJournalMonth(memories, monthKey);
      this.setData({
        monthLabel: model.label,
        photos: model.photos.map((photo) => ({ ...photo, failed: false })),
        isLoading: false,
      });
    } catch (error: unknown) {
      if (loadVersion !== this.loadVersion || sourceMode !== cloudModeService.getState().mode)
        return;
      this.setData({
        photos: [],
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : '照片暂时没有读到，请重试。',
      });
    }
  },
  changeMonth(event: WechatMiniprogram.BaseEvent) {
    try {
      this.setData({
        monthKey: shiftJournalMonth(this.data.monthKey, Number(event.currentTarget.dataset.offset)),
      });
      void this.loadPhotos();
    } catch {
      void wx.showToast({ title: '这个月份暂时无法打开', icon: 'none' });
    }
  },
  openDiary(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.memoryId as unknown;
    if (typeof id === 'string' && id)
      void wx.navigateTo({ url: '/pages/detail/index?memoryId=' + encodeURIComponent(id) });
  },
  previewPhoto(event: WechatMiniprogram.BaseEvent) {
    const path = event.currentTarget.dataset.path as unknown;
    const urls = this.data.photos.filter((photo) => !photo.failed).map((photo) => photo.path);
    if (typeof path === 'string' && urls.includes(path))
      void wx.previewImage({ current: path, urls });
  },
  imageFailed(event: WechatMiniprogram.BaseEvent) {
    const key = event.currentTarget.dataset.key as unknown;
    this.setData({
      photos: this.data.photos.map((photo) =>
        photo.key === key ? { ...photo, failed: true } : photo,
      ),
    });
  },
});
