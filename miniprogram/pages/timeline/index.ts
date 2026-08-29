import { campusMapConfig } from '../../config/campus-map';
import type { FriendTimelineCursor, FriendTimelineItem } from '../../models/friend-timeline-item';
import { getMemoryCategoryLabel, getMemoryMoodLabel, type Memory } from '../../models/memory';
import {
  USER_PROFILE_NAME_MAX_LENGTH,
  USER_PROFILE_SIGNATURE_MAX_LENGTH,
  UserProfileValidationError,
  type UserProfile,
} from '../../models/user-profile';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { consumeMapFocusIntent, setMapFocusIntent } from '../../services/map-focus-intent';
import { cloudAuthRepository } from '../../services/repository/cloud-auth-repository';
import { cloudMemoryRepository } from '../../services/repository/cloud-memory-repository';
import { memoryRepository, userProfileRepository } from '../../services/repository/index';
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
    mapXRatio: memory.mapXRatio,
    mapYRatio: memory.mapYRatio,
    moodLabel: getMemoryMoodLabel(memory),
    placeLabel: memory.placeName || '校园中的某处',
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
  data: {
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
    isProfileEditorOpen: false,
    isProfileLoading: true,
    isProfileSaving: false,
    isSearchEmpty: false,
    keyword: '',
    profileButtonLabel: '设置资料',
    profileDisplayName: '',
    profileDraftName: '',
    profileDraftSignature: '',
    profileErrorMessage: '',
    profileInitial: '忆',
    profileNameMaxLength: USER_PROFILE_NAME_MAX_LENGTH,
    profileSignature: '',
    profileSignatureMaxLength: USER_PROFILE_SIGNATURE_MAX_LENGTH,
    resultCount: 0,
    timelineMode: 'mine',
    timelineTitle: createTimelineTitle(null),
  },

  onShow() {
    const isCloudActive = cloudModeService.getState().mode === 'cloud';
    this.setData({ isCloudActive });
    void this.loadTimeline();
    void this.loadProfile();
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

  async loadProfile() {
    this.setData({ isProfileLoading: true, profileErrorMessage: '' });

    try {
      const profile = await userProfileRepository.getProfile();
      const displayName = profile?.displayName ?? '';

      this.setData({
        isProfileLoading: false,
        profileButtonLabel: profile ? '编辑资料' : '设置资料',
        profileDisplayName: displayName,
        profileDraftName: displayName,
        profileDraftSignature: profile?.signature ?? '',
        profileInitial: createProfileInitial(displayName),
        profileSignature: profile?.signature ?? '',
        timelineTitle: createTimelineTitle(profile),
      });
    } catch (error: unknown) {
      this.setData({
        isProfileLoading: false,
        profileErrorMessage:
          error instanceof Error ? error.message : '本地个人资料读取失败，请重新设置。',
      });
    }
  },

  openProfileEditor() {
    this.setData({
      isProfileEditorOpen: true,
      profileDraftName: this.data.profileDisplayName,
      profileDraftSignature: this.data.profileSignature,
      profileErrorMessage: '',
    });
  },

  cancelProfileEditor() {
    if (this.data.isProfileSaving) {
      return;
    }

    this.setData({
      isProfileEditorOpen: false,
      profileDraftName: this.data.profileDisplayName,
      profileDraftSignature: this.data.profileSignature,
      profileErrorMessage: '',
    });
  },

  handleProfileNameInput(event: WechatMiniprogram.Input) {
    this.setData({
      profileDraftName: event.detail.value.slice(0, USER_PROFILE_NAME_MAX_LENGTH),
      profileErrorMessage: '',
    });
  },

  handleProfileSignatureInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({
      profileDraftSignature: event.detail.value.slice(0, USER_PROFILE_SIGNATURE_MAX_LENGTH),
      profileErrorMessage: '',
    });
  },

  async saveProfile() {
    if (this.data.isProfileSaving) {
      return;
    }

    this.setData({ isProfileSaving: true, profileErrorMessage: '' });

    try {
      const profile = await userProfileRepository.saveProfile({
        displayName: this.data.profileDraftName,
        signature: this.data.profileDraftSignature,
      });

      let actionMessage = '个人资料已保存在本机。';
      if (cloudModeService.getState().privacyAcceptedAt) {
        try {
          await cloudAuthRepository.bootstrap();
          await cloudAuthRepository.updateMyProfile({
            displayName: profile.displayName,
            signature: profile.signature,
          });
          actionMessage = '个人资料已同步到 iSdu 好友身份。';
        } catch {
          actionMessage = '资料已保存在本机，但云端好友资料同步失败，请稍后重试。';
        }
      }

      this.setData({
        actionMessage,
        isProfileEditorOpen: false,
        isProfileSaving: false,
        profileButtonLabel: '编辑资料',
        profileDisplayName: profile.displayName,
        profileDraftName: profile.displayName,
        profileDraftSignature: profile.signature,
        profileInitial: createProfileInitial(profile.displayName),
        profileSignature: profile.signature,
        timelineTitle: createTimelineTitle(profile),
      });
    } catch (error: unknown) {
      this.setData({
        isProfileSaving: false,
        profileErrorMessage:
          error instanceof UserProfileValidationError || error instanceof Error
            ? error.message
            : '个人资料保存失败，请重试。',
      });
    }
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
      url: '/pages/profile/index',
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

  goToRecord() {
    void wx.switchTab({
      url: '/pages/map/index',
      fail: () => {
        this.setData({ actionMessage: '地图暂时无法打开，请稍后重试。' });
      },
    });
  },
});
