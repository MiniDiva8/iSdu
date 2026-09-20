import {
  USER_PROFILE_NAME_MAX_LENGTH,
  USER_PROFILE_SIGNATURE_MAX_LENGTH,
} from '../../models/user-profile';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { cloudAuthRepository } from '../../services/repository/cloud-auth-repository';
import { userProfileRepository } from '../../services/repository/index';

Page({
  data: {
    profileDraftName: '',
    profileDraftSignature: '',
    profileNameMaxLength: USER_PROFILE_NAME_MAX_LENGTH,
    profileSignatureMaxLength: USER_PROFILE_SIGNATURE_MAX_LENGTH,
    isLoading: true,
    isSaving: false,
    isDirty: false,
    errorMessage: '',
    actionMessage: '',
  },
  onLoad() {
    void this.loadProfile();
  },
  async loadProfile() {
    try {
      const profile = await userProfileRepository.getProfile();
      this.setData({
        profileDraftName: profile?.displayName ?? '',
        profileDraftSignature: profile?.signature ?? '',
        isLoading: false,
      });
    } catch (error: unknown) {
      this.setData({
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : '资料读取失败，可以重新填写。',
      });
    }
  },
  markDirty() {
    if (this.data.isDirty) return;
    this.setData({ isDirty: true });
    wx.enableAlertBeforeUnload({
      message: '个人资料尚未保存，确定离开吗？',
      fail: () => undefined,
    });
  },
  handleProfileNameInput(event: WechatMiniprogram.Input) {
    this.setData({
      profileDraftName: event.detail.value.slice(0, USER_PROFILE_NAME_MAX_LENGTH),
      errorMessage: '',
      actionMessage: '',
    });
    this.markDirty();
  },
  handleProfileSignatureInput(event: WechatMiniprogram.TextareaInput) {
    this.setData({
      profileDraftSignature: event.detail.value.slice(0, USER_PROFILE_SIGNATURE_MAX_LENGTH),
      errorMessage: '',
      actionMessage: '',
    });
    this.markDirty();
  },
  async saveProfile() {
    if (this.data.isLoading || this.data.isSaving) return;
    this.setData({ isSaving: true, errorMessage: '', actionMessage: '' });
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
          actionMessage = '资料已保存在本机，但云端同步失败。可稍后再次点击保存重试。';
        }
      }
      this.setData({
        profileDraftName: profile.displayName,
        profileDraftSignature: profile.signature,
        isSaving: false,
        isDirty: false,
        actionMessage,
      });
      wx.disableAlertBeforeUnload({ fail: () => undefined });
    } catch (error: unknown) {
      this.setData({
        isSaving: false,
        errorMessage: error instanceof Error ? error.message : '保存失败，请重试。',
      });
    }
  },
  cancelEditing() {
    if (this.data.isSaving) return;
    const leave = () => {
      wx.disableAlertBeforeUnload({ fail: () => undefined });
      void wx.navigateBack({
        delta: 1,
        fail: () => {
          void wx.redirectTo({
            url: '/pages/profile/index',
            fail: () => this.setData({ errorMessage: '返回失败，请使用左上角返回。' }),
          });
        },
      });
    };
    if (!this.data.isDirty) {
      leave();
      return;
    }
    wx.showModal({
      title: '放弃本次修改？',
      content: '还未保存的名字和签名将丢失。',
      confirmText: '放弃修改',
      success: (result) => {
        if (result.confirm) leave();
      },
      fail: () => this.setData({ errorMessage: '确认窗口打开失败，请稍后重试。' }),
    });
  },
});
