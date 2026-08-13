import { consumeMapPickIntent, setMapPickIntent } from '../../services/map-pick-intent';

Page({
  data: {
    interactionMessage: '先在地图上找到想记录的地方，再写下属于你的校园回忆。',
    isNavigating: false,
  },

  onShow() {
    this.setData({ isNavigating: false });
  },

  beginMapPick() {
    if (this.data.isNavigating) {
      return;
    }

    this.setData({ isNavigating: true });
    setMapPickIntent({
      requestedAt: Date.now(),
      source: 'record-tab',
    });

    void wx.switchTab({
      url: '/pages/map/index',
      success: () => {
        this.setData({ isNavigating: false });
      },
      fail: () => {
        consumeMapPickIntent();
        this.setData({
          interactionMessage: '地图暂时无法打开，请稍后再试。',
          isNavigating: false,
        });
      },
    });
  },
});
