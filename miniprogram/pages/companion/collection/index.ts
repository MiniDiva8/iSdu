import { COMPANION_SKINS } from '../../../data/companion-catalog';
import { companionPoseAsset } from '../../../data/companion-assets';
import { COMPANION_SCENE_IDEAS } from '../../../data/companion-inspiration';
import type { CompanionState } from '../../../models/companion';
import { companionService } from '../../../services/companion-service';
import {
  companionCards,
  beginCompanionAction,
  companionActionCurrent,
  endCompanionAction,
  resumeCompanionActions,
  suspendCompanionActions,
  companionTopInset,
  backFromCompanion,
  commandCompanion,
  companionMessage,
  companionRequestId,
} from '../../../services/companion-page';
Page({
  _active: true,
  data: {
    topInset: 24,
    state: null as CompanionState | null,
    tab: 'skins',
    mode: 'inventory',
    items: [] as ReturnType<typeof companionCards>,
    busy: false,
    actionMessage: '',
    isLoading: true,
    sceneIdeas: COMPANION_SCENE_IDEAS,
    heroSrc: companionPoseAsset('sprout', 'gift').src,
    rewardName: '',
    rewardSrc: '',
  },
  onLoad(query: Record<string, string | undefined>) {
    if (['skins', 'accessories', 'furniture'].includes(query.tab ?? ''))
      this.setData({ tab: query.tab ?? 'skins' });
    if (query.mode === 'shop') this.setData({ mode: 'shop' });
  },
  onShow(): void {
    this._active = true;
    resumeCompanionActions(this);
    this.setData({ topInset: companionTopInset() });
    this.reload();
  },
  onHide() {
    this._active = false;
    suspendCompanionActions(this);
  },
  onUnload() {
    void this.onHide();
  },
  back() {
    backFromCompanion();
  },
  reload(): void {
    try {
      const state = companionService.read();
      if (this._active)
        this.setData({
          state,
          heroSrc: companionPoseAsset(state.skinId, 'idle').src,
          items: companionCards(state, this.data.tab, this.data.mode === 'shop'),
          isLoading: false,
        });
    } catch (error) {
      if (this._active) this.setData({ actionMessage: companionMessage(error), isLoading: false });
    }
  },
  changeTab(event: WechatMiniprogram.BaseEvent) {
    const tab = String(event.currentTarget.dataset.tab ?? '');
    if (!['skins', 'accessories', 'furniture'].includes(tab)) return;
    this.setData({ tab, actionMessage: '' });
    this.reload();
  },
  changeMode(event: WechatMiniprogram.BaseEvent) {
    this.setData({
      mode: event.currentTarget.dataset.mode === 'shop' ? 'shop' : 'inventory',
      actionMessage: '',
    });
    this.reload();
  },
  async perform(type: string, extra: Record<string, unknown> = {}) {
    if (this.data.busy) return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this.setData({ busy: true, actionMessage: '' });
    try {
      const result = await commandCompanion({ type, ...extra });
      if (companionActionCurrent(this, lease)) {
        this.setData({ state: result.state, actionMessage: result.message });
        if (type === 'draw' && result.reward) {
          const item = COMPANION_SKINS.find((i) => i.id === result.reward?.itemId);
          this.setData({
            rewardName: item?.name ?? '新伙伴',
            rewardSrc: companionPoseAsset(result.reward.itemId, 'idle').src,
          });
        }
        this.reload();
      }
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) this.reload();
    }
  },
  closeReward() {
    this.setData({ rewardName: '', rewardSrc: '' });
  },
  async drawSkin() {
    await this.perform('draw');
  },
  async actOnItem(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id ?? ''),
      item = this.data.items.find((i) => i.id === id);
    if (!item) return;
    if (this.data.tab === 'skins') {
      await this.perform('equipSkin', { itemId: id });
      return;
    }
    if (this.data.tab === 'accessories') {
      await this.perform(item.owned ? 'equipAccessory' : 'redeemAccessory', { itemId: id });
      return;
    }
    if (this.data.mode === 'shop') {
      await this.perform('buy', { itemId: id });
      return;
    }
    const n = this.data.state?.placements.length ?? 0;
    await this.perform('place', {
      placement: {
        id: companionRequestId(),
        itemId: id,
        x: 0.5 + ((n % 3) - 1) * 0.1,
        y: 0.6 + (Math.floor(n / 3) % 3) * 0.05,
        rotation: 0,
      },
    });
  },
});
