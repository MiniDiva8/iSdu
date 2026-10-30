import { companionInspiration } from '../../data/companion-inspiration';
import {
  resolveCompanionAsset,
  companionPoseAsset,
  type CompanionPose,
} from '../../data/companion-assets';
import type { CompanionState, CompanionPlacement } from '../../models/companion';
import { companionService } from '../../services/companion-service';
import { cloudCompanionRepository } from '../../services/repository/cloud-companion-repository';
import {
  commandCompanion,
  companionMessage,
  companionErrorTitle,
  companionRequestId,
  publicCompanionSnapshot,
  beginCompanionAction,
  companionActionCurrent,
  endCompanionAction,
  resumeCompanionActions,
  suspendCompanionActions,
  recordCompanionVisit,
  companionTopInset,
  backFromCompanion,
  openCompanionSection,
  confirmCompanion,
} from '../../services/companion-page';
import {
  createCompanionSceneRenderer,
  companionImageSources,
  type CompanionSceneRenderer,
  type CompanionImages,
  type CompanionSceneSnapshot,
} from '../../utils/companion-artwork';
import {
  screenToWorld,
  stepCompanion,
  clampCompanionCamera,
  zoomCompanionCamera,
  hitCompanionFurniture,
  companionGroundPoint,
  companionDepthScale,
  type CompanionCamera,
  type CompanionPoint,
  type CompanionPosition,
} from '../../utils/companion-scene';
import { COMPANION_FURNITURE, COMPANION_SKINS } from '../../data/companion-catalog';
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
interface Touch {
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
}
interface CanvasInfo {
  node?: WechatMiniprogram.Canvas;
  width: number;
  height: number;
  left: number;
  top: number;
}
interface Runtime {
  active: boolean;
  ready: boolean;
  version: number;
  canvasVersion: number;
  canvas: WechatMiniprogram.Canvas | null;
  context: Context | null;
  renderer: CompanionSceneRenderer | null;
  images: CompanionImages;
  width: number;
  height: number;
  left: number;
  top: number;
  ratio: number;
  camera: CompanionCamera;
  pet: CompanionPosition;
  target: CompanionPoint | null;
  frame: number | null;
  last: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  interactUntil: number;
  pose: CompanionPose;
  snapshot: CompanionSceneSnapshot | null;
  gesture: {
    start: CompanionPoint;
    last: CompanionPoint;
    camera: CompanionCamera;
    distance: number;
    dragId: string;
    moved: boolean;
  } | null;
}
// WeChat's Page declaration erases custom method types at lifecycle/touch entrypoints.
interface CompanionScenePageMethods {
  prepareCanvas(): void;
  saveFurniture(item: CompanionPlacement): Promise<void>;
  interactWithCompanion(): Promise<void>;
}
function scenePage(page: object): CompanionScenePageMethods {
  return page as CompanionScenePageMethods;
}
const runtimes = new WeakMap<object, Runtime>();
function runtime(p: object): Runtime {
  let r = runtimes.get(p);
  if (!r) {
    r = {
      active: false,
      ready: false,
      version: 0,
      canvasVersion: 0,
      canvas: null,
      context: null,
      renderer: null,
      images: new Map(),
      width: 390,
      height: 844,
      left: 0,
      top: 0,
      ratio: 1,
      camera: { x: 0, y: 0, zoom: 1 },
      pet: { x: 0.52, y: 0.72, moving: false, facing: 1 },
      target: null,
      frame: null,
      last: null,
      timer: null,
      interactUntil: 0,
      pose: 'idle',
      snapshot: null,
      gesture: null,
    };
    runtimes.set(p, r);
  }
  return r;
}
function stop(r: Runtime) {
  if (r.frame !== null && r.canvas) r.canvas.cancelAnimationFrame(r.frame);
  if (r.timer !== null) clearTimeout(r.timer);
  r.frame = null;
  r.timer = null;
  r.last = null;
  r.gesture = null;
  r.target = null;
  r.pet.moving = false;
}
function point(t: Touch | undefined, r: Runtime): CompanionPoint | null {
  if (!t) return null;
  const x = t.x ?? (typeof t.clientX === 'number' ? t.clientX - r.left : NaN),
    y = t.y ?? (typeof t.clientY === 'number' ? t.clientY - r.top : NaN);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
function furniturePoint(p: CompanionPoint, itemId: string, theme: string): CompanionPoint {
  if (resolveCompanionAsset('furniture', itemId).layer !== 'wall')
    return companionGroundPoint(p, theme);
  return {
    x: Math.max(0.06, Math.min(0.94, p.x)),
    y: Math.max(0.12, Math.min(0.9, p.y)),
  };
}
function rebuild(r: Runtime) {
  r.renderer?.dispose();
  if (!r.snapshot) return;
  r.renderer = createCompanionSceneRenderer(
    r.snapshot,
    { width: r.width, height: r.height },
    r.ratio,
    r.images,
    typeof wx.createOffscreenCanvas === 'function'
      ? (w, h) => wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
      : undefined,
  );
}
function draw(r: Runtime) {
  if (r.active && r.context && r.renderer)
    r.renderer.draw(
      r.context,
      r.pet,
      r.camera,
      Date.now() / 1000,
      r.gesture?.dragId ?? '',
      Date.now() < r.interactUntil,
      r.pose,
    );
}
function idle(r: Runtime): void {
  if (!r.active || !r.snapshot || r.frame !== null || r.timer !== null) return;
  const asset = resolveCompanionAsset('skin', r.snapshot.skinId);
  if (!asset.src || asset.states.idle.frames < 2 || !r.images.has(asset.src)) return;
  r.timer = setTimeout(
    () => {
      r.timer = null;
      if (!r.active) return;
      try {
        draw(r);
      } catch {
        stop(r);
        return;
      }
      idle(r);
    },
    1000 / Math.max(1, Math.min(12, asset.fps)),
  );
}
function animate(r: Runtime): void {
  if (!r.active || !r.canvas || !r.context || r.frame !== null) return;
  if (r.timer !== null) {
    clearTimeout(r.timer);
    r.timer = null;
  }
  const tick = (time: number) => {
    r.frame = null;
    if (!r.active || !r.canvas) return;
    const elapsed = r.last === null ? 1 / 60 : (time - r.last) / 1000;
    r.last = time;
    if (r.target) {
      r.pet = stepCompanion(r.pet, r.target, elapsed);
      if (!r.pet.moving) r.target = null;
    }
    try {
      draw(r);
    } catch {
      stop(r);
      return;
    }
    if (r.target || Date.now() < r.interactUntil) r.frame = r.canvas.requestAnimationFrame(tick);
    else {
      r.last = null;
      idle(r);
    }
  };
  r.frame = r.canvas.requestAnimationFrame(tick);
}
function fallbackItems(items: readonly CompanionPlacement[]) {
  return items.map((item) => ({
    ...item,
    label: COMPANION_FURNITURE.find((f) => f.id === item.itemId)?.name ?? '家具',
  }));
}
function forgetScene(r: Runtime): void {
  stop(r);
  r.canvasVersion++;
  r.snapshot = null;
  r.renderer?.dispose();
  r.renderer = null;
  try {
    r.context?.setTransform(1, 0, 0, 1, 0, 0);
    r.context?.clearRect(0, 0, r.canvas?.width ?? 0, r.canvas?.height ?? 0);
  } catch {
    /* Removing the mounted node remains authoritative. */
  }
  r.canvas = null;
  r.context = null;
}
const guides = [
  { title: '一个属于你们的小角落', body: '点击地面让伙伴走过去，点一下伙伴打个招呼。' },
  { title: '布置你喜欢的小院', body: '打开家具仓库，选一件摆出来；布置时可以拖动、旋转或收回。' },
  { title: '今天也来见一面', body: '签到、写日记、读来信都能获得免费的光点。' },
  {
    title: '给伙伴换个新模样',
    body: '装扮仓库负责换装，商店负责兑换。在八位校园搭子之间切换，也可以搭配随身小装饰。',
  },
  {
    title: '收下一封小小来信',
    body: '信箱会保存伙伴的来信；主动开启来访后，还能收到已确认好友的留言。',
  },
  { title: '留下你们的小院合影', body: '拍一张完整小院卡片，保存或由你主动分享。' },
];
Page({
  data: {
    topInset: 24,
    state: null as CompanionState | null,
    title: '校园伙伴小屋',
    isLoading: true,
    errorMessage: '',
    errorTitle: '小院暂时无法访问',
    actionMessage: '',
    busy: false,
    isVisitor: false,
    targetUserId: '',
    ownerName: '',
    visitorMessage: '',
    editing: false,
    selectedId: '',
    selectedName: '',
    canvasUnavailable: false,
    sceneVisible: false,
    nameInput: '途途',
    guide: null as { title: string; body: string } | null,
    guideStep: 0,
    welcomeSrc: companionPoseAsset('sprout', 'gift').src,
    petSrc: companionPoseAsset('sprout', 'idle').src,
    characterRole: '校园探索搭子',
    inspirationOpen: false,
    inspirationIndex: 0,
    inspiration: companionInspiration(0),
    activePose: 'idle',
    poses: [
      { id: 'happy', name: '开心' },
      { id: 'recording', name: '记录' },
      { id: 'resting', name: '歇一歇' },
      { id: 'gift', name: '送你礼物' },
    ],
    fallbackPlacements: [] as ReturnType<typeof fallbackItems>,
  },
  onLoad(query: Record<string, string | undefined>) {
    const target = query.targetUserId ?? '';
    this.setData({ topInset: companionTopInset(), isVisitor: !!target, targetUserId: target });
  },
  async onShow() {
    const r = runtime(this);
    r.active = true;
    resumeCompanionActions(this);
    if (this.data.isVisitor) {
      forgetScene(r);
      this.setData({
        sceneVisible: false,
        title: '校园伙伴小屋',
        ownerName: '',
        fallbackPlacements: [],
      });
    }
    const version = ++r.version;
    this.setData({
      isLoading: true,
      errorMessage: '',
      editing: false,
      selectedId: '',
      selectedName: '',
      inspirationOpen: false,
      activePose: 'idle',
    });
    r.pose = 'idle';
    try {
      if (this.data.isVisitor) {
        const home = await cloudCompanionRepository.getHome(this.data.targetUserId);
        if (!r.active || r.version !== version) return;
        r.snapshot = {
          ...home.snapshot,
          placements: home.snapshot.placements.map((p) => ({ ...p })),
        };
        this.setData({
          title: home.snapshot.name + '的小屋',
          ownerName: home.owner.displayName,
          isLoading: false,
          state: null,
          guide: null,
          fallbackPlacements: fallbackItems(r.snapshot.placements),
        });
        try {
          await recordCompanionVisit(this.data.targetUserId, companionRequestId());
          if (!r.active || r.version !== version) return;
          if (companionService.read().adoptedAt) await commandCompanion({ type: 'visited' });
        } catch (error) {
          if (r.active && r.version === version)
            this.setData({ actionMessage: companionMessage(error) });
        }
      } else {
        const s = companionService.read();
        r.snapshot = publicCompanionSnapshot(s);
        this.setData({
          state: s,
          petSrc: companionPoseAsset(s.skinId, 'idle').src,
          characterRole: COMPANION_SKINS.find((i) => i.id === s.skinId)?.role ?? '校园伙伴',
          title: s.adoptedAt ? s.name + '的小屋' : '校园伙伴小屋',
          isLoading: false,
          guide:
            s.adoptedAt && s.tutorialStep < guides.length ? (guides[s.tutorialStep] ?? null) : null,
          guideStep: s.tutorialStep,
          fallbackPlacements: fallbackItems(s.placements),
        });
      }
      if (!r.active || r.version !== version) return;
      rebuild(r);
      this.setData({ sceneVisible: true, canvasUnavailable: false }, () =>
        scenePage(this).prepareCanvas(),
      );
    } catch (error) {
      if (r.active && r.version === version)
        this.setData({
          isLoading: false,
          errorMessage: companionMessage(error),
          errorTitle: companionErrorTitle(error),
        });
    }
  },
  onReady() {
    runtime(this).ready = true;
    scenePage(this).prepareCanvas();
  },
  prepareCanvas(): void {
    const r = runtime(this);
    if (!r.ready || !r.active || !r.snapshot) return;
    const version = ++r.canvasVersion;
    try {
      wx.createSelectorQuery()
        .in(this)
        .select('#companion-canvas')
        .fields({ node: true, size: true, rect: true })
        .exec((items: CanvasInfo[]) => {
          if (!r.active || r.canvasVersion !== version) return;
          const info = items[0];
          if (!info?.node || !info.width || !info.height) {
            this.setData({ canvasUnavailable: true });
            return;
          }
          try {
            r.canvas = info.node;
            r.context = r.canvas.getContext('2d');
            r.width = info.width;
            r.height = info.height;
            r.left = info.left;
            r.top = info.top;
            r.ratio = Math.max(1, Math.min(2, wx.getWindowInfo?.().pixelRatio ?? 1));
            r.canvas.width = Math.ceil(r.width * r.ratio);
            r.canvas.height = Math.ceil(r.height * r.ratio);
            r.camera = clampCompanionCamera(r.camera, r);
            rebuild(r);
            draw(r);
            this.setData({ canvasUnavailable: false });
            idle(r);
            for (const src of companionImageSources(r.snapshot as CompanionSceneSnapshot)) {
              if (r.images.has(src)) continue;
              const image = r.canvas.createImage();
              image.onload = () => {
                if (!r.active || r.canvasVersion !== version) return;
                r.images.set(src, image);
                try {
                  rebuild(r);
                  draw(r);
                  idle(r);
                } catch {
                  stop(r);
                  this.setData({ canvasUnavailable: true });
                }
              };
              image.onerror = () => {
                if (r.active && r.canvasVersion === version)
                  this.setData({ actionMessage: '部分形象暂未加载，请稍后重新打开小屋。' });
              };
              image.src = src;
            }
          } catch {
            stop(r);
            r.canvas = null;
            r.context = null;
            this.setData({ canvasUnavailable: true });
          }
        });
    } catch {
      this.setData({ canvasUnavailable: true });
    }
  },
  onResize() {
    const r = runtime(this);
    stop(r);
    scenePage(this).prepareCanvas();
  },
  onHide() {
    const r = runtime(this);
    r.active = false;
    suspendCompanionActions(this);
    if (this.data.isVisitor) {
      forgetScene(r);
      this.setData({ sceneVisible: false, ownerName: '', fallbackPlacements: [] });
    }
    r.version++;
    r.canvasVersion++;
    stop(r);
  },
  onUnload() {
    void this.onHide();
    const r = runtimes.get(this);
    r?.renderer?.dispose();
    r?.images.clear();
    runtimes.delete(this);
  },
  back() {
    backFromCompanion();
  },
  openSection(event: WechatMiniprogram.BaseEvent) {
    const page = event.currentTarget.dataset.page as string;
    if (this.data.isVisitor && page !== 'mail') return;
    openCompanionSection(page);
  },
  onNameInput(event: WechatMiniprogram.Input) {
    this.setData({ nameInput: event.detail.value });
  },
  async adopt() {
    if (this.data.busy) return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this.setData({ busy: true, actionMessage: '' });
    try {
      const result = await commandCompanion({ type: 'adopt', name: this.data.nameInput.trim() });
      if (companionActionCurrent(this, lease)) {
        this.setData({ actionMessage: result.message });
        await this.onShow();
      }
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },
  async advanceGuide() {
    if (this.data.busy) return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this.setData({ busy: true });
    try {
      const step = this.data.guideStep + 1;
      await commandCompanion({ type: 'tutorial', step });
      if (companionActionCurrent(this, lease))
        this.setData({ guideStep: step, guide: guides[step] ?? null });
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },
  async skipGuide() {
    const lease = beginCompanionAction(this);
    if (!lease) return;
    try {
      await commandCompanion({ type: 'tutorial', step: 7 });
      if (companionActionCurrent(this, lease)) this.setData({ guide: null, guideStep: 7 });
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },

  toggleEditing() {
    if (this.data.isVisitor || !this.data.state?.adoptedAt) return;
    const editing = !this.data.editing;
    this.setData({
      editing,
      selectedId: '',
      selectedName: '',
      actionMessage: editing ? '点选家具后拖动；每次松手会保存。' : '',
    });
    runtime(this).gesture = null;
    draw(runtime(this));
  },
  centerScene() {
    const r = runtime(this);
    r.camera = { x: 0, y: 0, zoom: 1 };
    draw(r);
  },
  zoomScene() {
    const r = runtime(this);
    r.camera = zoomCompanionCamera(
      r.camera,
      r.camera.zoom >= 2 ? 1 : r.camera.zoom + 0.5,
      { x: r.width / 2, y: r.height / 2 },
      r,
    );
    draw(r);
  },
  onCanvasTouchStart(event: { touches: Touch[] }) {
    const r = runtime(this);
    if (!r.active || !r.snapshot) return;
    const p = point(event.touches[0], r);
    if (!p) return;
    const second = point(event.touches[1], r);
    const world = screenToWorld(p, r.camera, r);
    const furniture = this.data.editing
      ? hitCompanionFurniture(world, r.snapshot.placements)
      : null;
    r.gesture = {
      start: p,
      last: p,
      camera: { ...r.camera },
      distance: second ? Math.hypot(second.x - p.x, second.y - p.y) : 0,
      dragId: second ? '' : (furniture?.id ?? ''),
      moved: false,
    };
    if (furniture && !second)
      this.setData({
        selectedId: furniture.id,
        selectedName: COMPANION_FURNITURE.find((i) => i.id === furniture.itemId)?.name ?? '家具',
      });
  },
  onCanvasTouchMove(event: { touches: Touch[] }) {
    const r = runtime(this),
      g = r.gesture;
    if (!r.active || !g || !r.snapshot) return;
    const p = point(event.touches[0], r);
    if (!p) return;
    const second = point(event.touches[1], r);
    if (second) {
      const distance = Math.hypot(second.x - p.x, second.y - p.y);
      if (g.distance > 0)
        r.camera = zoomCompanionCamera(
          g.camera,
          (g.camera.zoom * distance) / g.distance,
          { x: (p.x + second.x) / 2, y: (p.y + second.y) / 2 },
          r,
        );
      g.moved = true;
      g.dragId = '';
    } else if (g.dragId) {
      const w = screenToWorld(p, r.camera, r),
        item = r.snapshot.placements.find((i) => i.id === g.dragId);
      if (item) {
        const destination = furniturePoint(w, item.itemId, r.snapshot.theme);
        item.x = destination.x;
        item.y = destination.y;
        rebuild(r);
      }
      g.moved = true;
    } else {
      const dx = p.x - g.start.x,
        dy = p.y - g.start.y;
      if (Math.hypot(dx, dy) > 6) {
        g.moved = true;
        r.camera = clampCompanionCamera({ ...g.camera, x: g.camera.x + dx, y: g.camera.y + dy }, r);
      }
    }
    g.last = p;
    draw(r);
  },
  async onCanvasTouchEnd(event: { changedTouches?: Touch[]; touches?: Touch[] }) {
    const r = runtime(this),
      g = r.gesture;
    r.gesture = null;
    if (!r.active || !g || !r.snapshot) return;
    if (g.dragId && g.moved) {
      const item = r.snapshot.placements.find((i) => i.id === g.dragId);
      if (item) await scenePage(this).saveFurniture(item);
      return;
    }
    if (g.moved || this.data.editing) return;
    const p = point(event.changedTouches?.[0], r) ?? g.start,
      w = screenToWorld(p, r.camera, r);
    if (
      Math.hypot((w.x - r.pet.x) * 800, (w.y - r.pet.y) * 1100) <
      70 * companionDepthScale(r.pet.y)
    ) {
      await scenePage(this).interactWithCompanion();
      return;
    }
    if (!this.data.isVisitor && !this.data.state?.adoptedAt) return;
    r.pose = 'idle';
    this.setData({ activePose: 'idle' });
    r.target = companionGroundPoint(w, r.snapshot.theme);
    animate(r);
  },
  onCanvasTouchCancel() {
    const r = runtime(this);
    r.gesture = null;
    if (this.data.state) {
      r.snapshot = publicCompanionSnapshot(this.data.state);
      rebuild(r);
      draw(r);
    }
  },
  noop() {},
  showInspiration() {
    if (this.data.isVisitor || !this.data.state?.adoptedAt) return;
    const r = runtime(this);
    r.pose = 'recording';
    this.setData({ inspirationOpen: true, activePose: 'recording' });
    draw(r);
  },
  closeInspiration() {
    this.setData({ inspirationOpen: false });
    const r = runtime(this);
    r.pose = 'idle';
    this.setData({ activePose: 'idle' });
    draw(r);
  },
  nextInspiration() {
    const index = this.data.inspirationIndex + 1;
    this.setData({ inspirationIndex: index, inspiration: companionInspiration(index) });
  },
  writeFromInspiration() {
    if (this.data.isVisitor || !this.data.state?.adoptedAt) return;
    void wx.navigateTo({
      url: '/pages/editor/index?source=journal&companionPrompt=' + this.data.inspiration.id,
    });
  },
  choosePose(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isVisitor || !this.data.state?.adoptedAt || !runtime(this).active) return;
    const pose = String(event.currentTarget.dataset.pose ?? '');
    if (!['idle', 'happy', 'recording', 'resting', 'gift'].includes(pose)) return;
    const r = runtime(this);
    stop(r);
    r.interactUntil = 0;
    r.pose = pose as CompanionPose;
    this.setData({ activePose: pose });
    draw(r);
  },
  async interactWithCompanion(): Promise<void> {
    const r = runtime(this);
    if (!r.active || !r.snapshot) return;
    r.interactUntil = Date.now() + 900;
    animate(r);
    if (!this.data.isVisitor && this.data.state?.adoptedAt) {
      try {
        const version = r.version;
        const result = await commandCompanion({ type: 'interact' });
        if (r.active && r.version === version) {
          this.setData({ actionMessage: result.message });
          if (this.data.state.haptics && typeof wx.vibrateShort === 'function')
            void wx.vibrateShort({ type: 'light', fail: () => {} });
        }
      } catch (error) {
        if (r.active) this.setData({ actionMessage: companionMessage(error) });
      }
    }
  },
  selectFallbackFurniture(event: WechatMiniprogram.BaseEvent): void {
    if (this.data.isVisitor) return;
    const id = String(event.currentTarget.dataset.id ?? ''),
      item = runtime(this).snapshot?.placements.find((p) => p.id === id);
    if (item)
      this.setData({
        editing: true,
        selectedId: id,
        selectedName: COMPANION_FURNITURE.find((i) => i.id === item.itemId)?.name ?? '家具',
      });
  },
  async nudgeFurniture(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isVisitor) return;
    const dx = Number(event.currentTarget.dataset.dx ?? 0),
      dy = Number(event.currentTarget.dataset.dy ?? 0);
    if (![-1, 0, 1].includes(dx) || ![-1, 0, 1].includes(dy)) return;
    const snapshot = runtime(this).snapshot;
    const item = snapshot?.placements.find((p) => p.id === this.data.selectedId);
    if (!item || !snapshot) return;
    const destination = furniturePoint(
      { x: item.x + dx * 0.04, y: item.y + dy * 0.04 },
      item.itemId,
      snapshot.theme,
    );
    await scenePage(this).saveFurniture({
      ...item,
      ...destination,
    });
  },
  retryCanvas(): void {
    if (!runtime(this).snapshot) return;
    this.setData({ canvasUnavailable: false }, () => scenePage(this).prepareCanvas());
  },
  async saveFurniture(item: CompanionPlacement): Promise<void> {
    const r = runtime(this);
    try {
      const result = await commandCompanion({
        type: 'move',
        id: item.id,
        x: item.x,
        y: item.y,
        rotation: item.rotation,
      });
      if (r.active) {
        this.setData({
          state: result.state,
          fallbackPlacements: fallbackItems(result.state.placements),
        });
        r.snapshot = publicCompanionSnapshot(result.state);
        rebuild(r);
        draw(r);
      }
    } catch (error) {
      if (r.active) {
        this.setData({ actionMessage: companionMessage(error) });
        if (this.data.state) r.snapshot = publicCompanionSnapshot(this.data.state);
        rebuild(r);
        draw(r);
      }
    }
  },
  async rotateFurniture() {
    const r = runtime(this),
      item = r.snapshot?.placements.find((i) => i.id === this.data.selectedId);
    if (!item) return;
    await scenePage(this).saveFurniture({ ...item, rotation: (item.rotation + 90) % 360 });
  },
  async removeFurniture() {
    if (!this.data.selectedId) return;
    const r = runtime(this);
    try {
      const result = await commandCompanion({ type: 'remove', id: this.data.selectedId });
      if (r.active) {
        this.setData({
          state: result.state,
          fallbackPlacements: fallbackItems(result.state.placements),
          selectedId: '',
          selectedName: '',
          actionMessage: result.message,
        });
        r.snapshot = publicCompanionSnapshot(result.state);
        rebuild(r);
        draw(r);
      }
    } catch (error) {
      if (r.active) this.setData({ actionMessage: companionMessage(error) });
    }
  },
  onVisitorMessage(event: WechatMiniprogram.Input) {
    this.setData({ visitorMessage: event.detail.value });
  },
  async leaveMessage() {
    if (!this.data.isVisitor || this.data.busy || !this.data.visitorMessage.trim()) return;
    const lease = beginCompanionAction(this);
    if (!lease) return;
    this.setData({ busy: true });
    try {
      await recordCompanionVisit(
        this.data.targetUserId,
        companionRequestId(),
        this.data.visitorMessage.trim(),
      );
      if (companionActionCurrent(this, lease))
        this.setData({ visitorMessage: '', actionMessage: '留言已经送到好友的信箱。' });
    } catch (error) {
      if (companionActionCurrent(this, lease))
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (endCompanionAction(this, lease)) await this.onShow();
    }
  },
  async resetSave() {
    if (
      !(await confirmCompanion(
        '重置本机小屋？',
        '只清除伙伴、光点、仓库和布置；日记及照片仍会保留。此操作无法恢复。',
        '重置小屋',
      ))
    )
      return;
    try {
      companionService.clear();
      await this.onShow();
    } catch (error) {
      this.setData({ actionMessage: companionMessage(error) });
    }
  },
  onShareAppMessage() {
    return {
      title: '来看看我们的校园伙伴小屋',
      path: this.data.isVisitor
        ? '/pages/companion/index?targetUserId=' + encodeURIComponent(this.data.targetUserId)
        : '/pages/journal/index',
    };
  },
});
