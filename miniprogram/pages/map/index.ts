import { runtimeConfig } from '../../config/runtime';
import { repository } from '../../services/repository';

Page({
  data: {
    interactionCount: 0,
    interactionMessage: '尚未触发本地交互',
    repositoryMode: runtimeConfig.mode,
    repositoryStatus: '正在检查本地占位仓库…',
  },

  onLoad() {
    void repository.getStatus().then(
      (status) => {
        this.setData({
          repositoryStatus: status.message,
        });
      },
      () => {
        this.setData({
          repositoryStatus: '本地占位仓库检查失败，请重新编译',
        });
      },
    );
  },

  handleLocalInteraction() {
    const interactionCount = this.data.interactionCount + 1;

    this.setData({
      interactionCount,
      interactionMessage: `TypeScript 与 setData 工作正常（${interactionCount}）`,
    });
  },

  goToDetail() {
    void wx.navigateTo({
      url: '/pages/detail/index',
      fail: () => {
        this.setData({
          interactionMessage: '详情占位页打开失败，请检查页面配置',
        });
      },
    });
  },

  goToProfile() {
    void wx.navigateTo({
      url: '/pages/profile/index',
      fail: () => {
        this.setData({
          interactionMessage: '个人占位页打开失败，请检查页面配置',
        });
      },
    });
  },
});
