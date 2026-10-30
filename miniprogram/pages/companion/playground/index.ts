import type { CompanionState } from '../../../models/companion';
import { companionService } from '../../../services/companion-service';
import {
  backFromCompanion,
  companionTopInset,
  openCompanionSection,
  companionMessage,
  beginCompanionAction,
  endCompanionAction,
  companionActionCurrent,
  resumeCompanionActions,
  suspendCompanionActions,
  commandCompanion,
} from '../../../services/companion-page';
import { buildCompanionTasks, companionDayKey } from '../../../utils/companion-engine';
import {
  createPlayground,
  stepPlayground,
  hitPlayground,
  buildPlaygroundNotes,
  recommendPlaygroundTask,
  resolvePlaygroundNote,
  playgroundPaperRect,
  type PlaygroundRound,
  type PlaygroundNote,
} from '../../../utils/companion-playground';
import {
  drawPlayground,
  type PlaygroundImages,
} from '../../../utils/companion-playground-renderer';

interface Data {
  topInset: number;
  controlTop: number;
  paperLeft: number;
  paperTop: number;
  paperWidth: number;
  paperHeight: number;
  paperKey: number;
  paperCards: { key: number }[];
  castNotes: PlaygroundNote[];
  menuOpen: boolean;
  stageHeight: number;
  state: CompanionState | null;
  notes: PlaygroundNote[];
  selectedId: string;
  selectedNote: PlaygroundNote | null;
  selectedLucky: boolean;
  seenIds: string[];
  won: boolean;
  paused: boolean;
  listOpen: boolean;
  canvasUnavailable: boolean;
  isLoading: boolean;
  tasksReady: boolean;
  busy: boolean;
  actionMessage: string;
  countdown: number;
  allDone: boolean;
  confetti: { id: number; x: number; color: string; delay: number }[];
}
interface PlaygroundPage {
  data: Data;
  setData(patch: Partial<Data>, done?: () => void): void;
  reload(): Promise<void>;
  prepareCanvas(): void;
  cancelCountdown(): void;
  goTasks(): void;
  closeNote(): void;
  selectPartner(event: { currentTarget: { dataset: { id?: unknown } } }): Promise<void>;
}
interface Touch {
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
}
interface Runtime {
  active: boolean;
  ready: boolean;
  loadVersion: number;
  canvasVersion: number;
  roundVersion: number;
  flipStarted: number;
  heldId: string;
  loadedDay: string;
  touchVersion: number;
  gesture: { x: number; y: number; moved: boolean; version: number } | null;
  round: PlaygroundRound | null;
  tasks: ReturnType<typeof buildCompanionTasks>;
  canvas: WechatMiniprogram.Canvas | null;
  context: WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D | null;
  images: PlaygroundImages;
  frame: number | null;
  last: number | null;
  countdown: ReturnType<typeof setTimeout> | null;
  imageTimer: ReturnType<typeof setTimeout> | null;
  left: number;
  top: number;
}
const runtimes = new WeakMap<object, Runtime>();
function runtime(page: object): Runtime {
  let r = runtimes.get(page);
  if (!r) {
    r = {
      active: false,
      ready: false,
      loadVersion: 0,
      canvasVersion: 0,
      roundVersion: 0,
      flipStarted: 0,
      heldId: '',
      loadedDay: '',
      touchVersion: 0,
      gesture: null,
      round: null,
      tasks: [],
      canvas: null,
      context: null,
      images: new Map(),
      frame: null,
      last: null,
      countdown: null,
      imageTimer: null,
      left: 0,
      top: 0,
    };
    runtimes.set(page, r);
  }
  return r;
}
function stopMotion(r: Runtime): void {
  if (r.frame !== null) r.canvas?.cancelAnimationFrame(r.frame);
  r.frame = null;
  r.last = null;
}
function draw(page: PlaygroundPage): void {
  const r = runtime(page);
  if (r.active && r.context && r.round)
    drawPlayground(
      r.context,
      r.round,
      r.images,
      page.data.selectedId,
      page.data.won,
      Date.now() - r.flipStarted,
    );
}
function animate(page: PlaygroundPage): void {
  const r = runtime(page);
  if (
    !r.active ||
    !r.canvas ||
    !r.round ||
    r.frame !== null ||
    ((page.data.paused || page.data.won) &&
      !(page.data.selectedId && Date.now() - r.flipStarted < 460)) ||
    page.data.canvasUnavailable
  )
    return;
  r.frame = r.canvas.requestAnimationFrame((time: number) => {
    r.frame = null;
    if (!r.active || !r.round) return;
    if (r.last === null) r.last = time - 34;
    const elapsed = (time - r.last) / 1000;
    if (elapsed >= 1 / 60 - 0.002) {
      if (!page.data.paused && !page.data.won)
        stepPlayground(r.round, elapsed, page.data.selectedId || r.heldId);
      r.last = time;
      draw(page);
    }
    animate(page);
  });
}
function selectedNote(
  page: PlaygroundPage,
  notes: PlaygroundNote[],
  allTasks: ReturnType<typeof buildCompanionTasks>,
): PlaygroundNote | null {
  const round = runtime(page).round;
  const note = round ? resolvePlaygroundNote(round, notes, page.data.selectedId) : null;
  if (!note) return null;
  const recommended =
    page.data.won && note.id === runtime(page).round?.luckyId
      ? recommendPlaygroundTask(allTasks)
      : null;
  return recommended ? { ...note, task: recommended } : note;
}
function startCountdown(page: PlaygroundPage): void {
  page.cancelCountdown();
  const r = runtime(page),
    roundVersion = r.roundVersion;
  page.setData({ countdown: 5 });
  const tick = () => {
    r.countdown = null;
    if (!r.active || roundVersion !== r.roundVersion || !page.data.won) return;
    const remaining = page.data.countdown - 1;
    page.setData({ countdown: remaining });
    if (remaining <= 0) page.goTasks();
    else r.countdown = setTimeout(tick, 1000);
  };
  r.countdown = setTimeout(tick, 1000);
}
function openDestination(page: PlaygroundPage, section: string): void {
  const r = runtime(page),
    roundVersion = r.roundVersion,
    loadVersion = r.loadVersion;
  openCompanionSection(section, {
    reuse: true,
    onFailure: () => {
      if (r.active && roundVersion === r.roundVersion && loadVersion === r.loadVersion)
        page.setData({ actionMessage: '这个页面暂时没有打开，请再点一次。' });
    },
  });
}
async function mutate(
  page: PlaygroundPage,
  type: 'interact' | 'claim',
  taskId = '',
): Promise<boolean> {
  const lease = beginCompanionAction(page);
  if (!lease) return false;
  page.setData({ actionMessage: '' });
  let saved = false;
  try {
    const result = await commandCompanion(type === 'claim' ? { type, taskId } : { type });
    if (companionActionCurrent(page, lease)) {
      page.setData({
        state: result.state,
        actionMessage: type === 'interact' ? '找到你啦！今天的招呼已经记下。' : result.message,
      });
      await page.reload();
      saved = page.data.tasksReady;
    }
  } catch (error) {
    if (companionActionCurrent(page, lease)) {
      page.setData({ actionMessage: companionMessage(error) });
      if (type === 'claim') await page.reload();
    }
  } finally {
    if (endCompanionAction(page, lease)) await page.reload();
  }
  return saved && companionActionCurrent(page, lease);
}

Page({
  data: {
    topInset: 68,
    controlTop: 28,
    paperLeft: 0,
    paperTop: 100,
    paperWidth: 178,
    paperHeight: 190,
    paperKey: 0,
    paperCards: [] as { key: number }[],
    castNotes: [] as PlaygroundNote[],
    menuOpen: false,
    stageHeight: 410,
    state: null,
    notes: [],
    selectedId: '',
    selectedNote: null,
    selectedLucky: false,
    seenIds: [],
    won: false,
    paused: false,
    listOpen: false,
    canvasUnavailable: false,
    isLoading: true,
    tasksReady: false,
    busy: false,
    actionMessage: '',
    countdown: 0,
    allDone: false,
    confetti: Array.from({ length: 85 }, (_, id) => ({
      id,
      x: (id * 37 + 11) % 100,
      color:
        ['#ef4662', '#3b77c4', '#ffcb3a', '#58b6a0', '#ed527b', '#9476bb'][id % 6] ?? '#ffcb3a',
      delay: -(id % 9) * 0.1,
    })),
  },
  async onShow(this: PlaygroundPage): Promise<void> {
    const r = runtime(this);
    r.active = true;
    resumeCompanionActions(this);
    this.cancelCountdown();
    const info = wx.getWindowInfo();
    this.setData({
      topInset: companionTopInset(),
      stageHeight: info.windowHeight,
      controlTop: Math.max(24, companionTopInset() - 40),
    });
    await this.reload();
    if (r.active && r.ready) this.prepareCanvas();
  },
  onReady(this: PlaygroundPage): void {
    runtime(this).ready = true;
    this.prepareCanvas();
  },
  onHide(this: PlaygroundPage): void {
    const r = runtime(this);
    r.active = false;
    r.loadVersion++;
    r.canvasVersion++;
    stopMotion(r);
    this.cancelCountdown();
    if (r.imageTimer !== null) clearTimeout(r.imageTimer);
    r.imageTimer = null;
    suspendCompanionActions(this);
  },
  onUnload(this: PlaygroundPage): void {
    const r = runtime(this);
    r.active = false;
    r.loadVersion++;
    r.canvasVersion++;
    stopMotion(r);
    this.cancelCountdown();
    if (r.imageTimer !== null) clearTimeout(r.imageTimer);
    r.imageTimer = null;
    r.canvas = null;
    r.context = null;
    r.images.clear();
    suspendCompanionActions(this);
  },
  async reload(this: PlaygroundPage): Promise<void> {
    const r = runtime(this),
      version = ++r.loadVersion;
    if (!r.active) return;
    this.setData({ isLoading: true, tasksReady: false });
    try {
      const state = companionService.read();
      this.setData({ state });
      if (!state.adoptedAt) {
        stopMotion(r);
        this.setData({
          notes: [],
          castNotes: [],
          paperCards: [],
          selectedId: '',
          selectedNote: null,
          isLoading: false,
        });
        return;
      }
      if (!r.round)
        r.round = createPlayground(
          Math.max(180, wx.getWindowInfo().windowWidth),
          this.data.stageHeight,
        );
      const at = new Date().toISOString(),
        facts = await companionService.facts(at);
      if (!r.active || version !== r.loadVersion) return;
      if (companionDayKey(at) !== companionDayKey(new Date().toISOString()))
        throw Error('新的一天开始啦，请刷新今天的小约定。');
      const latest = companionService.read();
      if (!latest.adoptedAt) throw Error('请先领取你的校园伙伴。');
      const notes = buildPlaygroundNotes(latest, facts, at),
        tasks = buildCompanionTasks(latest, facts, at).map(
          (task) => notes.find((note) => note.task.id === task.id)?.task ?? task,
        );
      r.loadedDay = companionDayKey(at);
      r.tasks = tasks;
      this.setData({
        state: latest,
        notes,
        castNotes: r.round.bodies.flatMap((body) => {
          const note = resolvePlaygroundNote(r.round!, notes, body.id);
          return note ? [note] : [];
        }),
        selectedNote: selectedNote(this, notes, tasks),
        allDone: tasks.every((t) => t.claimed),
        isLoading: false,
        tasksReady: true,
      });
      draw(this);
      if (r.ready && (!r.canvas || notes.some((note) => !r.images.has(note.id))))
        this.prepareCanvas();
    } catch (error) {
      if (r.active && version === r.loadVersion)
        this.setData({
          isLoading: false,
          tasksReady: false,
          actionMessage: companionMessage(error),
        });
    }
  },
  prepareCanvas(this: PlaygroundPage): void {
    const r = runtime(this);
    if (!r.active || !r.ready || !this.data.state?.adoptedAt || this.data.canvasUnavailable) return;
    stopMotion(r);
    const version = ++r.canvasVersion;
    if (r.imageTimer !== null) clearTimeout(r.imageTimer);
    try {
      wx.createSelectorQuery()
        .in(this as unknown as WechatMiniprogram.Page.TrivialInstance)
        .select('#playground-canvas')
        .fields({ node: true, size: true, rect: true })
        .exec(
          (
            items: {
              node?: WechatMiniprogram.Canvas;
              width: number;
              height: number;
              left: number;
              top: number;
            }[],
          ) => {
            if (!r.active || version !== r.canvasVersion) return;
            try {
              const info = items[0];
              if (!info?.node || !(info.width > 0) || !(info.height > 0))
                throw Error('Canvas unavailable');
              r.canvas = info.node;
              r.context = info.node.getContext('2d');
              const ratio = Math.max(1, Math.min(2, wx.getWindowInfo().pixelRatio || 1));
              info.node.width = Math.round(info.width * ratio);
              info.node.height = Math.round(info.height * ratio);
              r.context.scale(ratio, ratio);
              r.left = info.left;
              r.top = info.top;
              if (!r.round || r.round.width !== info.width || r.round.height !== info.height) {
                const lucky = r.round?.luckyId;
                r.round = createPlayground(info.width, info.height);
                if (lucky) r.round.luckyId = lucky;
                if (this.data.selectedId) {
                  const paper = playgroundPaperRect(
                    r.round,
                    this.data.selectedId,
                    this.data.topInset,
                  );
                  this.setData({
                    paperLeft: paper.left,
                    paperTop: paper.top,
                    paperWidth: paper.width,
                    paperHeight: paper.height,
                  });
                }
              }
              const pending = new Set(this.data.notes.map((n) => n.id));
              const settled = (id: string) => {
                pending.delete(id);
                if (!pending.size && r.imageTimer !== null) {
                  clearTimeout(r.imageTimer);
                  r.imageTimer = null;
                }
                draw(this);
              };
              r.imageTimer = setTimeout(() => {
                r.imageTimer = null;
                if (r.active && version === r.canvasVersion && pending.size)
                  this.setData({
                    listOpen: true,
                    actionMessage: '有些伙伴还在赶来，可以先从名单翻开便签。',
                  });
              }, 4000);
              for (const note of this.data.notes) {
                if (r.images.has(note.id)) {
                  settled(note.id);
                  continue;
                }
                const image = info.node.createImage();
                image.onload = () => {
                  if (!r.active || version !== r.canvasVersion) return;
                  r.images.set(note.id, image);
                  settled(note.id);
                };
                image.onerror = () => {
                  if (!r.active || version !== r.canvasVersion) return;
                  this.setData({
                    listOpen: true,
                    actionMessage: '有些伙伴的图片暂时没打开，便签仍可以从名单查看。',
                  });
                  settled(note.id);
                };
                image.src = note.src;
              }
              draw(this);
              animate(this);
            } catch {
              stopMotion(r);
              this.setData({ canvasUnavailable: true, listOpen: true });
            }
          },
        );
    } catch {
      this.setData({ canvasUnavailable: true, listOpen: true });
    }
  },
  retryCanvas(this: PlaygroundPage): void {
    this.setData({ canvasUnavailable: false }, () => this.prepareCanvas());
  },
  async selectPartner(
    this: PlaygroundPage,
    event: { currentTarget: { dataset: { id?: unknown } } },
  ): Promise<void> {
    const r = runtime(this),
      rawId = event.currentTarget.dataset.id;
    const id = typeof rawId === 'string' ? rawId : '';
    if (!r.active || this.data.busy || !this.data.state?.adoptedAt || !r.round) return;
    if (r.loadedDay && r.loadedDay !== companionDayKey(new Date().toISOString()))
      await this.reload();
    if (!r.active || this.data.busy || !this.data.tasksReady) return;
    const note = resolvePlaygroundNote(r.round, this.data.notes, id);
    if (!note) return;
    if (this.data.selectedId === id && !this.data.won) {
      this.closeNote();
      return;
    }
    this.cancelCountdown();
    const paper = playgroundPaperRect(r.round, id, this.data.topInset);
    r.flipStarted = Date.now();
    r.heldId = '';
    this.setData({
      selectedId: id,
      selectedNote:
        this.data.won && r.round.luckyId === id
          ? { ...note, task: recommendPlaygroundTask(r.tasks) ?? note.task }
          : note,
      selectedLucky: r.round.luckyId === id,
      actionMessage: '',
      listOpen: false,
      menuOpen: false,
      paperLeft: paper.left,
      paperTop: paper.top,
      paperWidth: paper.width,
      paperHeight: paper.height,
      paperKey: this.data.paperKey + 1,
      paperCards: [{ key: this.data.paperKey + 1 }],
      seenIds: this.data.seenIds.includes(id) ? this.data.seenIds : [...this.data.seenIds, id],
    });
    if (r.round.luckyId === id && !this.data.won) {
      const roundVersion = r.roundVersion;
      this.setData({ won: true });
      stopMotion(r);
      draw(this);
      animate(this);
      const saved = await mutate(this, 'interact');
      if (saved && r.active && roundVersion === r.roundVersion && this.data.selectedId === id)
        startCountdown(this);
    } else {
      draw(this);
      animate(this);
    }
  },
  onCanvasTouchStart(this: PlaygroundPage, event: { touches: Touch[] }): void {
    const r = runtime(this),
      t = event.touches[0];
    r.touchVersion++;
    r.heldId =
      r.round && t && typeof t.x === 'number' && typeof t.y === 'number'
        ? (hitPlayground(r.round, t.x, t.y)?.id ?? '')
        : '';
    r.gesture =
      r.active && event.touches.length === 1 && t
        ? {
            x: t.clientX ?? t.x ?? NaN,
            y: t.clientY ?? t.y ?? NaN,
            moved: false,
            version: r.touchVersion,
          }
        : null;
  },
  onCanvasTouchMove(this: PlaygroundPage, event: { touches: Touch[] }): void {
    const r = runtime(this),
      t = event.touches[0],
      g = r.gesture;
    if (!g) return;
    if (
      !t ||
      event.touches.length !== 1 ||
      Math.hypot((t.clientX ?? t.x ?? NaN) - g.x, (t.clientY ?? t.y ?? NaN) - g.y) > 8
    )
      g.moved = true;
  },
  onCanvasTouchCancel(this: PlaygroundPage): void {
    const r = runtime(this);
    r.gesture = null;
    r.heldId = '';
    r.touchVersion++;
  },
  onCanvasTouchEnd(this: PlaygroundPage, event: { changedTouches: Touch[] }): void {
    const r = runtime(this),
      touch = event.changedTouches[0];
    const gesture = r.gesture;
    r.gesture = null;
    r.heldId = '';
    if (
      !r.round ||
      !touch ||
      !r.active ||
      !gesture ||
      gesture.moved ||
      Math.hypot(
        (touch.clientX ?? touch.x ?? NaN) - gesture.x,
        (touch.clientY ?? touch.y ?? NaN) - gesture.y,
      ) > 8
    )
      return;
    const roundVersion = r.roundVersion,
      canvasVersion = r.canvasVersion;
    const selectAt = (x: number, y: number) => {
      if (
        !r.active ||
        !r.round ||
        r.roundVersion !== roundVersion ||
        r.canvasVersion !== canvasVersion ||
        r.touchVersion !== gesture.version
      )
        return;
      const body = hitPlayground(r.round, x, y);
      if (body) void this.selectPartner({ currentTarget: { dataset: { id: body.id } } });
    };
    if (typeof touch.x === 'number' && typeof touch.y === 'number') selectAt(touch.x, touch.y);
    else {
      try {
        wx.createSelectorQuery()
          .in(this as unknown as WechatMiniprogram.Page.TrivialInstance)
          .select('#playground-canvas')
          .fields({ rect: true })
          .exec((items: { left: number; top: number }[]) => {
            const rect = items[0];
            if (rect)
              selectAt((touch.clientX ?? NaN) - rect.left, (touch.clientY ?? NaN) - rect.top);
          });
      } catch {
        this.setData({ listOpen: true });
      }
    }
  },
  async performNoteAction(this: PlaygroundPage): Promise<void> {
    const r = runtime(this);
    if (!r.active || this.data.busy) return;
    if (r.loadedDay && r.loadedDay !== companionDayKey(new Date().toISOString()))
      await this.reload();
    const note = this.data.selectedNote;
    if (
      !runtime(this).active ||
      !this.data.tasksReady ||
      this.data.busy ||
      !note ||
      note.task.claimed
    )
      return;
    this.cancelCountdown();
    if (note.task.eligible) await mutate(this, 'claim', note.task.id);
    else openDestination(this, note.task.action);
  },
  cancelCountdown(this: PlaygroundPage): void {
    const r = runtime(this);
    if (r.countdown !== null) clearTimeout(r.countdown);
    r.countdown = null;
    if (this.data.countdown) this.setData({ countdown: 0 });
  },
  closeNote(this: PlaygroundPage): void {
    this.cancelCountdown();
    runtime(this).flipStarted = 0;
    this.setData({ selectedId: '', selectedNote: null, selectedLucky: false, paperCards: [] });
    draw(this);
    animate(this);
  },
  async restart(this: PlaygroundPage): Promise<void> {
    const r = runtime(this);
    if (!r.active || this.data.busy) return;
    if (r.loadedDay && r.loadedDay !== companionDayKey(new Date().toISOString()))
      await this.reload();
    if (!r.active || this.data.busy) return;
    this.cancelCountdown();
    stopMotion(r);
    r.roundVersion++;
    r.flipStarted = 0;
    r.heldId = '';
    r.round = createPlayground(r.round?.width ?? 330, r.round?.height ?? this.data.stageHeight);
    this.setData({
      won: false,
      selectedId: '',
      selectedNote: null,
      selectedLucky: false,
      paperCards: [],
      seenIds: [],
      actionMessage: '',
    });
    draw(this);
    animate(this);
  },
  toggleMotion(this: PlaygroundPage): void {
    this.setData({ paused: !this.data.paused });
    stopMotion(runtime(this));
    draw(this);
    animate(this);
  },
  toggleList(this: PlaygroundPage): void {
    this.setData({ listOpen: !this.data.listOpen, menuOpen: false });
  },
  toggleMenu(this: PlaygroundPage): void {
    this.setData({ menuOpen: !this.data.menuOpen });
  },
  onResize(this: PlaygroundPage): void {
    this.setData({ stageHeight: wx.getWindowInfo().windowHeight });
    this.prepareCanvas();
  },
  goTasks(this: PlaygroundPage): void {
    this.cancelCountdown();
    if (runtime(this).active && !this.data.busy) {
      this.setData({ menuOpen: false });
      openDestination(this, 'tasks');
    }
  },
  goHome(this: PlaygroundPage): void {
    if (runtime(this).active) openDestination(this, 'home');
  },
  back(this: PlaygroundPage): void {
    this.cancelCountdown();
    backFromCompanion();
  },
});
