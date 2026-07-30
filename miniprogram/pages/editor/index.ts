Page({
  data: {
    interactionMessage: '本阶段不选择图片，也不保存日记。',
  },

  handleLocalInteraction() {
    this.setData({
      interactionMessage: '记录页本地交互正常；没有创建或保存任何数据。',
    });
  },
});
