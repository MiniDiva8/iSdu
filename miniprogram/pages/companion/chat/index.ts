import type { PalAIChatRequest, PalAIStatus, PalAITurn } from '../../../models/pal-ai';
import { palAIRepository } from '../../../services/repository/pal-ai-repository';
import { companionService } from '../../../services/companion-service';
import {
  backFromCompanion,
  companionMessage,
  companionTopInset,
  confirmCompanion,
  openCompanionSection,
} from '../../../services/companion-page';
import {
  palAICloudActive,
  palAIPartner,
  palAIRequestId,
  palAIScope,
  palAIMessage,
  palAIStatusMessage,
  palAIRequestFinished,
} from '../../../services/pal-ai-page';

Page({
  _active: true,
  _version: 0,
  _scope: '',
  _pending: null as { scope: string; payload: PalAIChatRequest } | null,
  data: {
    topInset: 24,
    partnerName: '伙伴',
    avatarSrc: '',
    input: '',
    hasPending: false,
    status: null as PalAIStatus | null,
    messages: [] as (PalAITurn & { key: string })[],
    busy: false,
    isLoading: false,
    cloudActive: false,
    hint: '',
    error: '',
    localMessage: '',
    action: 'none',
  },
  async onShow() {
    this._active = true;
    const scope = palAIScope();
    if (this._scope !== scope) {
      this._pending = null;
      this.setData({ input: '', messages: [], status: null, localMessage: '' });
      this._scope = scope;
    }
    this.setData({ topInset: companionTopInset(), busy: false });
    if (this._pending?.scope !== palAIScope()) this._pending = null;
    this.setData({ hasPending: Boolean(this._pending) });
    await this.reload();
  },
  onHide() {
    this._active = false;
    this._version++;
  },
  onUnload() {
    void this.onHide();
  },
  current(version: number, scope: string): boolean {
    return this._active && this._version === version && palAIScope() === scope;
  },
  back() {
    backFromCompanion();
  },
  openMail() {
    openCompanionSection('mail', { reuse: true });
  },
  openDataManagement() {
    void wx.navigateTo({ url: '/pages/data-management/index' });
  },
  async reload(preserveError = false) {
    const version = ++this._version,
      scope = palAIScope();
    try {
      const partner = palAIPartner(),
        cloudActive = palAICloudActive();
      this.setData({
        partnerName: partner.partnerName,
        avatarSrc: partner.avatarSrc,
        cloudActive,
        isLoading: cloudActive,
      });
      if (!cloudActive) {
        this.setData({
          status: null,
          messages: [],
          isLoading: false,
          hint: '开启云端功能后，可以和伙伴聊几句。普通互动随时可用。',
        });
        return;
      }
      const status = await palAIRepository.status();
      if (!this.current(version, scope)) return;
      this.setData({
        status,
        messages: status.history.map((item, index) => ({ ...item, key: String(index) })),
        isLoading: false,
        hint: palAIStatusMessage(status),
        error: preserveError ? this.data.error : '',
      });
    } catch (error) {
      if (this.current(version, scope))
        this.setData({ isLoading: false, status: null, error: palAIMessage(error) });
    }
  },
  onInput(event: WechatMiniprogram.Input) {
    if (this.data.hasPending) return;
    this.setData({ input: Array.from(event.detail.value).slice(0, 160).join('') });
  },
  chooseOpening(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.busy && !this.data.hasPending)
      this.setData({ input: String(event.currentTarget.dataset.text || '').slice(0, 160) });
  },
  async enableAI() {
    if (this.data.busy || !this.data.cloudActive || !this.data.status?.available) return;
    const version = ++this._version,
      scope = palAIScope();
    this.setData({ busy: true, error: '' });
    try {
      const accepted = await confirmCompanion(
        '开启AI交流？',
        '聊天文字、伙伴名字和最近两轮对话会发送给OpenAI。只有你另行请求并确认写信时，才会发送日记片段；不包含照片或好友日记。可以随时停用并清空。',
        '同意开启',
      );
      if (!this.current(version, scope)) return;
      if (!accepted) {
        this.setData({ busy: false });
        return;
      }
      await palAIRepository.enable();
      if (this.current(version, scope)) {
        this.setData({ busy: false });
        await this.reload();
      }
    } catch (error) {
      if (this.current(version, scope)) this.setData({ busy: false, error: palAIMessage(error) });
    }
  },
  async sendMessage() {
    const status = this.data.status,
      text = this.data.input.trim(),
      scope = palAIScope();
    if (this.data.busy || !text || !status?.enabled || !this.data.cloudActive) return;
    const query = this._pending?.scope === scope && this._pending.payload.text === text;
    if (!query && (!status.available || status.chatsRemaining <= 0)) return;
    const version = ++this._version;
    if (!query) {
      const partner = palAIPartner();
      this._pending = {
        scope,
        payload: {
          requestId: palAIRequestId(),
          partnerId: partner.partnerId,
          partnerName: partner.partnerName,
          text,
        },
      };
    }
    const pending = this._pending;
    if (!pending) return;
    this.setData({ busy: true, hasPending: true, error: '' });
    try {
      const result = query
        ? await palAIRepository.result(pending.payload.requestId, 'chat')
        : await palAIRepository.chat(pending.payload);
      if (!this.current(version, scope)) return;
      if (result.state === 'completed') {
        this._pending = null;
        this.setData({ busy: false, hasPending: false, input: '', action: result.reply.action });
        await this.reload();
      } else {
        if (result.state === 'failed') this._pending = null;
        this.setData({
          busy: false,
          hasPending: Boolean(this._pending),
          error:
            result.state === 'pending'
              ? '这句话还在送达，可以稍后查看原来的结果。'
              : '上次交流已结束，没有取得可用结果。可以换一句话，或重新点发送。',
        });
        await this.reload(true);
      }
    } catch (error) {
      if (this.current(version, scope)) {
        if (palAIRequestFinished(error)) this._pending = null;
        this.setData({
          busy: false,
          hasPending: Boolean(this._pending),
          error: palAIMessage(error),
        });
        await this.reload(true);
      }
    }
  },
  dismissPending() {
    if (this.data.busy) return;
    this._pending = null;
    this.setData({
      hasPending: false,
      input: '',
      error: '先收起这句话，已保存的交流仍可在这里查看。',
    });
  },
  async disableAI() {
    if (this.data.busy) return;
    const version = ++this._version,
      scope = palAIScope();
    this.setData({ busy: true });
    try {
      const accepted = await confirmCompanion(
        '停用并清空AI记录？',
        '将删除AI聊天和AI来信，普通日记、小屋和模板来信都会保留。已经发送的请求可能仍会消耗本次额度，但结果不会重新保存。',
        '停用并清空',
      );
      if (!this.current(version, scope)) return;
      if (!accepted) {
        this.setData({ busy: false });
        return;
      }
      await palAIRepository.clear();
      if (this.current(version, scope)) {
        this._pending = null;
        this.setData({ busy: false, hasPending: false, input: '', messages: [], error: '' });
        await this.reload();
      }
    } catch (error) {
      if (this.current(version, scope)) this.setData({ busy: false, error: palAIMessage(error) });
    }
  },
  async greet() {
    const version = this._version,
      scope = palAIScope();
    try {
      const result = await companionService.dispatch({ type: 'interact' });
      if (this.current(version, scope))
        this.setData({
          localMessage: result.message,
          action: this.data.action === 'happy' ? 'none' : 'happy',
        });
    } catch (error) {
      if (this.current(version, scope)) this.setData({ localMessage: companionMessage(error) });
    }
  },
});
