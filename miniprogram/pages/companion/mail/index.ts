import type {
  PalAILetterRequest,
  PalAIReply,
  PalAIStatus,
  PalAIGeneration,
} from '../../../models/pal-ai';
import { palAIRepository } from '../../../services/repository/pal-ai-repository';
import { memoryRepository } from '../../../services/repository/index';
import {
  palAICloudActive,
  palAIPartner,
  palAIRequestId,
  palAIScope,
  palAIMessage,
  palAIStatusMessage,
  palAIRequestFinished,
} from '../../../services/pal-ai-page';
import { openCompanionSection } from '../../../services/companion-page';
import type { CompanionState, CompanionLetter } from '../../../models/companion';
import type { GuestVisit } from '../../../models/companion-cloud';
import { companionService } from '../../../services/companion-service';
import { cloudCompanionRepository } from '../../../services/repository/cloud-companion-repository';
import { buildCompanionLetters } from '../../../utils/companion-engine';
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
  confirmCompanion,
} from '../../../services/companion-page';
Page({
  _active: true,
  _version: 0,
  _aiVersion: 0,
  _aiPending: null as { scope: string; payload: PalAILetterRequest } | null,
  data: {
    topInset: 24,
    state: null as CompanionState | null,
    letters: [] as CompanionLetter[],
    guests: [] as GuestVisit[],
    visitorCount: 0,
    activeLetter: null as CompanionLetter | null,
    tab: 'letters',
    isLoading: true,
    busy: false,
    actionMessage: '',
    cloudError: '',
    aiMessage: '',
    aiHint: '',
    activeAIName: '',
    aiBusy: false,
    aiHasPending: false,
    aiLoading: false,
    aiStatus: null as PalAIStatus | null,
    aiLetters: [] as PalAIReply[],
  },
  async onShow() {
    this._active = true;
    resumeCompanionActions(this);
    this.setData({
      topInset: companionTopInset(),
      aiBusy: false,
      aiLetters: [],
      activeLetter: null,
      activeAIName: '',
    });
    void this.reloadAI();
    await this.reload();
  },
  onHide() {
    this._active = false;
    suspendCompanionActions(this);
    this._version++;
    this._aiVersion++;
  },
  onUnload() {
    void this.onHide();
  },
  back() {
    backFromCompanion();
  },
  async reload() {
    const version = ++this._version;
    try {
      const state = companionService.read(),
        facts = await companionService.facts();
      if (!this._active || version !== this._version) return;
      this.setData({
        state,
        letters: buildCompanionLetters(state, facts, new Date().toISOString()),
        isLoading: false,
      });
      if (companionService.cloudWasUsed())
        try {
          const r = await cloudCompanionRepository.listVisits();
          if (this._active && version === this._version)
            this.setData({ guests: r.visits, visitorCount: r.visitorCount, cloudError: '' });
        } catch (error) {
          if (this._active && version === this._version)
            this.setData({ cloudError: companionMessage(error) });
        }
    } catch (error) {
      if (this._active && version === this._version)
        this.setData({ isLoading: false, actionMessage: companionMessage(error) });
    }
  },
  changeTab(event: WechatMiniprogram.BaseEvent) {
    resumeCompanionActions(this);
    this.setData({
      tab: event.currentTarget.dataset.tab === 'guests' ? 'guests' : 'letters',
      activeLetter: null,
    });
  },
  async openLetter(event: WechatMiniprogram.BaseEvent) {
    const id = String(event.currentTarget.dataset.id ?? '');
    if (this.data.busy) return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this.setData({ busy: true });
    try {
      await commandCompanion({ type: 'readLetter', letterId: id });
      if (companionActionCurrent(this, lease)) {
        await this.reload();
        if (!companionActionCurrent(this, lease)) return;
        this.setData({
          activeLetter: this.data.letters.find((l) => l.id === id) ?? null,
          activeAIName: '',
          actionMessage: '',
        });
      }
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.reload();
    }
  },
  noop() {},
  closeLetter() {
    resumeCompanionActions(this);
    this.setData({ activeLetter: null, activeAIName: '' });
  },
  async deleteGuest(event: WechatMiniprogram.BaseEvent) {
    if (
      this.data.busy ||
      !(await confirmCompanion(
        '删除这条来访留言？',
        '删除后无法恢复；当日来访计数仍会保留。',
        '删除',
      ))
    )
      return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this.setData({ busy: true });
    try {
      await cloudCompanionRepository.deleteVisit(String(event.currentTarget.dataset.id ?? ''));
      if (companionActionCurrent(this, lease)) await this.reload();
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.reload();
    }
  },
  aiCurrent(version: number, scope: string): boolean {
    return this._active && this._aiVersion === version && palAIScope() === scope;
  },
  openChat() {
    openCompanionSection('chat', { reuse: true });
  },
  async reloadAI(preserveMessage = false) {
    const version = ++this._aiVersion,
      scope = palAIScope();
    if (!palAICloudActive()) {
      this.setData({
        aiLoading: false,
        aiStatus: null,
        aiLetters: [],
        aiHint: '开启云端功能后，可以让伙伴读日记写信。',
      });
      return;
    }
    this.setData({ aiLoading: true });
    try {
      const aiStatus = await palAIRepository.status();
      if (this.aiCurrent(version, scope))
        this.setData({
          aiStatus,
          aiLetters: [...aiStatus.letters],
          aiLoading: false,
          aiHint: palAIStatusMessage(aiStatus),
          aiMessage: preserveMessage ? this.data.aiMessage : '',
        });
    } catch (error) {
      if (this.aiCurrent(version, scope))
        this.setData({
          aiStatus: null,
          aiLetters: [],
          aiLoading: false,
          aiHint: '模板来信与普通互动照常。',
          aiMessage: palAIMessage(error),
        });
    }
  },
  acceptAILetterResult(result: PalAIGeneration) {
    if (result.state !== 'pending') this._aiPending = null;
    this.setData({
      aiBusy: false,
      aiHasPending: Boolean(this._aiPending),
      aiMessage:
        result.state === 'completed'
          ? '一封AI来信已送到下面，点开看看吧。'
          : result.state === 'pending'
            ? '这封信还在送达，可以稍后查看原来的结果。'
            : '上次写信已结束，没有取得可用结果。可以再次确认，重新请求。',
    });
  },
  async queryAILetter() {
    const pending = this._aiPending;
    if (!pending || this.data.aiBusy) return;
    const version = ++this._aiVersion,
      scope = palAIScope();
    if (pending.scope !== scope) {
      this._aiPending = null;
      this.setData({ aiHasPending: false });
      return;
    }
    this.setData({ aiBusy: true, aiMessage: '' });
    try {
      const result = await palAIRepository.result(
        pending.payload.requestId,
        'letter',
        pending.payload.memoryId,
      );
      if (!this.aiCurrent(version, scope)) return;
      this.acceptAILetterResult(result);
      await this.reloadAI(true);
    } catch (error) {
      if (this.aiCurrent(version, scope)) {
        if (palAIRequestFinished(error)) this._aiPending = null;
        this.setData({
          aiBusy: false,
          aiHasPending: Boolean(this._aiPending),
          aiMessage: palAIMessage(error),
        });
        await this.reloadAI(true);
      }
    }
  },
  async requestAILetter() {
    if (this.data.aiBusy) return;
    if (this._aiPending) {
      await this.queryAILetter();
      return;
    }
    const status = this.data.aiStatus;
    if (!status?.enabled) {
      this.openChat();
      return;
    }
    if (!status.available || status.lettersRemaining <= 0) {
      this.setData({
        aiMessage: status.paused
          ? '本月AI额度已用完，普通互动照常。'
          : '本周的AI来信次数用完了，下周再来吧。',
      });
      return;
    }
    const version = ++this._aiVersion,
      scope = palAIScope();
    this.setData({ aiBusy: true, aiMessage: '' });
    try {
      const memories = await memoryRepository.listMemories(true);
      if (!this.aiCurrent(version, scope)) return;
      const latest = memories
        .filter((memory) => memory.origin !== 'demo' && memory.text.trim())
        .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
      if (!latest) {
        this.setData({ aiBusy: false, aiMessage: '先写下一篇有文字的日记，伙伴就能回信啦。' });
        return;
      }
      const confirmedExcerpt = Array.from(latest.text).slice(0, 600).join('');
      const confirmedMood = Array.from(latest.customMood || latest.mood)
        .slice(0, 20)
        .join('');
      const preview = Array.from(confirmedExcerpt).slice(0, 120).join('');
      const accepted = await confirmCompanion(
        '让伙伴读这篇日记，写封短信？',
        '日记片段：' +
          preview +
          (Array.from(confirmedExcerpt).length > 120 ? '…' : '') +
          '\n\n本次会把这篇日记的前600字和心情发送给OpenAI，不包含照片或好友日记。',
        '同意写信',
      );
      if (!this.aiCurrent(version, scope)) return;
      if (!accepted) {
        this.setData({ aiBusy: false });
        return;
      }
      const partner = palAIPartner();
      this._aiPending = {
        scope,
        payload: {
          requestId: palAIRequestId(),
          partnerId: partner.partnerId,
          partnerName: partner.partnerName,
          memoryId: latest.id,
          diaryConsent: true,
          confirmedExcerpt,
          confirmedMood,
        },
      };
      this.setData({ aiHasPending: true });
      const result = await palAIRepository.letter(this._aiPending.payload);
      if (!this.aiCurrent(version, scope)) return;
      this.acceptAILetterResult(result);
      await this.reloadAI(true);
    } catch (error) {
      if (this.aiCurrent(version, scope)) {
        if (palAIRequestFinished(error)) this._aiPending = null;
        this.setData({
          aiBusy: false,
          aiHasPending: Boolean(this._aiPending),
          aiMessage: palAIMessage(error),
        });
        await this.reloadAI(true);
      }
    }
  },
  async openAILetter(event: WechatMiniprogram.BaseEvent) {
    if (this.data.aiBusy) return;
    const id = String(event.currentTarget.dataset.id || ''),
      letter = this.data.aiLetters.find((item) => item.id === id);
    if (!letter) return;
    const version = ++this._aiVersion,
      scope = palAIScope();
    this.setData({ aiBusy: true, aiMessage: '' });
    try {
      await palAIRepository.readLetter(id);
      if (!this.aiCurrent(version, scope)) return;
      this.setData({
        aiBusy: false,
        activeAIName: letter.partnerName,
        activeLetter: { id, title: letter.title, body: letter.text, date: letter.date, read: true },
        aiLetters: this.data.aiLetters.map((item) =>
          item.id === id ? { ...item, read: true } : item,
        ),
      });
    } catch (error) {
      if (this.aiCurrent(version, scope))
        this.setData({ aiBusy: false, aiMessage: palAIMessage(error) });
    }
  },
  async deleteAILetter(event: WechatMiniprogram.BaseEvent) {
    if (this.data.aiBusy) return;
    const id = String(event.currentTarget.dataset.id || '');
    if (!this.data.aiLetters.some((item) => item.id === id)) return;
    const version = ++this._aiVersion,
      scope = palAIScope();
    this.setData({ aiBusy: true });
    try {
      const accepted = await confirmCompanion(
        '删除这封AI来信？',
        '删除后无法恢复，不会影响原日记。',
        '删除',
      );
      if (!this.aiCurrent(version, scope)) return;
      if (!accepted) {
        this.setData({ aiBusy: false });
        return;
      }
      await palAIRepository.deleteLetter(id);
      if (this.aiCurrent(version, scope)) {
        this.setData({ aiBusy: false, activeLetter: null, activeAIName: '' });
        await this.reloadAI();
      }
    } catch (error) {
      if (this.aiCurrent(version, scope))
        this.setData({ aiBusy: false, aiMessage: palAIMessage(error) });
    }
  },
});
