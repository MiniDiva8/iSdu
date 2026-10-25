import { hasJournalLocation } from '../../utils/journal';
import { campusMapConfig } from '../../config/campus-map';
import type { FriendTimelineCursor, FriendTimelineItem } from '../../models/friend-timeline-item';
import { getMemoryCategoryLabel, getMemoryMoodLabel, type Memory } from '../../models/memory';
import type { UserProfile } from '../../models/user-profile';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { consumeMapFocusIntent, setMapFocusIntent } from '../../services/map-focus-intent';
import { cloudMemoryRepository } from '../../services/repository/cloud-memory-repository';
import { memoryRepository, userProfileRepository } from '../../services/repository/index';
import { timelineCoverService } from '../../services/timeline-cover-service';
import { formatMemoryDateTime } from '../../utils/date-format';
import { EMPTY_MEMORY_FILTERS, filterMemories } from '../../utils/memory-filters';
import { groupMemoriesByMonth } from '../../utils/memory-insights';

interface TimelineMemoryView {
  categoryLabel: string;
  dateLabel: string;
  hasImage: boolean;
  id: string;
  imageFailed: boolean;
  imagePath: string;
  isDemo: boolean;
  mapAssetVersion: string;
  hasLocation: boolean;
  mood: Memory['mood'];
  mapXRatio: number;
  mapYRatio: number;
  moodLabel: string;
  placeLabel: string;
  summary: string;
}

interface TimelineMonthView {
  countLabel: string;
  items: TimelineMemoryView[];
  key: string;
  title: string;
}

type TimelineMode = 'friends' | 'mine';

function isTimelineMode(value: unknown): value is TimelineMode {
  return value === 'friends' || value === 'mine';
}

interface FriendTimelineView {
  categoryLabel: string;
  dateLabel: string;
  hasImage: boolean;
  id: string;
  imageFailed: boolean;
  imagePath: string;
  isMapAvailable: boolean;
  likeLabel: string;
  mapActionLabel: string;
  mapXRatio: number;
  mapYRatio: number;
  moodLabel: string;
  ownerDisplayName: string;
  ownerInitial: string;
  placeLabel: string;
  sharedDateLabel: string;
  summary: string;
}

const CAMPUS_NAME = campusMapConfig.displayName;
const CAMPUS_SHORT_NAME = CAMPUS_NAME.replace(/^山东大学/u, '') || CAMPUS_NAME;
const FRIEND_MAP_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_COVER_IMAGE_BYTES = 10 * 1024 * 1024;

function isCoverSelectionCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errMsg' in error &&
    typeof error.errMsg === 'string' &&
    /cancel/iu.test(error.errMsg)
  );
}

function createTimelineTitle(profile: UserProfile | null): string {
  return profile
    ? `${profile.displayName}的${CAMPUS_SHORT_NAME}时光`
    : `我的${CAMPUS_SHORT_NAME}时光`;
}

function createProfileInitial(displayName: string): string {
  return Array.from(displayName.trim())[0] ?? '忆';
}

function createSummary(memory: Memory): string {
  const text = memory.text.trim().replace(/\s+/gu, ' ');
  return text ? text.slice(0, 72) : '这是一段只有照片的校园回忆。';
}

function createTimelineItem(memory: Memory): TimelineMemoryView {
  const imagePath = memory.imagePaths[0] ?? '';

  return {
    categoryLabel: getMemoryCategoryLabel(memory),
    dateLabel: formatMemoryDateTime(memory.recordedAt),
    hasImage: Boolean(imagePath),
    id: memory.id,
    imageFailed: false,
    imagePath,
    isDemo: memory.origin === 'demo',
    mapAssetVersion: memory.mapAssetVersion,
    hasLocation: hasJournalLocation(memory),
    mood: memory.mood,
    mapXRatio: memory.mapXRatio,
    mapYRatio: memory.mapYRatio,
    moodLabel: getMemoryMoodLabel(memory),
    placeLabel: memory.placeName || '一页心情日记',
    summary: createSummary(memory),
  };
}

function createMonthViews(memories: readonly Memory[]): TimelineMonthView[] {
  return groupMemoriesByMonth(memories).map((group) => ({
    countLabel: `${group.memories.length} 条回忆`,
    items: group.memories.map(createTimelineItem),
    key: group.key,
    title: group.title,
  }));
}

function createFriendTimelineView(item: FriendTimelineItem): FriendTimelineView {
  const publishedTimestamp = Date.parse(item.publishedAt);
  const isRecent =
    Number.isFinite(publishedTimestamp) && publishedTimestamp >= Date.now() - FRIEND_MAP_WINDOW_MS;
  const isCurrentMap = item.mapAssetVersion === campusMapConfig.assetVersion;
  const isMapAvailable = isRecent && isCurrentMap;

  return {
    categoryLabel: getMemoryCategoryLabel(item),
    dateLabel: formatMemoryDateTime(item.recordedAt),
    hasImage: item.hasImage && Boolean(item.thumbnailUrl),
    id: item.id,
    imageFailed: false,
    imagePath: item.thumbnailUrl,
    isMapAvailable,
    likeLabel: item.likeCount > 0 ? `${item.likeCount} 个赞` : '',
    mapActionLabel: !isCurrentMap ? '旧版地图回忆' : isRecent ? '在地图中查看' : '已超过 24 小时',
    mapXRatio: item.mapXRatio,
    mapYRatio: item.mapYRatio,
    moodLabel: getMemoryMoodLabel(item),
    ownerDisplayName: item.ownerDisplayName,
    ownerInitial: createProfileInitial(item.ownerDisplayName),
    placeLabel: item.placeName || '校园中的某处',
    sharedDateLabel: `分享于 ${formatMemoryDateTime(item.publishedAt)}`,
    summary: item.summary,
  };
}

Page({
  _coverLoadVersion: 0,
  _isCoverMenuOpen: false,

  data: {
    coverImagePath: '',
    coverImageFailed: false,
    coverErrorMessage: '',
    isCoverLoading: true,
    isCoverSaving: false,
    actionMessage: '',
    allMemories: [] as Memory[],
    campusName: CAMPUS_NAME,
    errorMessage: '',
    friendCursor: null as FriendTimelineCursor | null,
    friendErrorMessage: '',
    friendHasMore: false,
    friendItems: [] as FriendTimelineView[],
    friendLoaded: false,
    friendTimelineTitle: `好友的${CAMPUS_SHORT_NAME}时光`,
    groups: [] as TimelineMonthView[],
    isCloudActive: false,
    isEmpty: false,
    isFriendLoading: false,
    isFriendLoadingMore: false,
    isLoading: true,
    isProfileLoading: true,
    isSearchEmpty: false,
    keyword: '',
    profileErrorMessage: '',
    resultCount: 0,
    timelineMode: 'mine',
    timelineTitle: createTimelineTitle(null),
  },

  onShow() {
    const isCloudActive = cloudModeService.getState().mode === 'cloud';
    this.setData({ isCloudActive });
    void this.loadTimeline();
    void this.loadProfile();
    void this.loadCover();
    if (this.data.timelineMode === 'friends') {
      void this.loadFriendTimeline(true);
    }
  },

  onPullDownRefresh() {
    const task =
      this.data.timelineMode === 'friends' ? this.loadFriendTimeline(true) : this.loadTimeline();
    void task.finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.timelineMode === 'friends' && this.data.friendHasMore) {
      void this.loadFriendTimeline(false);
    }
  },

  async loadCover() {
    if (this.data.isCoverSaving) return;
    const version = ++this._coverLoadVersion;
    this.setData({ isCoverLoading: true });
    try {
      const imagePath = await timelineCoverService.getCover();
      if (version !== this._coverLoadVersion) return;
      this.setData({ coverImagePath: imagePath, coverImageFailed: false, coverErrorMessage: '' });
    } catch (error: unknown) {
      if (version !== this._coverLoadVersion) return;
      this.setData({
        coverImagePath: '',
        coverImageFailed: false,
        coverErrorMessage:
          error instanceof Error ? error.message : '封面暂时无法读取，请重新选择。',
      });
    } finally {
      if (version === this._coverLoadVersion) this.setData({ isCoverLoading: false });
    }
  },

  async changeCover() {
    if (this.data.isCoverSaving || this._isCoverMenuOpen) return;
    this._isCoverMenuOpen = true;
    try {
      const result = await wx.showActionSheet({ itemList: ['选择一张封面图片', '恢复默认封面'] });
      if (result.tapIndex === 0) await this.chooseCoverImage();
      if (result.tapIndex === 1) await this.restoreDefaultCover();
    } catch (error: unknown) {
      if (!isCoverSelectionCancelled(error)) {
        this.setData({ coverErrorMessage: '封面菜单未能打开，请稍后重试。' });
      }
    } finally {
      this._isCoverMenuOpen = false;
    }
  },

  async chooseCoverImage() {
    if (this.data.isCoverSaving) return;
    ++this._coverLoadVersion;
    this.setData({ isCoverSaving: true, isCoverLoading: false, coverErrorMessage: '' });
    try {
      const result = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      const file = result.tempFiles[0];
      if (
        !file ||
        !file.tempFilePath ||
        !Number.isFinite(file.size) ||
        file.size <= 0 ||
        file.size > MAX_COVER_IMAGE_BYTES
      ) {
        this.setData({ coverErrorMessage: '请选择一张可读取且不超过 10 MB 的图片。' });
        return;
      }
      const imagePath = await timelineCoverService.saveCover(file.tempFilePath);
      this.setData({ coverImagePath: imagePath, coverImageFailed: false, coverErrorMessage: '' });
      void wx.showToast({ title: '封面已更新', icon: 'success' });
    } catch (error: unknown) {
      if (!isCoverSelectionCancelled(error)) {
        this.setData({
          coverErrorMessage: error instanceof Error ? error.message : '图片选择失败，请稍后重试。',
        });
      }
    } finally {
      this.setData({ isCoverSaving: false });
    }
  },

  async restoreDefaultCover() {
    if (this.data.isCoverSaving) return;
    ++this._coverLoadVersion;
    this.setData({ isCoverSaving: true, isCoverLoading: false, coverErrorMessage: '' });
    try {
      await timelineCoverService.clearCover();
      this.setData({ coverImagePath: '', coverImageFailed: false });
      void wx.showToast({ title: '已恢复默认封面', icon: 'success' });
    } catch (error: unknown) {
      try {
        const imagePath = await timelineCoverService.getCover();
        this.setData({ coverImagePath: imagePath, coverImageFailed: false });
      } catch {
        // Keep the last visible cover when storage cannot be read either.
      }
      this.setData({
        coverErrorMessage:
          error instanceof Error ? error.message : '恢复默认封面失败，请稍后重试。',
      });
    } finally {
      this.setData({ isCoverSaving: false });
    }
  },

  handleCoverImageError(event: WechatMiniprogram.BaseEvent) {
    if (event.currentTarget.dataset.imagePath !== this.data.coverImagePath) return;
    this.setData({
      coverImageFailed: true,
      coverErrorMessage: '封面图片暂时无法显示，请重新选择。',
    });
  },

  async loadProfile() {
    this.setData({ isProfileLoading: true, profileErrorMessage: '' });
    try {
      const profile = await userProfileRepository.getProfile();
      this.setData({ isProfileLoading: false, timelineTitle: createTimelineTitle(profile) });
    } catch (error: unknown) {
      this.setData({
        isProfileLoading: false,
        profileErrorMessage:
          error instanceof Error ? error.message : '个人资料读取失败，请前往我的空间重新设置。',
      });
    }
  },

  openMySpace() {
    void wx.switchTab({
      url: '/pages/profile/index',
      fail: () => this.setData({ actionMessage: '我的空间暂时无法打开，请稍后重试。' }),
    });
  },

  async loadTimeline() {
    this.setData({
      actionMessage: '',
      errorMessage: '',
      isEmpty: false,
      isLoading: true,
    });

    try {
      const memories = await memoryRepository.listMemories();
      this.applyKeywordSearch(memories, this.data.keyword, {
        isLoading: false,
        replaceMemories: true,
      });
    } catch (error: unknown) {
      this.setData({
        errorMessage: error instanceof Error ? error.message : '本地时光记录读取失败，请重试。',
        allMemories: [],
        groups: [],
        isLoading: false,
        isSearchEmpty: false,
        resultCount: 0,
      });
    }
  },

  async loadFriendTimeline(reset = true) {
    if (this.data.isFriendLoading || this.data.isFriendLoadingMore) {
      return;
    }

    const isCloudActive = cloudModeService.getState().mode === 'cloud';
    if (!isCloudActive) {
      this.setData({
        friendCursor: null,
        friendErrorMessage: '请先在“数据管理”中开启云端与好友功能。',
        friendHasMore: false,
        friendItems: [],
        friendLoaded: true,
        isCloudActive: false,
        isFriendLoading: false,
        isFriendLoadingMore: false,
      });
      return;
    }

    this.setData({
      friendErrorMessage: '',
      isCloudActive: true,
      isFriendLoading: reset,
      isFriendLoadingMore: !reset,
    });

    try {
      const page = await cloudMemoryRepository.listFriendTimeline(
        reset ? null : this.data.friendCursor,
      );
      const nextItems = page.items.map(createFriendTimelineView);
      this.setData({
        friendCursor: page.nextCursor,
        friendErrorMessage: '',
        friendHasMore: Boolean(page.nextCursor),
        friendItems: reset ? nextItems : [...this.data.friendItems, ...nextItems],
        friendLoaded: true,
        isFriendLoading: false,
        isFriendLoadingMore: false,
      });
    } catch (error: unknown) {
      this.setData({
        friendErrorMessage:
          error instanceof Error ? error.message : '好友时光暂时无法读取，请稍后重试。',
        friendLoaded: true,
        isFriendLoading: false,
        isFriendLoadingMore: false,
      });
    }
  },

  loadMoreFriendTimeline() {
    void this.loadFriendTimeline(false);
  },

  refreshFriendTimeline() {
    void this.loadFriendTimeline(true);
  },

  switchTimelineMode(event: WechatMiniprogram.BaseEvent) {
    const mode = (event.currentTarget.dataset as { mode?: unknown }).mode;
    if (!isTimelineMode(mode) || mode === this.data.timelineMode) {
      return;
    }
    this.setData({ actionMessage: '', timelineMode: mode });
    if (mode === 'friends' && !this.data.friendLoaded) {
      void this.loadFriendTimeline(true);
    }
  },

  applyKeywordSearch(
    memories: readonly Memory[],
    keyword: string,
    options: { isLoading: boolean; replaceMemories: boolean },
  ) {
    const filteredMemories = filterMemories(memories, {
      ...EMPTY_MEMORY_FILTERS,
      keyword,
    });

    this.setData({
      allMemories: options.replaceMemories ? [...memories] : this.data.allMemories,
      groups: createMonthViews(filteredMemories),
      isEmpty: memories.length === 0,
      isLoading: options.isLoading,
      isSearchEmpty: memories.length > 0 && filteredMemories.length === 0,
      keyword,
      resultCount: filteredMemories.length,
    });
  },

  handleKeywordInput(event: WechatMiniprogram.Input) {
    this.applyKeywordSearch(this.data.allMemories, event.detail.value, {
      isLoading: false,
      replaceMemories: false,
    });
  },

  clearKeyword() {
    this.applyKeywordSearch(this.data.allMemories, '', {
      isLoading: false,
      replaceMemories: false,
    });
  },

  openDataManagement() {
    void wx.navigateTo({
      url: '/pages/data-management/index',
      fail: () => {
        this.setData({ actionMessage: '数据管理页暂时无法打开，请稍后重试。' });
      },
    });
  },

  openFriends() {
    void wx.navigateTo({
      url: '/pages/friends/index',
      fail: () => {
        this.setData({ actionMessage: '好友页暂时无法打开，请稍后重试。' });
      },
    });
  },

  findMemoryView(memoryId: string): TimelineMemoryView | null {
    for (const group of this.data.groups) {
      const memory = group.items.find((item) => item.id === memoryId);

      if (memory) {
        return memory;
      }
    }

    return null;
  },

  handleImageError(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { memoryId?: unknown };
    const memoryId = typeof dataset.memoryId === 'string' ? dataset.memoryId : '';

    if (!memoryId) {
      return;
    }

    this.setData({
      groups: this.data.groups.map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.id === memoryId ? { ...item, imageFailed: true } : item,
        ),
      })),
    });
  },

  handleFriendImageError(event: WechatMiniprogram.BaseEvent) {
    const memoryId = (event.currentTarget.dataset as { memoryId?: unknown }).memoryId;
    if (typeof memoryId !== 'string') return;
    this.setData({
      friendItems: this.data.friendItems.map((item) =>
        item.id === memoryId ? { ...item, imageFailed: true } : item,
      ),
    });
  },

  openDetail(event: WechatMiniprogram.BaseEvent) {
    const currentDataset = event.currentTarget.dataset as { memoryId?: unknown };
    const targetDataset = (event.target as { dataset?: { memoryId?: unknown } }).dataset;
    const rawMemoryId = currentDataset.memoryId ?? targetDataset?.memoryId;
    const memoryId = typeof rawMemoryId === 'string' ? rawMemoryId : '';

    if (!this.findMemoryView(memoryId)) {
      this.setData({ actionMessage: '这条回忆已不存在，请刷新时间轴。' });
      return;
    }

    void wx.navigateTo({
      url: `/pages/detail/index?memoryId=${encodeURIComponent(memoryId)}`,
      fail: () => {
        this.setData({ actionMessage: '详情页打开失败，请稍后重试。' });
      },
    });
  },

  openFriendDetail(event: WechatMiniprogram.BaseEvent) {
    const memoryId = (event.currentTarget.dataset as { memoryId?: unknown }).memoryId;
    if (
      typeof memoryId !== 'string' ||
      !this.data.friendItems.some((item) => item.id === memoryId)
    ) {
      this.setData({ actionMessage: '这段好友回忆已不可访问，请刷新好友时光。' });
      return;
    }
    void wx.navigateTo({
      url: `/pages/detail/index?memoryId=${encodeURIComponent(memoryId)}&source=friend`,
      fail: () => this.setData({ actionMessage: '好友回忆详情暂时无法打开。' }),
    });
  },

  showOnMap(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { memoryId?: unknown };
    const memoryId = typeof dataset.memoryId === 'string' ? dataset.memoryId : '';
    const memory = this.findMemoryView(memoryId);

    if (!memory) {
      this.setData({ actionMessage: '这条回忆已不存在，请刷新时间轴。' });
      return;
    }

    if (!hasJournalLocation(memory)) {
      this.setData({ actionMessage: '这篇日记没有关联校园地点。' });
      return;
    }

    setMapFocusIntent({
      mapXRatio: memory.mapXRatio,
      mapYRatio: memory.mapYRatio,
      memoryId: memory.id,
      source: 'timeline',
    });

    void wx.switchTab({
      url: '/pages/map/index',
      fail: () => {
        consumeMapFocusIntent();
        this.setData({ actionMessage: '地图暂时无法打开，请稍后重试。' });
      },
    });
  },

  showFriendOnMap(event: WechatMiniprogram.BaseEvent) {
    const memoryId = (event.currentTarget.dataset as { memoryId?: unknown }).memoryId;
    const memory =
      typeof memoryId === 'string'
        ? this.data.friendItems.find((item) => item.id === memoryId)
        : undefined;
    if (!memory || !memory.isMapAvailable) {
      this.setData({ actionMessage: memory?.mapActionLabel || '这段好友回忆暂时无法定位。' });
      return;
    }
    setMapFocusIntent({
      mapXRatio: memory.mapXRatio,
      mapYRatio: memory.mapYRatio,
      memoryId: memory.id,
      source: 'friend-timeline',
    });
    void wx.switchTab({
      url: '/pages/map/index',
      fail: () => {
        consumeMapFocusIntent();
        this.setData({ actionMessage: '地图暂时无法打开，请稍后重试。' });
      },
    });
  },

  openAlbum() {
    void wx.navigateTo({ url: '/pages/album/index' });
  },

  goToRecord() {
    void wx.switchTab({
      url: '/pages/journal/index',
      fail: () => {
        this.setData({ actionMessage: '地图暂时无法打开，请稍后重试。' });
      },
    });
  },
});
