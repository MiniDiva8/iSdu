import type { FriendInvitePreview } from '../../models/cloud-friend';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { cloudAuthRepository } from '../../services/repository/cloud-auth-repository';
import { cloudFriendRepository } from '../../services/repository/cloud-friend-repository';

function confirmFriendCloudUse(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '开启 iSdu 好友身份？',
      content:
        '接受邀请会创建你的随机 iSdu 用户身份和双向好友关系。不会读取微信好友、通讯录、手机号或 GPS，也不会自动上传本机回忆。',
      confirmText: '同意并继续',
      cancelText: '取消',
      success: (result) => resolve(result.confirm),
      fail: (result) => reject(new Error(result.errMsg)),
    });
  });
}

Page({
  data: {
    actionMessage: '',
    accepted: false,
    isAccepting: false,
    isLoading: true,
    preview: null as FriendInvitePreview | null,
    previewInitial: '忆',
    token: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    const token = query.token?.trim() ?? '';
    this.setData({ token });
    void this.loadInvite();
  },

  async ensureIdentityConsent() {
    if (!cloudModeService.getState().privacyAcceptedAt) {
      if (!(await confirmFriendCloudUse())) {
        throw new Error('你取消了好友身份开启，本次没有建立关系。');
      }
      cloudModeService.acceptPrivacy();
    }
    await cloudAuthRepository.bootstrap();
  },

  async loadInvite() {
    if (!this.data.token) {
      this.setData({ actionMessage: '邀请链接缺少凭证，请让好友重新发送。', isLoading: false });
      return;
    }
    try {
      await this.ensureIdentityConsent();
      const preview = await cloudFriendRepository.resolveInvite(this.data.token);
      this.setData({
        isLoading: false,
        preview,
        previewInitial: preview.inviter.displayName.trim().slice(0, 1) || '忆',
      });
    } catch (error: unknown) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : '邀请暂时无法读取。',
        isLoading: false,
      });
    }
  },

  async acceptInvite() {
    if (!this.data.preview || this.data.isAccepting || this.data.accepted) return;
    this.setData({ actionMessage: '', isAccepting: true });
    try {
      const friendship = await cloudFriendRepository.acceptInvite(this.data.token);
      this.setData({
        accepted: true,
        actionMessage: `你和 ${friendship.friend.displayName} 已成为 iSdu 好友。`,
        isAccepting: false,
      });
    } catch (error: unknown) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : '接受邀请失败，请稍后重试。',
        isAccepting: false,
      });
    }
  },

  openFriends() {
    void wx.redirectTo({ url: '/pages/friends/index' });
  },
});
