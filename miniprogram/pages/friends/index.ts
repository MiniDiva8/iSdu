import type { FriendInvite, FriendListItem } from '../../models/cloud-friend';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { cloudAuthRepository } from '../../services/repository/cloud-auth-repository';
import { cloudFriendRepository } from '../../services/repository/cloud-friend-repository';

type FriendListViewItem = FriendListItem & { initial: string };

function toViewItem(item: FriendListItem): FriendListViewItem {
  return {
    ...item,
    initial: item.friend.displayName.trim().slice(0, 1) || '忆',
  };
}

function confirmRemove(name: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: `删除好友 ${name}？`,
      content: '删除后双方立即不能继续查看好友可见回忆；重新添加也不会恢复过去的部分好友授权。',
      confirmText: '删除好友',
      confirmColor: '#c65a55',
      cancelText: '取消',
      success: (result) => resolve(result.confirm),
      fail: (result) => reject(new Error(result.errMsg)),
    });
  });
}

Page({
  data: {
    actionMessage: '',
    friends: [] as FriendListViewItem[],
    invite: null as FriendInvite | null,
    isCreatingInvite: false,
    isLoading: true,
    removingUserId: '',
  },

  onShow() {
    // 微信 Page 的运行时方法会被框架注入，类型声明未保留自定义方法签名。
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    void this.loadFriends();
  },

  async loadFriends() {
    this.setData({ actionMessage: '', isLoading: true });
    try {
      await cloudAuthRepository.bootstrap();
      const friends = await cloudFriendRepository.listFriends();
      this.setData({ friends: friends.map(toViewItem), isLoading: false });
    } catch (error: unknown) {
      this.setData({
        actionMessage:
          error instanceof Error
            ? error.message
            : '好友列表暂时无法读取，请先在数据管理中开启云端功能。',
        isLoading: false,
      });
    }
  },

  async createInvite() {
    if (this.data.isCreatingInvite) return;
    this.setData({ actionMessage: '', isCreatingInvite: true });
    try {
      cloudModeService.acceptPrivacy();
      await cloudAuthRepository.bootstrap();
      const invite = await cloudFriendRepository.createInvite();
      this.setData({
        actionMessage: '邀请已生成，24 小时内可发送一次给微信好友。',
        invite,
        isCreatingInvite: false,
      });
    } catch (error: unknown) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : '邀请创建失败，请稍后重试。',
        isCreatingInvite: false,
      });
    }
  },

  onShareAppMessage() {
    const invite = this.data.invite;
    return invite
      ? {
          title: '邀请你成为我的 iSdu 校园记忆好友',
          path: invite.sharePath,
        }
      : {
          title: 'iSdu · 校园记忆地图',
          path: '/pages/map/index',
        };
  },

  async removeFriend(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { name?: unknown; userId?: unknown };
    const userId = typeof dataset.userId === 'string' ? dataset.userId : '';
    const name = typeof dataset.name === 'string' ? dataset.name : '这位好友';
    if (!userId || this.data.removingUserId) return;
    try {
      if (!(await confirmRemove(name))) return;
      this.setData({ removingUserId: userId });
      await cloudFriendRepository.removeFriend(userId);
      this.setData({
        actionMessage: '好友已删除，相关共享访问已撤销。',
        friends: this.data.friends.filter((item) => item.friend.userId !== userId),
        removingUserId: '',
      });
    } catch (error: unknown) {
      this.setData({
        actionMessage: error instanceof Error ? error.message : '删除好友失败，请稍后重试。',
        removingUserId: '',
      });
    }
  },
});
