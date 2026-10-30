import type { CompanionState } from '../../../models/companion';
import type { PublishedHome } from '../../../models/companion-cloud';
import { COMPANION_THEMES, COMPANION_MBTI, COMPANION_SKINS } from '../../../data/companion-catalog';
import { companionAssetPreview } from '../../../data/companion-assets';
import { companionService } from '../../../services/companion-service';
import { cloudAuthRepository } from '../../../services/repository/cloud-auth-repository';
import { cloudModeService } from '../../../services/cloud/cloud-mode-service';
import { cloudCompanionRepository } from '../../../services/repository/cloud-companion-repository';
import { companionDayKey } from '../../../utils/companion-engine';
import {
  beginCompanionAction,
  companionActionCurrent,
  endCompanionAction,
  resumeCompanionActions,
  suspendCompanionActions,
  companionTopInset,
  backFromCompanion,
  commandCompanion,
  companionMessage,
  publicCompanionSnapshot,
  confirmCompanion,
} from '../../../services/companion-page';
function confirmedCloudState(home: PublishedHome | null, userId: string) {
  const open = home?.visibility === 'friends';
  return {
    userId,
    visibility: home?.visibility ?? 'private',
    cloudKnown: true,
    cloudPhase: open ? 'open' : 'closed',
    cloudStatus: open ? '已开放 · 仅已确认的好友可来访' : '已关闭好友来访 · 仅自己可见',
    cloudError: '',
  };
}
interface CompanionCardCloudMethods {
  checkCloudStatus(version: number): Promise<void>;
}
function cloudStatusPage(page: object): CompanionCardCloudMethods {
  return page as CompanionCardCloudMethods;
}
Page({
  _active: true,
  _version: 0,
  _cloudAttempted: false,
  data: {
    topInset: 24,
    state: null as CompanionState | null,
    nameInput: '',
    themeInput: 'meadow',
    mbtiInput: '',
    mbtiIndex: 0,
    mbtiLabels: COMPANION_MBTI.map((x) => x || '未设置（伙伴的小设定）'),
    themes: COMPANION_THEMES,
    showOnJournal: true,
    haptics: false,
    days: 0,
    birthday: '',
    petSrc: '',
    characterRole: '',
    characterPersonality: '',
    characterLine: '',
    petCropped: false,
    petPreviewStyle: '',
    busy: false,
    actionMessage: '',
    cloudStatus: '尚未设置好友来访',
    cloudPhase: 'idle',
    cloudError: '',
    cloudKnown: false,
    userId: '',
    visibility: 'private',
    cloudWasUsed: false,
  },
  async onShow() {
    this._active = true;
    resumeCompanionActions(this);
    const version = ++this._version;
    try {
      const state = companionService.read(),
        preview = companionAssetPreview('skin', state.skinId);
      this.setData({
        topInset: companionTopInset(),
        state,
        nameInput: state.name,
        themeInput: state.theme,
        mbtiInput: state.mbti,
        mbtiIndex: Math.max(0, COMPANION_MBTI.indexOf(state.mbti)),
        showOnJournal: state.showOnJournal,
        haptics: state.haptics,
        petSrc: preview.src,
        characterRole: COMPANION_SKINS.find((i) => i.id === state.skinId)?.role ?? '',
        characterPersonality: COMPANION_SKINS.find((i) => i.id === state.skinId)?.personality ?? '',
        characterLine: COMPANION_SKINS.find((i) => i.id === state.skinId)?.line ?? '',
        petCropped: preview.cropped,
        petPreviewStyle: preview.style,
        birthday: state.adoptedAt ? companionDayKey(state.adoptedAt) : '等待初次见面',
        days: state.adoptedAt
          ? Math.max(
              1,
              Math.floor(
                (Date.parse(companionDayKey(new Date().toISOString())) -
                  Date.parse(companionDayKey(state.adoptedAt))) /
                  86400000,
              ) + 1,
            )
          : 0,
        cloudWasUsed: companionService.cloudWasUsed(),
      });
      if (
        !this.data.busy &&
        (companionService.cloudWasUsed() ||
          this._cloudAttempted ||
          state.cloudVisibility === 'friends')
      )
        await cloudStatusPage(this).checkCloudStatus(version);
    } catch (error) {
      if (this._active) this.setData({ actionMessage: companionMessage(error) });
    }
  },
  onHide() {
    this._active = false;
    suspendCompanionActions(this);
    this._version++;
  },
  onUnload() {
    void this.onHide();
  },
  async checkCloudStatus(version: number) {
    this.setData({
      cloudPhase: 'checking',
      cloudStatus: '正在核对开放状态…',
      cloudKnown: false,
      cloudError: '',
    });
    try {
      const mine = await cloudCompanionRepository.getMine();
      if (this._active && version === this._version)
        this.setData(confirmedCloudState(mine.home, mine.userId));
    } catch (error) {
      if (this._active && version === this._version)
        this.setData({
          cloudPhase: 'unknown',
          cloudStatus: '未能确认开放状态',
          cloudKnown: false,
          cloudError: companionMessage(error),
        });
    }
  },
  async refreshCloudStatus() {
    if (this.data.busy || !this._active) return;
    this._cloudAttempted = true;
    await cloudStatusPage(this).checkCloudStatus(++this._version);
  },
  back() {
    backFromCompanion();
  },
  nameChanged(event: WechatMiniprogram.Input) {
    this.setData({ nameInput: event.detail.value });
  },
  themeChanged(event: WechatMiniprogram.BaseEvent) {
    this.setData({ themeInput: String(event.currentTarget.dataset.id ?? 'meadow') });
  },
  mbtiChanged(event: WechatMiniprogram.PickerChange) {
    const i = Number(event.detail.value);
    this.setData({ mbtiInput: COMPANION_MBTI[i] ?? '', mbtiIndex: i });
  },
  widgetChanged(event: WechatMiniprogram.SwitchChange) {
    this.setData({ showOnJournal: event.detail.value });
  },
  hapticsChanged(event: WechatMiniprogram.SwitchChange) {
    this.setData({ haptics: event.detail.value });
  },
  async savePreferences() {
    if (this.data.busy) return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this.setData({ busy: true, actionMessage: '' });
    try {
      const r = await commandCompanion({
        type: 'preferences',
        name: this.data.nameInput.trim(),
        theme: this.data.themeInput,
        mbti: this.data.mbtiInput,
        showOnJournal: this.data.showOnJournal,
        haptics: this.data.haptics,
      });
      if (companionActionCurrent(this, lease))
        this.setData({ state: r.state, actionMessage: '伙伴资料与本机偏好已保存。' });
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },
  async publishHome() {
    if (this.data.busy || !this.data.state?.adoptedAt) return;
    const closing = this.data.cloudKnown && this.data.visibility === 'friends';
    if (
      !closing &&
      !(await confirmCompanion(
        '让已确认的好友来做客？',
        '只上传伙伴名字、外观和家具布置。日记、照片、奖励余额和伙伴设定不会随小屋展示。你可以随时关闭。',
        '开放小屋',
      ))
    )
      return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this._version++;
    this._cloudAttempted = true;
    this.setData({
      busy: true,
      actionMessage: '',
      cloudError: '',
      cloudPhase: closing ? 'closing' : 'opening',
      cloudStatus: closing ? '正在关闭好友来访…' : '正在开放小屋…',
    });
    let serverSaved = false;
    try {
      if (!closing) {
        cloudModeService.acceptPrivacy();
        await cloudAuthRepository.bootstrap();
      }
      const mine = await cloudCompanionRepository.getMine();
      const state = companionService.read();
      if (
        !closing &&
        mine.home &&
        mine.home.revision !== state.cloudRevision &&
        !(await confirmCompanion(
          '云端有不同的小屋布置',
          '云端有 ' +
            mine.home.snapshot.placements.length +
            ' 件家具，本机有 ' +
            state.placements.length +
            ' 件。确认用本机布置更新云端展示？',
          '使用本机',
        ))
      ) {
        if (companionActionCurrent(this, lease))
          this.setData(confirmedCloudState(mine.home, mine.userId));
        return;
      }
      companionService.markCloudUsed();
      if (companionActionCurrent(this, lease)) this.setData({ cloudWasUsed: true });
      const snapshot = closing && mine.home ? mine.home.snapshot : publicCompanionSnapshot(state);
      const home = await cloudCompanionRepository.publishHome(
        snapshot,
        closing ? 'private' : 'friends',
        mine.home?.revision ?? 0,
      );
      serverSaved = true;
      if (companionActionCurrent(this, lease))
        this.setData({ ...confirmedCloudState(home, mine.userId), cloudWasUsed: true });
      const r = await commandCompanion({
        type: 'publication',
        revision: home.revision,
        visibility: home.visibility,
      });
      if (companionActionCurrent(this, lease))
        this.setData({
          state: r.state,
          actionMessage: closing ? '已关闭好友来访。' : '小屋已开放，仅现有双方好友可见。',
        });
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({
          ...(serverSaved
            ? {}
            : { cloudKnown: false, cloudPhase: 'unknown', cloudStatus: '未能确认开放状态' }),
          cloudError:
            (serverSaved
              ? '云端设置已更新，但本机标记保存失败。可重新核对开放状态。'
              : closing
                ? '尚未确认关闭成功，可重新核对开放状态。'
                : '尚未确认开放成功，可重新核对开放状态。') + companionMessage(error),
        });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },
  async syncHome() {
    if (this.data.busy || !this.data.cloudKnown || this.data.visibility !== 'friends') return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this._version++;
    this.setData({ busy: true, actionMessage: '' });
    try {
      const state = companionService.read(),
        mine = await cloudCompanionRepository.getMine();
      if (
        mine.home &&
        mine.home.revision !== state.cloudRevision &&
        !(await confirmCompanion(
          '云端布置已经更新',
          '确认用当前本机布置更新好友看到的小屋？',
          '同步本机',
        ))
      )
        return;
      companionService.markCloudUsed();
      const home = await cloudCompanionRepository.publishHome(
        publicCompanionSnapshot(state),
        'friends',
        mine.home?.revision ?? 0,
      );
      const r = await commandCompanion({
        type: 'publication',
        revision: home.revision,
        visibility: home.visibility,
      });
      if (companionActionCurrent(this, lease))
        this.setData({ state: r.state, actionMessage: '好友看到的布置已更新。' });
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },
  async deletePublishedHome() {
    if (
      this.data.busy ||
      !(await confirmCompanion(
        '删除云端小屋与来访记录？',
        '会删除已发布的小屋、收到及写出的来访记录；本机养成存档与日记仍保留。',
        '删除云端小屋',
      ))
    )
      return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this._version++;
    this.setData({ busy: true });
    try {
      await cloudCompanionRepository.deleteMyData();
      companionService.clearCloudMarker();
      if (companionService.read().adoptedAt)
        await commandCompanion({ type: 'publication', revision: 0, visibility: 'private' });
      if (companionActionCurrent(this, lease))
        this.setData({
          cloudKnown: true,
          cloudWasUsed: false,
          visibility: 'private',
          cloudPhase: 'closed',
          cloudError: '',
          cloudStatus: '云端小屋已删除',
          actionMessage: '云端小屋与来访记录已清理。',
        });
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },
  onShareAppMessage() {
    return {
      title: '来看看我的校园伙伴小屋',
      path:
        this.data.cloudKnown && this.data.visibility === 'friends' && this.data.userId
          ? '/pages/companion/index?targetUserId=' + encodeURIComponent(this.data.userId)
          : '/pages/journal/index',
    };
  },
});
