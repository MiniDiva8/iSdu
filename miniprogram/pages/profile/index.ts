import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { userProfileRepository } from '../../services/repository/index';

Page({
  data: {
    displayName: '给自己取个名字',
    signature: '为校园生活，留一份自己的注脚。',
    initial: '忆',
    storageLabel: '本机保存 · 尚未备份',
    isLoading: true,
    errorMessage: '',
  },
  onShow() {
    void this.loadProfile();
  },
  async loadProfile() {
    this.setData({
      isLoading: true,
      errorMessage: '',
      storageLabel:
        cloudModeService.getState().mode === 'cloud'
          ? '云端已开启 · 按权限分享'
          : '本机保存 · 尚未备份',
    });
    try {
      const profile = await userProfileRepository.getProfile();
      this.setData({
        displayName: profile?.displayName || '给自己取个名字',
        signature: profile?.signature || '为校园生活，留一份自己的注脚。',
        initial: Array.from(profile?.displayName || '忆')[0] || '忆',
        isLoading: false,
      });
    } catch (error: unknown) {
      this.setData({
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : '个人资料读取失败，请稍后重试。',
      });
    }
  },
  openSection(event: WechatMiniprogram.BaseEvent) {
    const key = (event.currentTarget.dataset as { page?: unknown }).page;
    const destinations: Record<string, string> = {
      'profile-edit': '/pages/profile-edit/index',
      'data-management': '/pages/data-management/index',
      friends: '/pages/friends/index',
      about: '/pages/about/index',
    };
    const url = typeof key === 'string' ? destinations[key] : undefined;
    if (!url) return;
    void wx.navigateTo({
      url,
      fail: () => this.setData({ errorMessage: '页面暂时无法打开，请稍后重试。' }),
    });
  },
});
