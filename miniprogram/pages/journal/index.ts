import { getMemoryMoodLabel, type Memory } from '../../models/memory';
import { memoryRepository } from '../../services/repository/index';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { journalDraftService } from '../../services/journal-draft-service';
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
    errorMessage: '',
    storageLabel: '仅存本机',
    showDaySheet: false,
    showSearch: false,
    hasDraft: false,
    dayEntries: [] as EntryRow[],
    searchResults: [] as EntryRow[],
    keyword: '',
  },
  onLoad() {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : null;
    this.setData({ topInset: info?.statusBarHeight ?? 24 });
  },
  onShow() {
    this.getTabBar?.()?.setData({ selected: 0 });
    void this.loadJournal();
  },
  async onPullDownRefresh() {
    await this.loadJournal();
    void wx.stopPullDownRefresh();
  },
  onHide() {
    this.loadVersion += 1;
  },
  onUnload() {
    this.loadVersion += 1;
  },
  async loadJournal() {
    const loadVersion = ++this.loadVersion;
    const sourceMode = cloudModeService.getState().mode;
    const monthKey = this.data.monthKey;
    this.setData({
      isLoading: true,
      errorMessage: '',
      showDaySheet: false,
      dayEntries: [],
      memories: [],
      searchResults: [],
      days: [],
      hasDraft: false,
    });
    try {
      const memories = await memoryRepository.listMemories();
      if (loadVersion !== this.loadVersion || sourceMode !== cloudModeService.getState().mode)
        return;
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
      this.setData({
        memories,
        days: model.days,
        monthLabel: model.monthLabel,
        yearLabel: model.year,
        entryCount: model.entryCount,
        recordedDays: model.recordedDays,
        todayKey: getJournalDayKey(now),
        isLoading: false,
        hasDraft,
        storageLabel: isLocal ? '仅存本机' : '云端日记',
      });
      this.updateSearchResults();
    } catch (error: unknown) {
      if (loadVersion !== this.loadVersion || sourceMode !== cloudModeService.getState().mode)
        return;
      this.setData({
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : '日记暂时没有读到，请重试。',
        memories: [],
        days: [],
        dayEntries: [],
        searchResults: [],
        entryCount: 0,
        recordedDays: 0,
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
