import { accelerometerHub } from '../../services/accelerometer-hub';
import { memoryRepository } from '../../services/repository/index';
import {
  BOTTLE_HEIGHT,
  BOTTLE_PAGE_SIZE,
  BOTTLE_WIDTH,
  createBottleMemories,
  createBottleParticles,
  getBottleGravity,
  getBottlePage,
  hitTestBottle,
  shakeBottle as shakeBottleParticles,
  stepBottle,
  type BottleGravity,
  type BottleMemory,
  type BottleParticle,
} from '../../utils/memory-bottle';
import { createBottleRenderer, type BottleRenderer } from '../../utils/memory-bottle-renderer';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
interface Point {
  x: number;
  y: number;
}
interface TouchPoint {
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
}
interface BottleTouch {
  touches?: readonly TouchPoint[];
  changedTouches?: readonly TouchPoint[];
}
interface CanvasResult {
  node?: WechatMiniprogram.Canvas;
  width: number;
  height: number;
  left: number;
  top: number;
}
interface BottleRuntime {
  active: boolean;
  ready: boolean;
  loadVersion: number;
  canvasVersion: number;
  canvas: WechatMiniprogram.Canvas | null;
  context: Context | null;
  renderer: BottleRenderer | null;
  frameId: number | null;
  lastFrame: number | null;
  width: number;
  height: number;
  ratio: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  left: number;
  pageTop: number;
  scrollTop: number;
  memories: BottleMemory[];
  particles: BottleParticle[];
  gravity: BottleGravity;
  motionRelease: (() => void) | null;
  sensorVersion: number;
  lastAcceleration: { x: number; y: number; z: number } | null;
  lastShake: number;
  touch: { point: Point; time: number } | null;
}

const runtimes = new WeakMap<object, BottleRuntime>();
const MOTION_FALLBACK = '也可以点「摇一摇」，让回忆动起来。';

function runtimeFor(page: object): BottleRuntime {
  let runtime = runtimes.get(page);
  if (!runtime) {
    runtime = {
      active: false,
      ready: false,
      loadVersion: 0,
      canvasVersion: 0,
      canvas: null,
      context: null,
      renderer: null,
      frameId: null,
      lastFrame: null,
      width: 320,
      height: 400,
      ratio: 1,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      left: 0,
      pageTop: 0,
      scrollTop: 0,
      memories: [],
      particles: [],
      gravity: { x: 0, y: 1 },
      motionRelease: null,
      sensorVersion: 0,
      lastAcceleration: null,
      lastShake: 0,
      touch: null,
    };
    runtimes.set(page, runtime);
  }
  return runtime;
}

function stopAnimation(runtime: BottleRuntime): void {
  if (runtime.frameId !== null && runtime.canvas)
    runtime.canvas.cancelAnimationFrame(runtime.frameId);
  runtime.frameId = null;
  runtime.lastFrame = null;
}

function stopMotion(runtime: BottleRuntime): void {
  runtime.sensorVersion++;
  const release = runtime.motionRelease;
  runtime.motionRelease = null;
  runtime.lastAcceleration = null;
  release?.();
}

function touchPoint(event: BottleTouch, runtime: BottleRuntime, ending: boolean): Point | null {
  const touch = (ending ? event.changedTouches : event.touches)?.[0];
  if (!touch) return null;
  let x: number;
  let y: number;
  if (typeof touch.x === 'number' && typeof touch.y === 'number') {
    x = touch.x;
    y = touch.y;
  } else if (typeof touch.clientX === 'number' && typeof touch.clientY === 'number') {
    x = touch.clientX - runtime.left;
    y = touch.clientY - (runtime.pageTop - runtime.scrollTop);
  } else return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: (x - runtime.offsetX) / runtime.scale, y: (y - runtime.offsetY) / runtime.scale };
}

Page({
  data: {
    isLoading: true,
    errorMessage: '',
    actionMessage: '',
    totalCount: 0,
    pageIndex: 0,
    pageCount: 1,
    visibleMemories: [] as BottleMemory[],
    moodLegend: [] as { label: string; color: string; count: number }[],
    isCanvasUnavailable: false,
    isListOpen: false,
    hasMotion: false,
    motionHint: '轻轻倾斜或晃动手机，让回忆动起来。',
  },

  async onShow() {
    const runtime = runtimeFor(this);
    runtime.active = true;
    runtime.gravity = { x: 0, y: 1 };
    this.setData({ hasMotion: false, actionMessage: '' });
    if (runtime.ready && !runtime.canvas) this.prepareCanvas();
    await this.loadMemories();
  },

  onReady() {
    runtimeFor(this).ready = true;
    this.prepareCanvas();
  },

  onHide() {
    const runtime = runtimes.get(this);
    if (!runtime) return;
    runtime.active = false;
    runtime.loadVersion++;
    runtime.canvasVersion++;
    runtime.touch = null;
    stopAnimation(runtime);
    stopMotion(runtime);
  },

  onUnload() {
    void this.onHide();
    const runtime = runtimes.get(this);
    if (runtime) runtime.renderer = null;
    runtimes.delete(this);
  },

  onResize() {
    if (runtimeFor(this).active) this.prepareCanvas();
  },

  onPageScroll(event: { scrollTop: number }) {
    const runtime = runtimes.get(this);
    if (runtime && Number.isFinite(event.scrollTop)) runtime.scrollTop = event.scrollTop;
  },

  async onPullDownRefresh() {
    try {
      await this.loadMemories();
    } finally {
      void wx.stopPullDownRefresh();
    }
  },

  async loadMemories() {
    const runtime = runtimeFor(this);
    const version = ++runtime.loadVersion;
    this.setData({ isLoading: true, errorMessage: '', actionMessage: '' });
    try {
      const memories = await memoryRepository.listMemories();
      if (!runtime.active || runtimes.get(this) !== runtime || version !== runtime.loadVersion)
        return;
      runtime.memories = createBottleMemories(memories);
      this.setData({
        totalCount: runtime.memories.length,
        pageCount: Math.max(1, Math.ceil(runtime.memories.length / BOTTLE_PAGE_SIZE)),
        isLoading: false,
      });
      this.showBottlePage(this.data.pageIndex);
    } catch (error: unknown) {
      if (!runtime.active || runtimes.get(this) !== runtime || version !== runtime.loadVersion)
        return;
      stopAnimation(runtime);
      stopMotion(runtime);
      this.setData({
        isLoading: false,
        errorMessage: error instanceof Error ? error.message : '回忆暂时没有读到，请稍后重试。',
      });
    }
  },

  showBottlePage(pageIndex: number) {
    const runtime = runtimeFor(this);
    const index = Math.max(0, Math.min(this.data.pageCount - 1, Math.floor(pageIndex)));
    const memories = getBottlePage(runtime.memories, index);
    runtime.particles = createBottleParticles(memories);
    runtime.renderer = null;
    this.prepareRenderer();
    const legend = new Map<string, { label: string; color: string; count: number }>();
    for (const memory of memories) {
      const key = memory.moodLabel + memory.color;
      const item = legend.get(key);
      if (item) item.count++;
      else legend.set(key, { label: memory.moodLabel, color: memory.color, count: 1 });
    }
    this.setData({
      pageIndex: index,
      visibleMemories: memories,
      moodLegend: [...legend.values()],
      actionMessage: '',
    });
    this.startScene();
  },

  previousBottle() {
    if (!this.data.isLoading && this.data.pageIndex > 0)
      this.showBottlePage(this.data.pageIndex - 1);
  },

  nextBottle() {
    if (!this.data.isLoading && this.data.pageIndex + 1 < this.data.pageCount)
      this.showBottlePage(this.data.pageIndex + 1);
  },

  prepareCanvas() {
    const runtime = runtimeFor(this);
    if (!runtime.active || !runtime.ready) return;
    const version = ++runtime.canvasVersion;
    try {
      wx.createSelectorQuery()
        .in(this)
        .select('#memory-bottle-canvas')
        .fields({ node: true, size: true, rect: true })
        .exec((results: CanvasResult[]) => {
          if (
            !runtime.active ||
            runtimes.get(this) !== runtime ||
            version !== runtime.canvasVersion
          )
            return;
          const result = results[0];
          try {
            if (!result?.node || !(result.width > 0) || !(result.height > 0))
              throw new Error('Canvas unavailable');
            stopAnimation(runtime);
            const canvas = result.node;
            const context = canvas.getContext('2d');
            if (!context || typeof canvas.requestAnimationFrame !== 'function')
              throw new Error('Canvas unsupported');
            let ratio = 1;
            try {
              ratio =
                typeof wx.getWindowInfo === 'function'
                  ? wx.getWindowInfo().pixelRatio
                  : wx.getSystemInfoSync().pixelRatio;
            } catch {
              /* A default ratio still gives a usable canvas. */
            }
            runtime.ratio = Number.isFinite(ratio) ? Math.max(1, Math.min(2, ratio)) : 1;
            runtime.canvas = canvas;
            runtime.context = context;
            runtime.width = result.width;
            runtime.height = result.height;
            runtime.left = result.left;
            runtime.pageTop = result.top + runtime.scrollTop;
            runtime.scale = Math.min(result.width / BOTTLE_WIDTH, result.height / BOTTLE_HEIGHT);
            runtime.offsetX = (result.width - BOTTLE_WIDTH * runtime.scale) / 2;
            runtime.offsetY = (result.height - BOTTLE_HEIGHT * runtime.scale) / 2;
            canvas.width = Math.round(result.width * runtime.ratio);
            canvas.height = Math.round(result.height * runtime.ratio);
            runtime.renderer = null;
            this.prepareRenderer();
            this.setData({ isCanvasUnavailable: false });
            this.startScene();
          } catch {
            this.canvasUnavailable();
          }
        });
    } catch {
      this.canvasUnavailable();
    }
  },

  canvasUnavailable() {
    const runtime = runtimeFor(this);
    stopAnimation(runtime);
    stopMotion(runtime);
    runtime.canvas = null;
    runtime.context = null;
    runtime.renderer = null;
    this.setData({
      isCanvasUnavailable: true,
      isListOpen: true,
      hasMotion: false,
      motionHint: MOTION_FALLBACK,
    });
  },

  retryCanvas() {
    this.setData({ isCanvasUnavailable: false }, () => this.prepareCanvas());
  },

  startMotion() {
    const runtime = runtimeFor(this);
    if (!runtime.active || runtime.motionRelease || runtime.particles.length === 0) return;
    const version = ++runtime.sensorVersion;
    let acquired: (() => void) | null = null;
    let cancelled = false;
    runtime.motionRelease = () => {
      cancelled = true;
      acquired?.();
    };
    const listener = (sample: unknown) => {
      if (cancelled || !runtime.active || runtime.sensorVersion !== version) return;
      if (
        typeof sample !== 'object' ||
        sample === null ||
        !('x' in sample) ||
        !('y' in sample) ||
        !('z' in sample)
      )
        return;
      const { x, y, z } = sample;
      if (
        typeof x !== 'number' ||
        typeof y !== 'number' ||
        typeof z !== 'number' ||
        ![x, y, z].every(Number.isFinite)
      )
        return;
      const acceleration = { x, y, z };
      const gravity = getBottleGravity(acceleration);
      runtime.gravity.x += (gravity.x - runtime.gravity.x) * 0.22;
      runtime.gravity.y += (gravity.y - runtime.gravity.y) * 0.22;
      const previous = runtime.lastAcceleration;
      const now = Date.now();
      if (
        previous &&
        Math.hypot(x - previous.x, y - previous.y, z - previous.z) > 1.25 &&
        now - runtime.lastShake > 650
      ) {
        shakeBottleParticles(runtime.particles, now);
        runtime.lastShake = now;
      }
      runtime.lastAcceleration = acceleration;
    };
    acquired = accelerometerHub.subscribe(listener, (status) => {
      if (
        cancelled ||
        !runtime.active ||
        runtime.sensorVersion !== version ||
        runtimes.get(this) !== runtime
      )
        return;
      if (status === 'running')
        this.setData({ hasMotion: true, motionHint: '轻轻倾斜或晃动手机，点一颗回忆回到那天。' });
      else if (status === 'error' || status === 'unavailable') {
        stopMotion(runtime);
        this.setData({ hasMotion: false, motionHint: MOTION_FALLBACK });
      }
    });
    if (cancelled) acquired();
  },

  prepareRenderer() {
    const runtime = runtimeFor(this);
    if (!runtime.context) return;
    const factory =
      typeof wx.createOffscreenCanvas === 'function'
        ? (width: number, height: number) => wx.createOffscreenCanvas({ type: '2d', width, height })
        : undefined;
    runtime.renderer = createBottleRenderer(runtime.particles, runtime.ratio, factory);
  },

  drawScene() {
    const runtime = runtimeFor(this);
    if (!runtime.context || !runtime.active) return;
    const context = runtime.context;
    context.setTransform(runtime.ratio, 0, 0, runtime.ratio, 0, 0);
    context.clearRect(0, 0, runtime.width, runtime.height);
    context.translate(runtime.offsetX, runtime.offsetY);
    context.scale(runtime.scale, runtime.scale);
    if (!runtime.renderer) this.prepareRenderer();
    runtime.renderer?.draw(context, runtime.particles);
  },

  startScene() {
    const runtime = runtimeFor(this);
    if (!runtime.active || !runtime.canvas || !runtime.context) return;
    try {
      this.drawScene();
    } catch {
      this.canvasUnavailable();
      return;
    }
    if (this.data.isLoading || this.data.errorMessage || runtime.particles.length === 0) {
      stopAnimation(runtime);
      stopMotion(runtime);
      return;
    }
    this.startMotion();
    if (runtime.frameId !== null) return;
    const tick = (timestamp: number) => {
      runtime.frameId = null;
      if (!runtime.active || !runtime.canvas || !runtime.context) return;
      const elapsed = runtime.lastFrame === null ? 1 / 60 : (timestamp - runtime.lastFrame) / 1000;
      runtime.lastFrame = timestamp;
      stepBottle(runtime.particles, runtime.gravity, elapsed);
      try {
        this.drawScene();
      } catch {
        this.canvasUnavailable();
        return;
      }
      runtime.frameId = runtime.canvas.requestAnimationFrame(tick);
    };
    runtime.frameId = runtime.canvas.requestAnimationFrame(tick);
  },

  shakeBottle() {
    const runtime = runtimeFor(this);
    if (!runtime.active || this.data.isLoading || this.data.errorMessage) return;
    shakeBottleParticles(runtime.particles, Date.now());
    this.startScene();
  },

  handleTouchStart(event: BottleTouch) {
    const runtime = runtimeFor(this);
    const point = touchPoint(event, runtime, false);
    runtime.touch = point ? { point, time: Date.now() } : null;
  },

  handleTouchEnd(event: BottleTouch) {
    const runtime = runtimeFor(this);
    const start = runtime.touch;
    runtime.touch = null;
    const point = touchPoint(event, runtime, true);
    if (
      !start ||
      !point ||
      Date.now() - start.time > 600 ||
      Math.hypot(start.point.x - point.x, start.point.y - point.y) > 10
    )
      return;
    const id = hitTestBottle(runtime.particles, point.x, point.y);
    if (id) this.openMemoryId(id);
  },

  handleTouchCancel() {
    runtimeFor(this).touch = null;
  },

  openMemory(event: WechatMiniprogram.BaseEvent) {
    const id = (event.currentTarget.dataset as { memoryId?: unknown }).memoryId;
    if (typeof id === 'string') this.openMemoryId(id);
  },

  openMemoryId(id: string) {
    const runtime = runtimeFor(this);
    if (
      !runtime.active ||
      this.data.isLoading ||
      this.data.errorMessage ||
      !runtime.memories.some((item) => item.id === id)
    )
      return;
    this.setData({ actionMessage: '' });
    void wx.navigateTo({
      url: '/pages/detail/index?memoryId=' + encodeURIComponent(id),
      fail: () => {
        if (runtime.active && runtimes.get(this) === runtime)
          this.setData({ actionMessage: '这段回忆暂时没有打开，请再点一次重试。' });
      },
    });
  },

  toggleMemoryList() {
    this.setData({ isListOpen: this.data.isCanvasUnavailable || !this.data.isListOpen });
  },

  goToMap() {
    void wx.switchTab({
      url: '/pages/map/index',
      fail: () => this.setData({ actionMessage: '地图暂时没有打开，请稍后重试。' }),
    });
  },
});
