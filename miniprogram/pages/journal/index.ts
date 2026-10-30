import { companionService } from '../../services/companion-service';
import { companionAssetPreview } from '../../data/companion-assets';
import { getMemoryMoodLabel, type Memory } from '../../models/memory';
import { memoryRepository } from '../../services/repository/index';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { journalDraftService } from '../../services/journal-draft-service';
import {
  journalBackgroundService,
  type JournalBackground,
} from '../../services/journal-background-service';
import {
  buildJournalMonth,
  getJournalDayKey,
  shiftJournalMonth,
  type JournalDay,
} from '../../utils/journal';

interface EntryRow {
  id: string;
  mood: string;
  moodLabel: string;
  preview: string;
  place: string;
  isDemo: boolean;
}
function entryRow(memory: Memory): EntryRow {
  return {
    id: memory.id,
    mood: memory.mood,
    moodLabel: getMemoryMoodLabel(memory),
    preview: memory.text || '照片里的这一天',
    place: memory.placeName || '',
    isDemo: memory.origin === 'demo',
  };
}
const todayKey = getJournalDayKey(new Date().toISOString());
Page({
  loadVersion: 0,
  _loadedScope: '',
  _backgroundVersion: 0,
  _backgroundPickerVersion: 0,
  _backgroundVisible: true,
  _backgroundBusy: false,
  _backgroundPendingPath: '',
  data: {
    topInset: 24,
    monthKey: todayKey.slice(0, 7),
    monthLabel: '',
    yearLabel: '',
    todayKey,
    selectedDate: todayKey,
    days: [] as JournalDay[],
    memories: [] as Memory[],
    entryCount: 0,
    recordedDays: 0,
    isLoading: true,
    isRefreshing: false,
    hasLoadedMemories: false,
    refreshMessage: '',
    errorMessage: '',
    storageLabel: '仅存本机',
    showDaySheet: false,
    showSearch: false,
    hasDraft: false,
    showCompanion: true,
    companionName: '伙伴',
    companionSrc: '',
    companionCropped: false,
    companionPreviewStyle: '',
    dayEntries: [] as EntryRow[],
    searchResults: [] as EntryRow[],
    keyword: '',
    backgroundImagePath: '',
    backgroundImageFailed: false,
    backgroundClarity: 55,
    backgroundErrorMessage: '',
    pendingBackgroundPath: '',
    isBackgroundSaving: false,
    showBackgroundSettings: false,
  },
  onLoad() {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : null;
    const model = buildJournalMonth([], this.data.monthKey, new Date().toISOString());
    this.setData({
      topInset: info?.statusBarHeight ?? 24,
      days: model.days,
      monthLabel: model.monthLabel,
      yearLabel: model.year,
      storageLabel: cloudModeService.getState().mode === 'cloud' ? '云端日记' : '仅存本机',
    });
  },
  onShow() {
    this._backgroundVisible = true;
    void this.loadBackground();
    this.getTabBar?.()?.setData({ selected: 0 });
    try {
      const companion = companionService.read();
      const preview = companionAssetPreview('skin', companion.skinId);
      this.setData({
        showCompanion: !companion.adoptedAt || companion.showOnJournal,
        companionName: companion.name,
        companionSrc: preview.src,
        companionCropped: preview.cropped,
        companionPreviewStyle: preview.style,
      });
    } catch {
      this.setData({ showCompanion: true });
    }
    void this.loadJournal();
  },
  async onPullDownRefresh() {
    await this.loadJournal(true);
    void wx.stopPullDownRefresh();
  },
  onHide() {
    this.loadVersion += 1;
    this._backgroundVisible = false;
    this._backgroundVersion += 1;
  },
  onUnload() {
    this.loadVersion += 1;
    this._backgroundVisible = false;
    this._backgroundVersion += 1;
    this._backgroundPickerVersion += 1;
  },
  isBackgroundCurrent(version: number) {
    return this._backgroundVisible && version === this._backgroundVersion;
  },
  finishBackgroundOperation(version: number) {
    this._backgroundBusy = false;
    if (!this._backgroundVisible) return;
    if (this.isBackgroundCurrent(version)) this.setData({ isBackgroundSaving: false });
    else void this.loadBackground();
  },
  applyBackground(background: JournalBackground) {
    this.setData({
      backgroundImagePath: background.imagePath,
      backgroundClarity: background.clarity,
      backgroundImageFailed: false,
    });
  },
  async loadBackground() {
    const version = ++this._backgroundVersion;
    try {
      const background = await journalBackgroundService.read();
      if (!this.isBackgroundCurrent(version)) return;
      this.applyBackground(background);
      this.setData({
        pendingBackgroundPath: this._backgroundPendingPath,
        isBackgroundSaving: this._backgroundBusy,
        backgroundErrorMessage: '',
      });
    } catch (error: unknown) {
      if (!this.isBackgroundCurrent(version)) return;
      this.setData({
        backgroundImagePath: '',
        backgroundImageFailed: false,
        isBackgroundSaving: this._backgroundBusy,
        backgroundErrorMessage:
          error instanceof Error ? error.message : '背景暂时未能读取，请重新选择。',
      });
    }
  },
  openBackgroundSettings() {
    this.setData({ showBackgroundSettings: true, showDaySheet: false });
  },
  closeBackgroundSettings() {
    this.setData({ showBackgroundSettings: false });
  },
  async chooseBackgroundImage() {
    if (this._backgroundBusy || !this._backgroundVisible) return;
    ++this._backgroundVersion;
    const pickerVersion = ++this._backgroundPickerVersion;
    this._backgroundBusy = true;
    this.setData({ isBackgroundSaving: true, backgroundErrorMessage: '' });
    try {
      const result = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
        sizeType: ['compressed'],
      });
      if (pickerVersion !== this._backgroundPickerVersion) return;
      const file = result.tempFiles?.[0];
      if (
        !file?.tempFilePath ||
        !Number.isFinite(file.size) ||
        file.size <= 0 ||
        file.size > 10 * 1024 * 1024
      ) {
        if (this._backgroundVisible)
          this.setData({ backgroundErrorMessage: '请选择一张可读取且不超过 10 MB 的图片。' });
        return;
      }
      this._backgroundPendingPath = file.tempFilePath;
      if (this._backgroundVisible) this.setData({ pendingBackgroundPath: file.tempFilePath });
    } catch (error: unknown) {
      if (!this._backgroundVisible || pickerVersion !== this._backgroundPickerVersion) return;
      const rawMessage = (error as { errMsg?: unknown } | null)?.errMsg;
      const message =
        error instanceof Error ? error.message : typeof rawMessage === 'string' ? rawMessage : '';
      if (!/cancel/iu.test(message))
        this.setData({ backgroundErrorMessage: '图片选择未完成，请稍后重试。' });
      return;
    } finally {
      this._backgroundBusy = false;
      if (this._backgroundVisible && pickerVersion === this._backgroundPickerVersion)
        this.setData({ isBackgroundSaving: false });
    }
    if (
      this._backgroundVisible &&
      pickerVersion === this._backgroundPickerVersion &&
      this._backgroundPendingPath
    )
      await this.savePendingBackground();
  },
  async savePendingBackground() {
    if (this._backgroundBusy || !this._backgroundPendingPath || !this._backgroundVisible) return;
    const version = ++this._backgroundVersion;
    const pending = this._backgroundPendingPath;
    this._backgroundBusy = true;
    this.setData({ isBackgroundSaving: true, backgroundErrorMessage: '' });
    try {
      const background = await journalBackgroundService.saveImage(pending);
      if (this._backgroundPendingPath === pending) this._backgroundPendingPath = '';
      if (!this.isBackgroundCurrent(version)) return;
      this.applyBackground(background);
      this.setData({ pendingBackgroundPath: '', backgroundErrorMessage: '' });
    } catch (error: unknown) {
      if (!this.isBackgroundCurrent(version)) return;
      this.setData({
        backgroundErrorMessage:
          error instanceof Error ? error.message : '背景保存失败，已保留本次选择，可重试保存。',
      });
    } finally {
      this.finishBackgroundOperation(version);
    }
  },
  async changeBackgroundClarity(event: WechatMiniprogram.SliderChange) {
    if (this._backgroundBusy || !this._backgroundVisible) return;
    const version = ++this._backgroundVersion;
    this._backgroundBusy = true;
    this.setData({ isBackgroundSaving: true, backgroundErrorMessage: '' });
    try {
      const background = await journalBackgroundService.setClarity(event.detail.value);
      if (this.isBackgroundCurrent(version)) this.applyBackground(background);
    } catch (error: unknown) {
      if (this.isBackgroundCurrent(version)) {
        // Restore the controlled slider to the last committed value.
        this.setData({
          backgroundClarity: this.data.backgroundClarity,
          backgroundErrorMessage:
            error instanceof Error ? error.message : '背景设置保存失败，请重试。',
        });
      }
    } finally {
      this.finishBackgroundOperation(version);
    }
  },
  async restoreDefaultBackground() {
    if (this._backgroundBusy || !this._backgroundVisible) return;
    const version = ++this._backgroundVersion;
    this._backgroundBusy = true;
    this.setData({ isBackgroundSaving: true, backgroundErrorMessage: '' });
    try {
      await journalBackgroundService.clear();
      this._backgroundPendingPath = '';
      if (!this.isBackgroundCurrent(version)) return;
      this.applyBackground({ imagePath: '', clarity: 55 });
      this.setData({ pendingBackgroundPath: '' });
    } catch (error: unknown) {
      try {
        const background = await journalBackgroundService.read();
        if (this.isBackgroundCurrent(version)) this.applyBackground(background);
      } catch {
        /* Keep the visible setting if storage is also unavailable. */
      }
      if (this.isBackgroundCurrent(version))
        this.setData({
          backgroundErrorMessage:
            error instanceof Error ? error.message : '恢复默认背景失败，请重试。',
        });
    } finally {
      this.finishBackgroundOperation(version);
    }
  },
  handleBackgroundImageError(event: WechatMiniprogram.BaseEvent) {
    if (
      !this._backgroundVisible ||
      event.currentTarget.dataset.imagePath !== this.data.backgroundImagePath
    )
      return;
    this.setData({
      backgroundImageFailed: true,
      backgroundErrorMessage: '背景图片暂时无法显示，已使用默认底色，可重新选择。',
    });
  },
  async loadJournal(forceRefresh: unknown = false) {
    const loadVersion = ++this.loadVersion;
    const scope = memoryRepository.getListScope();
    const monthKey = this.data.monthKey;
    const cached = memoryRepository.getCachedMemories();
    const visible =
      cached ??
      (this._loadedScope === scope && this.data.hasLoadedMemories ? this.data.memories : null);
    if (visible !== null) this._loadedScope = scope;
    const initialModel = buildJournalMonth(visible ?? [], monthKey, new Date().toISOString());
    this.setData({
      isLoading: visible === null,
      isRefreshing: true,
      hasLoadedMemories: visible !== null,
      errorMessage: '',
      refreshMessage: '',
      showDaySheet: false,
      dayEntries: [],
      memories: visible ?? [],
      searchResults: [],
      days: initialModel.days,
      monthLabel: initialModel.monthLabel,
      yearLabel: initialModel.year,
      entryCount: initialModel.entryCount,
      recordedDays: initialModel.recordedDays,
      storageLabel: cloudModeService.getState().mode === 'local' ? '仅存本机' : '云端日记',
      hasDraft: false,
    });
    try {
      const memories = await memoryRepository.listMemories(forceRefresh === true);
      if (loadVersion !== this.loadVersion || scope !== memoryRepository.getListScope()) return;
      const now = new Date().toISOString();
      const model = buildJournalMonth(memories, monthKey, now);
      const isLocal = cloudModeService.getState().mode === 'local';
      let hasDraft = false;
      if (isLocal) {
        try {
          hasDraft = journalDraftService.read() !== null;
        } catch {
          /* Existing entries remain readable when draft storage fails. */
        }
      }
      this._loadedScope = scope;
      this.setData({
        memories,
        days: model.days,
        monthLabel: model.monthLabel,
        yearLabel: model.year,
        entryCount: model.entryCount,
        recordedDays: model.recordedDays,
        todayKey: getJournalDayKey(now),
        isLoading: false,
        isRefreshing: false,
        hasLoadedMemories: true,
        hasDraft,
        storageLabel: isLocal ? '仅存本机' : '云端日记',
      });
      this.updateSearchResults();
    } catch (error: unknown) {
      if (loadVersion !== this.loadVersion || scope !== memoryRepository.getListScope()) return;
      const message = error instanceof Error ? error.message : '日记暂时没有读到，请重试。';
      this.setData({
        isLoading: false,
        isRefreshing: false,
        errorMessage: visible === null ? message : '',
        refreshMessage: visible === null ? '' : '更新未完成，正在显示上次内容；下拉可重试。',
      });
    }
  },
  changeMonth(event: WechatMiniprogram.BaseEvent) {
    const offset = Number(event.currentTarget.dataset.offset);
    try {
      this.setData({ monthKey: shiftJournalMonth(this.data.monthKey, offset) });
      void this.loadJournal();
    } catch {
      void wx.showToast({ title: '暂时无法切换到这个月份', icon: 'none' });
    }
  },
  pickMonth(event: WechatMiniprogram.PickerChange) {
    try {
      const monthKey = shiftJournalMonth(String(event.detail.value), 0);
      this.setData({ monthKey });
      void this.loadJournal();
    } catch {
      void wx.showToast({ title: '请选择有效月份', icon: 'none' });
    }
  },
  returnToday() {
    this.setData({ monthKey: getJournalDayKey(new Date().toISOString()).slice(0, 7) });
    void this.loadJournal();
  },
  openDay(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.hasLoadedMemories) return;
    const key = event.currentTarget.dataset.key as unknown;
    const day = this.data.days.find((item) => item.key === key);
    if (!day || (day.isFuture && day.count === 0)) return;
    const entries = this.data.memories.filter(
      (memory) => getJournalDayKey(memory.recordedAt) === key,
    );
    this.setData({
      selectedDate: day.key,
      dayEntries: entries.map(entryRow),
      showDaySheet: entries.length > 0,
    });
    if (entries.length === 0) this.openMoodWheel();
  },
  startWriting() {
    this.setData({ selectedDate: getJournalDayKey(new Date().toISOString()), showDaySheet: false });
    this.openMoodWheel();
  },
  writeAnother() {
    this.setData({ showDaySheet: false });
    this.openMoodWheel();
  },
  openMoodWheel() {
    void wx.navigateTo({
      url:
        '/pages/selection-wheel/index?source=journal&kind=mood&date=' +
        encodeURIComponent(this.data.selectedDate),
      fail: () => {
        void wx.showToast({ title: '心情转盘暂时没有打开，请重试', icon: 'none' });
      },
    });
  },
  openEntry(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as unknown;
    if (typeof id !== 'string' || !id) return;
    this.closePanels();
    void wx.navigateTo({ url: '/pages/detail/index?memoryId=' + encodeURIComponent(id) });
  },
  openDraft() {
    void wx.navigateTo({ url: '/pages/editor/index?source=journal&restore=1' });
  },
  openAlbum() {
    void wx.navigateTo({ url: '/pages/album/index?month=' + this.data.monthKey });
  },
  openCampus() {
    void wx.switchTab({ url: '/pages/map/index' });
  },
  openProfile() {
    void wx.switchTab({ url: '/pages/profile/index' });
  },
  openCompanion() {
    void wx.navigateTo({ url: '/pages/companion/index' });
  },
  openFriends() {
    void wx.navigateTo({ url: '/pages/friends/index' });
  },
  toggleSearch() {
    this.setData({ showSearch: !this.data.showSearch, keyword: '', searchResults: [] });
  },
  handleSearchInput(event: WechatMiniprogram.Input) {
    this.setData({ keyword: event.detail.value.slice(0, 50) });
    this.updateSearchResults();
  },
  updateSearchResults() {
    const keyword = this.data.keyword.trim().toLowerCase();
    this.setData({
      searchResults: keyword
        ? this.data.memories
            .filter((memory) =>
              (memory.text + ' ' + memory.placeName + ' ' + getMemoryMoodLabel(memory))
                .toLowerCase()
                .includes(keyword),
            )
            .slice(0, 60)
            .map(entryRow)
        : [],
    });
  },
  closePanels() {
    this.setData({ showDaySheet: false });
  },
  noop() {},
});
