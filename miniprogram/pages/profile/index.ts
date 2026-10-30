import {
  MEMORY_MOODS,
  MEMORY_CATEGORIES,
  MEMORY_MOOD_LABELS,
  MEMORY_CATEGORY_LABELS,
} from '../../models/memory';
import { buildProfileSummary, type ProfileMoodCount } from '../../utils/profile-summary';
import { journalPreferencesService } from '../../services/journal-preferences-service';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { memoryRepository, userProfileRepository } from '../../services/repository/index';
Page({
  _active: true,
  _avatarVersion: 0,
  _summaryVersion: 0,
  _profileVersion: 0,
  data: {
    avatarActive: false,
    avatarMotionEnabled: false,
    topInset: 24,
    displayName: '给自己取个名字',
    signature: '为校园生活，留一份自己的注脚。',
    initial: '忆',
    storageLabel: '本机保存 · 尚未备份',
    isLoading: true,
    errorMessage: '',
    entryCount: 0,
    characterCount: 0,
    currentStreak: 0,
    recordedDayCount: 0,
    campusPlaceCount: 0,
    insightsReady: false,
    insightError: '',
    moodCounts: [] as ProfileMoodCount[],
    moodCount: MEMORY_MOODS.length,
    categoryCount: MEMORY_CATEGORIES.length,
    defaultMood: 'calm',
    defaultMoodLabel: '平静',
    defaultCategory: 'campus-life',
    defaultCategoryLabel: '校园生活',
    haptics: false,
    panel: '',
  },
  onLoad() {
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : null;
    this.setData({ topInset: info?.statusBarHeight ?? 24 });
  },
  onShow() {
    this._active = true;
    this.setData({ avatarActive: true, avatarMotionEnabled: false });
    this.prepareAvatarMotion();
    void this.loadProfile();
    void this.loadInsights();
  },
  onHide() {
    this._active = false;
    this._summaryVersion += 1;
    this._profileVersion += 1;
    this._avatarVersion += 1;
    this.setData({ panel: '', avatarActive: false, avatarMotionEnabled: false });
  },
  onUnload() {
    this._active = false;
    this._avatarVersion += 1;
    this._summaryVersion += 1;
    this._profileVersion += 1;
  },
  prepareAvatarMotion() {
    const version = ++this._avatarVersion;
    const current = () => this._active && version === this._avatarVersion && this.data.avatarActive;
    if (typeof wx.getPrivacySetting !== 'function') return;
    try {
      void wx.getPrivacySetting({
        success: (result) => {
          if (current() && result.needAuthorization === false)
            this.setData({ avatarMotionEnabled: true });
        },
        fail: () => undefined,
      });
    } catch {
      /* Unavailable platform privacy state keeps the original avatar usable. */
    }
  },
  handleAvatarMotionState(event: WechatMiniprogram.CustomEvent<{ status: string }>) {
    if (event.detail.status === 'unavailable' || event.detail.status === 'error') {
      this._avatarVersion += 1;
      this.setData({ avatarMotionEnabled: false });
    }
  },
  async loadProfile() {
    const version = ++this._profileVersion;
    const prefs = journalPreferencesService.read();
    this.setData({
      isLoading: true,
      errorMessage: '',
      defaultMood: prefs.defaultMood,
      defaultMoodLabel: MEMORY_MOOD_LABELS[prefs.defaultMood],
      defaultCategory: prefs.defaultCategory,
      defaultCategoryLabel: MEMORY_CATEGORY_LABELS[prefs.defaultCategory],
      haptics: prefs.haptics,
      storageLabel:
        cloudModeService.getState().mode === 'cloud'
          ? '云端已开启 · 按权限分享'
          : '本机保存 · 尚未备份',
    });
    try {
      const profile = await userProfileRepository.getProfile();
      if (!this._active || version !== this._profileVersion) return;
      this.setData({
        displayName: profile?.displayName || '给自己取个名字',
        signature: profile?.signature || '为校园生活，留一份自己的注脚。',
        initial: Array.from(profile?.displayName || '忆')[0] || '忆',
        isLoading: false,
      });
    } catch (error: unknown) {
      if (!this._active || version !== this._profileVersion) return;
      this.setData({
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : '个人资料读取失败，请稍后重试。',
      });
    }
  },
  async loadInsights() {
    const version = ++this._summaryVersion;
    const mode = cloudModeService.getState().mode;
    this.setData({
      insightsReady: false,
      insightError: '',
      entryCount: 0,
      characterCount: 0,
      currentStreak: 0,
      recordedDayCount: 0,
      campusPlaceCount: 0,
      moodCounts: [],
    });
    try {
      const memories = await memoryRepository.listMemories();
      if (
        !this._active ||
        version !== this._summaryVersion ||
        mode !== cloudModeService.getState().mode
      )
        return;
      this.setData({ ...buildProfileSummary(memories), insightsReady: true });
    } catch {
      if (
        !this._active ||
        version !== this._summaryVersion ||
        mode !== cloudModeService.getState().mode
      )
        return;
      this.setData({
        entryCount: 0,
        characterCount: 0,
        currentStreak: 0,
        recordedDayCount: 0,
        campusPlaceCount: 0,
        moodCounts: [],
        insightsReady: false,
        insightError: '日记统计暂时没有读到，稍后回来看看。',
      });
    }
  },
  openJournal() {
    void wx.switchTab({ url: '/pages/journal/index' });
  },
  openCampus() {
    void wx.switchTab({ url: '/pages/map/index' });
  },
  openPanel(event: WechatMiniprogram.BaseEvent) {
    const panel = event.currentTarget.dataset.panel as unknown;
    if (panel === 'preferences' || panel === 'stats') this.setData({ panel });
  },
  closePanel() {
    this.setData({ panel: '' });
  },
  noop() {},
  openMoodDefaults() {
    this.openDefaultWheel('mood');
  },
  openCategoryDefaults() {
    this.openDefaultWheel('category');
  },
  openDefaultWheel(kind: 'mood' | 'category') {
    const prefs = journalPreferencesService.read();
    const value = kind === 'mood' ? prefs.defaultMood : prefs.defaultCategory;
    this.setData({ panel: '' });
    void wx.navigateTo({
      url: '/pages/selection-wheel/index?source=preferences&kind=' + kind + '&value=' + value,
      fail: () => this.setData({ errorMessage: '选择页暂时无法打开，请稍后重试。' }),
    });
  },
  toggleHaptics(event: WechatMiniprogram.SwitchChange) {
    try {
      const prefs = journalPreferencesService.save({ haptics: event.detail.value });
      this.setData({ haptics: prefs.haptics, errorMessage: '' });
    } catch {
      this.setData({ errorMessage: '偏好未能保存，请稍后重试。' });
    }
  },
  openSection(event: WechatMiniprogram.BaseEvent) {
    const key = (event.currentTarget.dataset as { page?: unknown }).page;
    const destinations: Record<string, string> = {
      'profile-edit': '/pages/profile-edit/index',
      'data-management': '/pages/data-management/index',
      friends: '/pages/friends/index',
      about: '/pages/about/index',
      album: '/pages/album/index',
      'memory-bottle': '/pages/memory-bottle/index',
      companion: '/pages/companion/index',
    };
    const url = typeof key === 'string' ? destinations[key] : undefined;
    if (!url) return;
    void wx.navigateTo({
      url,
      fail: () => this.setData({ errorMessage: '页面暂时无法打开，请稍后重试。' }),
    });
  },
});
