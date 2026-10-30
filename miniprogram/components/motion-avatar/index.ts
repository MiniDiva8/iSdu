import { AvatarMotion, AVATAR_BALL_RADIUS } from '../../utils/avatar-motion';
import { accelerometerHub, type MotionStatus } from '../../services/accelerometer-hub';
import { createAvatarRenderer } from '../../utils/avatar-motion-renderer';

type Canvas = WechatMiniprogram.Canvas;
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

interface AvatarHost {
  data: {
    size: number;
    mood: string;
    initial: string;
    active: boolean;
    motionEnabled: boolean;
    reducedMotion: boolean;
    motionStatus: string;
    poseStyle: string;
    safeSize: number;
  };
  setData(data: Record<string, unknown>): void;
  triggerEvent(name: string, detail: Record<string, unknown>): void;
}
interface Runtime {
  model: AvatarMotion;
  timer: ReturnType<typeof setTimeout> | null;
  release: (() => void) | null;
  visible: boolean;
  disposed: boolean;
  lastFrame: number;
  frameId: number | null;
  frameTime: number | null;
  canvas: Canvas | null;
  context: Context | null;
  renderer: ReturnType<typeof createAvatarRenderer> | null;
  ready: boolean;
  queryVersion: number;
  querying: boolean;
  canvasFailed: boolean;
  loopVersion: number;
}
const runtimes = new WeakMap<object, Runtime>();
const hostOf = (host: unknown) => host as AvatarHost;
function sizeOf(host: AvatarHost) {
  const value = host.data.size;
  return Number.isFinite(value) ? Math.max(128, Math.min(360, value)) : 176;
}
function canAnimate(host: AvatarHost, runtime: Runtime) {
  return !runtime.disposed && runtime.visible && host.data.active && !host.data.reducedMotion;
}
function paint(host: AvatarHost, runtime: Runtime) {
  const pose = runtime.model.snapshot();
  const size = sizeOf(host),
    radius = size / 2 - 10,
    diameter = radius * AVATAR_BALL_RADIUS * 2;
  const style =
    'translate3d(' +
    (pose.x * radius).toFixed(2) +
    'rpx,' +
    (pose.y * radius).toFixed(2) +
    'rpx,0) rotate(' +
    ((pose.angle * 180) / Math.PI).toFixed(2) +
    'deg)';
  const patch: Record<string, unknown> = {};
  if (!runtime.canvas && style !== host.data.poseStyle) patch.poseStyle = style;
  if (host.data.safeSize !== size)
    Object.assign(patch, {
      safeSize: size,
      ballSize: diameter,
      ballOffset: -diameter / 2,
      faceScale: diameter / 94,
    });
  if (Object.keys(patch).length) host.setData(patch);
  if (runtime.canvas && runtime.context) {
    try {
      if (!runtime.renderer) {
        const factory =
          typeof wx.createOffscreenCanvas === 'function'
            ? (width: number, height: number) =>
                wx.createOffscreenCanvas({ type: '2d', width, height })
            : undefined;
        runtime.renderer = createAvatarRenderer(
          host.data.mood,
          size,
          runtime.canvas.width / size,
          factory,
        );
      }
      runtime.context.setTransform(
        runtime.canvas.width / size,
        0,
        0,
        runtime.canvas.height / size,
        0,
        0,
      );
      runtime.renderer.draw(runtime.context, pose);
    } catch {
      fallbackCanvas(host, runtime);
    }
  }
}
function clearLoop(runtime: Runtime) {
  runtime.loopVersion++;
  if (runtime.timer !== null) clearTimeout(runtime.timer);
  runtime.timer = null;
  const frameId = runtime.frameId;
  runtime.frameId = null;
  runtime.frameTime = null;
  if (frameId !== null && runtime.canvas) {
    try {
      runtime.canvas.cancelAnimationFrame(frameId);
    } catch {
      /* The loop version still rejects callbacks from a disposed native node. */
    }
  }
}
function fallbackCanvas(host: AvatarHost, runtime: Runtime) {
  clearLoop(runtime);
  runtime.canvas = null;
  runtime.context = null;
  runtime.renderer = null;
  runtime.canvasFailed = true;
  host.setData({ canvasReady: false });
  paint(host, runtime);
}
function requestFrame(host: AvatarHost, runtime: Runtime, frame: (timestamp: number) => void) {
  try {
    if (runtime.canvas) runtime.frameId = runtime.canvas.requestAnimationFrame(frame);
  } catch {
    fallbackCanvas(host, runtime);
    wake(host, runtime);
  }
}
function prepareCanvas(host: AvatarHost, runtime: Runtime) {
  if (
    !runtime.ready ||
    !canAnimate(host, runtime) ||
    runtime.canvas ||
    runtime.querying ||
    runtime.canvasFailed ||
    typeof wx.createSelectorQuery !== 'function'
  )
    return;
  const version = ++runtime.queryVersion;
  runtime.querying = true;
  try {
    wx.createSelectorQuery()
      .in(host as unknown as WechatMiniprogram.Component.TrivialInstance)
      .select('#motion-avatar-canvas')
      .fields({ node: true, size: true })
      .exec((results: { node?: Canvas; width?: number; height?: number }[]) => {
        if (
          version !== runtime.queryVersion ||
          runtimes.get(host) !== runtime ||
          !canAnimate(host, runtime)
        )
          return;
        runtime.querying = false;
        try {
          const result = results[0];
          const canvas = result?.node;
          if (
            !canvas ||
            !result?.width ||
            !result.height ||
            typeof canvas.requestAnimationFrame !== 'function' ||
            typeof canvas.cancelAnimationFrame !== 'function'
          )
            throw new Error('Canvas unavailable');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas unsupported');
          let ratio = 1;
          try {
            ratio =
              typeof wx.getWindowInfo === 'function'
                ? wx.getWindowInfo().pixelRatio
                : wx.getSystemInfoSync().pixelRatio;
          } catch {
            /* The default ratio still renders a usable face. */
          }
          ratio = Number.isFinite(ratio) ? Math.max(1, Math.min(2, ratio)) : 1;
          clearLoop(runtime);
          canvas.width = Math.round(result.width * ratio);
          canvas.height = Math.round(result.height * ratio);
          runtime.canvas = canvas;
          runtime.context = context;
          runtime.renderer = null;
          host.setData({ canvasReady: true });
          paint(host, runtime);
          if (!runtime.model.isSettled()) wake(host, runtime);
        } catch {
          runtime.canvasFailed = true;
        }
      });
  } catch {
    runtime.querying = false;
    runtime.canvasFailed = true;
  }
}
function releaseMotion(runtime: Runtime) {
  const release = runtime.release;
  runtime.release = null;
  release?.();
}
function status(host: AvatarHost, value: MotionStatus | 'static' | 'paused' | 'reduced') {
  if (host.data.motionStatus === value) return;
  host.setData({ motionStatus: value });
  host.triggerEvent('motionstatechange', { status: value });
}
function wake(host: AvatarHost, runtime: Runtime) {
  if (!canAnimate(host, runtime) || runtime.timer !== null || runtime.frameId !== null) return;
  const version = runtime.loopVersion;
  if (runtime.canvas) {
    runtime.frameTime = null;
    const frame = (timestamp: number) => {
      if (version !== runtime.loopVersion) return;
      runtime.frameId = null;
      if (!canAnimate(host, runtime) || !runtime.canvas) return;
      runtime.model.advance(runtime.frameTime === null ? 1000 / 60 : timestamp - runtime.frameTime);
      runtime.frameTime = timestamp;
      paint(host, runtime);
      if (!runtime.model.isSettled()) {
        if (runtime.canvas) requestFrame(host, runtime, frame);
        else wake(host, runtime);
      }
    };
    requestFrame(host, runtime, frame);
    return;
  }
  runtime.lastFrame = Date.now();
  const frame = () => {
    if (version !== runtime.loopVersion) return;
    runtime.timer = null;
    if (!canAnimate(host, runtime)) return;
    const now = Date.now();
    runtime.model.advance(now - runtime.lastFrame);
    runtime.lastFrame = now;
    paint(host, runtime);
    if (!runtime.model.isSettled()) runtime.timer = setTimeout(frame, 33);
  };
  runtime.timer = setTimeout(frame, 33);
}
function sync(host: AvatarHost) {
  const runtime = runtimes.get(host);
  if (!runtime || runtime.disposed) return;
  if (!canAnimate(host, runtime)) {
    runtime.queryVersion++;
    runtime.querying = false;
    clearLoop(runtime);
    releaseMotion(runtime);
    if (host.data.reducedMotion) {
      runtime.model.reset();
      paint(host, runtime);
    }
    status(host, host.data.reducedMotion ? 'reduced' : 'paused');
    return;
  }
  prepareCanvas(host, runtime);
  if (host.data.motionEnabled) {
    if (!runtime.release) {
      let acquired: (() => void) | null = null;
      let cancelled = false;
      runtime.release = () => {
        cancelled = true;
        acquired?.();
      };
      acquired = accelerometerHub.subscribe(
        (sample) => {
          if (cancelled || !canAnimate(host, runtime) || !host.data.motionEnabled) return;
          if (runtime.model.acceptAcceleration(sample)) wake(host, runtime);
        },
        (value) => {
          if (!cancelled && canAnimate(host, runtime) && host.data.motionEnabled)
            status(host, value);
        },
      );
      if (cancelled) acquired();
    }
  } else {
    if (runtime.release) {
      clearLoop(runtime);
      runtime.model.reset();
      paint(host, runtime);
    }
    releaseMotion(runtime);
    status(host, 'static');
  }
  if (!runtime.model.isSettled()) wake(host, runtime);
}
Component({
  properties: {
    mood: { type: String, value: 'calm' },
    initial: { type: String, value: '' },
    size: { type: Number, value: 176 },
    active: { type: Boolean, value: true },
    motionEnabled: { type: Boolean, value: false },
    reducedMotion: { type: Boolean, value: false },
    label: { type: String, value: '编辑个人资料' },
  },
  data: {
    safeSize: 176,
    ballSize: 71.76,
    ballOffset: -35.88,
    faceScale: 71.76 / 94,
    poseStyle: '',
    motionStatus: 'static',
    canvasReady: false,
  },
  observers: {
    'active,motionEnabled,reducedMotion'() {
      sync(hostOf(this));
    },
    'size,mood'() {
      const runtime = runtimes.get(this);
      if (runtime) {
        runtime.renderer = null;
        paint(hostOf(this), runtime);
      }
    },
  },
  lifetimes: {
    attached() {
      const runtime: Runtime = {
        model: new AvatarMotion(),
        timer: null,
        release: null,
        visible: true,
        disposed: false,
        lastFrame: Date.now(),
        frameId: null,
        frameTime: null,
        canvas: null,
        context: null,
        renderer: null,
        ready: false,
        queryVersion: 0,
        querying: false,
        canvasFailed: false,
        loopVersion: 0,
      };
      runtimes.set(this, runtime);
      paint(hostOf(this), runtime);
      sync(hostOf(this));
    },
    ready() {
      const runtime = runtimes.get(this);
      if (!runtime) return;
      runtime.ready = true;
      prepareCanvas(hostOf(this), runtime);
    },
    detached() {
      const runtime = runtimes.get(this);
      if (!runtime) return;
      runtime.disposed = true;
      clearLoop(runtime);
      releaseMotion(runtime);
      runtimes.delete(this);
    },
  },
  pageLifetimes: {
    show() {
      const runtime = runtimes.get(this);
      if (runtime) {
        runtime.visible = true;
        runtime.canvasFailed = false;
        sync(hostOf(this));
      }
    },
    hide() {
      const runtime = runtimes.get(this);
      if (runtime) {
        runtime.visible = false;
        sync(hostOf(this));
      }
    },
  },
  methods: {
    onActivate() {
      this.triggerEvent('activate', {});
    },
    setPreviewGravity(x: number, y: number) {
      const runtime = runtimes.get(this),
        host = hostOf(this);
      if (!runtime || !canAnimate(host, runtime) || host.data.motionEnabled) return;
      if (runtime.model.setGravity(x, y)) wake(host, runtime);
    },
    impulse(x: number, y: number) {
      const runtime = runtimes.get(this),
        host = hostOf(this);
      if (!runtime || !canAnimate(host, runtime) || host.data.motionEnabled) return;
      if (runtime.model.kick(x, y)) wake(host, runtime);
    },
    reset() {
      const runtime = runtimes.get(this);
      if (!runtime) return;
      runtime.model.reset();
      clearLoop(runtime);
      paint(hostOf(this), runtime);
    },
  },
});
