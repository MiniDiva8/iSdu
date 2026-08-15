import { campusMapConfig } from '../../config/campus-map';
import { getMemoryCategoryLabel, getMemoryMoodLabel, type Memory } from '../../models/memory';
import {
  USER_PROFILE_NAME_MAX_LENGTH,
  USER_PROFILE_SIGNATURE_MAX_LENGTH,
  UserProfileValidationError,
  type UserProfile,
} from '../../models/user-profile';
import { consumeMapFocusIntent, setMapFocusIntent } from '../../services/map-focus-intent';
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

const CAMPUS_NAME = campusMapConfig.displayName;
const CAMPUS_SHORT_NAME = CAMPUS_NAME.replace(/^山东大学/u, '') || CAMPUS_NAME;

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

Page({
  data: {
    actionMessage: '',
    allMemories: [] as Memory[],
    campusName: CAMPUS_NAME,
    errorMessage: '',
    groups: [] as TimelineMonthView[],
    isEmpty: false,
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
    timelineTitle: createTimelineTitle(null),
  },

  onShow() {
    void this.loadTimeline();
    void this.loadProfile();
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

      this.setData({
        actionMessage: '个人资料已保存在本机。',
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

  goToRecord() {
    void wx.switchTab({
      url: '/pages/map/index',
      fail: () => {
        this.setData({ actionMessage: '地图暂时无法打开，请稍后重试。' });
      },
    });
  },
});
