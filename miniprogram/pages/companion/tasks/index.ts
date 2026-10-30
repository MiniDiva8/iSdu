import type { CompanionState, CompanionTask } from '../../../models/companion';
import { companionService } from '../../../services/companion-service';
import {
  companionWeek,
  buildCompanionTasks,
  companionDayKey,
  companionMakeupDays,
} from '../../../utils/companion-engine';
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
  openCompanionSection,
  confirmCompanion,
} from '../../../services/companion-page';
Page({
  _active: true,
  _version: 0,
  data: {
    topInset: 24,
    state: null as CompanionState | null,
    tasks: [] as CompanionTask[],
    week: [] as ReturnType<typeof companionWeek>,
    makeupDays: [] as ReturnType<typeof companionMakeupDays>,
    showMakeup: false,
    isLoading: true,
    busy: false,
    actionMessage: '',
    checkedToday: false,
    completed: 0,
    claimableCount: 0,
    claimableReward: 0,
  },
  async onShow() {
    this._active = true;
    resumeCompanionActions(this);
    this.setData({ topInset: companionTopInset() });
    await this.reload();
  },
  onHide() {
    this._active = false;
    suspendCompanionActions(this);
    this._version++;
  },
  onUnload() {
    void this.onHide();
  },
  back() {
    backFromCompanion();
  },
  openPlayground() {
    openCompanionSection('playground');
  },
  async reload() {
    const version = ++this._version;
    try {
      const state = companionService.read(),
        facts = await companionService.facts();
      if (!this._active || version !== this._version) return;
      const now = new Date().toISOString(),
        tasks = buildCompanionTasks(state, facts, now);
      this.setData({
        state,
        tasks,
        week: companionWeek(state, now),
        makeupDays: companionMakeupDays(state, now),
        checkedToday: state.checkins.includes(companionDayKey(now)),
        completed: tasks.filter((t) => t.claimed).length,
        claimableCount: tasks.filter((t) => t.eligible && !t.claimed).length,
        claimableReward: tasks
          .filter((t) => t.eligible && !t.claimed)
          .reduce((sum, t) => sum + t.reward, 0),
        isLoading: false,
      });
    } catch (error) {
      if (this._active && version === this._version)
        this.setData({ isLoading: false, actionMessage: companionMessage(error) });
    }
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
        await this.reload();
      }
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.reload();
    }
  },
  async checkin() {
    await this.perform('checkin');
  },
  async claimAllTasks() {
    if (this.data.isLoading || this.data.claimableCount === 0) return;
    await this.perform('claimAll');
  },
  async claimTask(event: WechatMiniprogram.BaseEvent) {
    await this.perform('claim', { taskId: event.currentTarget.dataset.id });
  },
  async selectDay(event: WechatMiniprogram.BaseEvent) {
    const day = String(event.currentTarget.dataset.day ?? ''),
      cell = [...this.data.week, ...this.data.makeupDays].find((d) => d.day === day);
    if (!cell || cell.checked || cell.future || this.data.busy) return;
    if (day === companionDayKey(new Date().toISOString())) {
      await this.checkin();
      return;
    }
    if (
      cell.canMakeup &&
      (await confirmCompanion(
        '补签这一天？',
        '消耗 30 光点，获得当天的签到光点；每天最多补签一天。',
        '补签',
      ))
    )
      await this.perform('makeup', { day });
  },
  toggleMakeup() {
    this.setData({ showMakeup: !this.data.showMakeup });
  },
  goTask(event: WechatMiniprogram.BaseEvent) {
    const t = this.data.tasks.find((t) => t.id === event.currentTarget.dataset.id);
    if (t) openCompanionSection(t.action);
  },
});
