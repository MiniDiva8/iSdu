import type { CompanionState } from '../../../models/companion';
import { companionService } from '../../../services/companion-service';
import {
  createCompanionSceneRenderer,
  companionImageSources,
  type CompanionImages,
} from '../../../utils/companion-artwork';
import {
  companionTopInset,
  backFromCompanion,
  publicCompanionSnapshot,
  companionMessage,
} from '../../../services/companion-page';
interface PhotoRuntime {
  active: boolean;
  ready: boolean;
  version: number;
  canvas: WechatMiniprogram.Canvas | null;
  jobs: Set<() => void>;
}
const runtimes = new WeakMap<object, PhotoRuntime>();
function runtime(page: object) {
  let r = runtimes.get(page);
  if (!r) {
    r = { active: false, ready: false, version: 0, canvas: null, jobs: new Set() };
    runtimes.set(page, r);
  }
  return r;
}
Page({
  data: {
    topInset: 24,
    state: null as CompanionState | null,
    imagePath: '',
    busy: false,
    isLoading: true,
    actionMessage: '',
  },
  onLoad() {
    this.setData({ topInset: companionTopInset() });
  },
  onShow() {
    runtime(this).active = true;
    this.setData({ busy: false });
    try {
      this.setData({ state: companionService.read() });
    } catch (error) {
      this.setData({ isLoading: false, actionMessage: companionMessage(error) });
    }
    if (runtime(this).ready) void this.generatePhoto();
  },
  onReady() {
    runtime(this).ready = true;
    void this.generatePhoto();
  },
  onHide() {
    const r = runtime(this);
    r.active = false;
    r.version++;
    for (const finish of r.jobs) finish();
    r.jobs.clear();
  },
  onUnload() {
    void this.onHide();
    runtimes.delete(this);
  },
  back() {
    backFromCompanion();
  },
  async generatePhoto() {
    const r = runtime(this);
    if (!r.active || !r.ready || this.data.busy) return;
    const version = ++r.version;
    this.setData({ busy: true, isLoading: true, actionMessage: '' });
    try {
      const state = companionService.read(),
        snapshot = publicCompanionSnapshot(state);
      const canvas = await new Promise<WechatMiniprogram.Canvas>((resolve, reject) => {
        wx.createSelectorQuery()
          .in(this)
          .select('#companion-photo-canvas')
          .fields({ node: true, size: true })
          .exec((items: { node?: WechatMiniprogram.Canvas }[]) => {
            const c = items[0]?.node;
            if (c) resolve(c);
            else reject(new Error('卡片画布暂时没有准备好，请重试。'));
          });
      });
      if (!r.active || r.version !== version) return;
      r.canvas = canvas;
      canvas.width = 1200;
      canvas.height = 1920;
      const images: CompanionImages = new Map();
      let missing = false;
      await Promise.all(
        companionImageSources(snapshot).map(
          (src) =>
            new Promise<void>((resolve) => {
              let settled = false;
              const image = canvas.createImage();
              let timer: ReturnType<typeof setTimeout> | null = null;
              const finish = () => {
                if (settled) return;
                settled = true;
                if (timer !== null) clearTimeout(timer);
                r.jobs.delete(finish);
                resolve();
              };
              r.jobs.add(finish);
              image.onload = () => {
                if (r.active && r.version === version) images.set(src, image);
                finish();
              };
              image.onerror = () => {
                missing = true;
                finish();
              };
              timer = setTimeout(() => {
                missing = true;
                finish();
              }, 5000);
              image.src = src;
            }),
        ),
      );
      if (!r.active || r.version !== version) return;
      const ctx = canvas.getContext('2d');
      const renderer = createCompanionSceneRenderer(
        snapshot,
        { width: 600, height: 825 },
        2,
        images,
        typeof wx.createOffscreenCanvas === 'function'
          ? (w, h) => wx.createOffscreenCanvas({ type: '2d', width: w, height: h })
          : undefined,
      );
      renderer.draw(
        ctx,
        { x: 0.52, y: 0.72, moving: false, facing: 1 },
        { x: 0, y: 0, zoom: 1 },
        0,
      );
      renderer.dispose();
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.fillStyle = '#faf8ed';
      ctx.fillRect(0, 825, 600, 135);
      ctx.fillStyle = '#43583f';
      ctx.textAlign = 'center';
      ctx.font = '27px sans-serif';
      ctx.fillText(snapshot.name + ' 的校园小院', 300, 878);
      ctx.fillStyle = '#8c967c';
      ctx.font = '17px sans-serif';
      ctx.fillText('把普通的日子，住成喜欢的样子', 300, 918);
      const path = await new Promise<string>((resolve, reject) => {
        void wx.canvasToTempFilePath({
          canvas,
          destWidth: 1200,
          destHeight: 1920,
          fileType: 'png',
          success: (res) => resolve(res.tempFilePath),
          fail: () => reject(new Error('卡片暂时没有生成，请重试。')),
        });
      });
      if (r.active && r.version === version)
        this.setData({
          state,
          imagePath: path,
          isLoading: false,
          actionMessage: missing ? '部分素材暂未加载，卡片使用占位图。' : '',
        });
    } catch (error) {
      if (r.active && r.version === version)
        this.setData({ isLoading: false, actionMessage: companionMessage(error) });
    } finally {
      if (r.active && r.version === version) this.setData({ busy: false });
    }
  },
  async savePhoto() {
    const r = runtime(this);
    if (!r.active || !this.data.imagePath || this.data.busy) return;
    const version = r.version;
    this.setData({ busy: true });
    try {
      await new Promise<void>((resolve, reject) => {
        void wx.saveImageToPhotosAlbum({
          filePath: this.data.imagePath,
          success: () => resolve(),
          fail: () => reject(new Error('图片没有保存，请检查微信相册权限后重试。')),
        });
      });
      if (r.active && r.version === version)
        this.setData({ actionMessage: '小院合影已保存到相册。' });
    } catch (error) {
      if (r.active && r.version === version)
        this.setData({ actionMessage: companionMessage(error) });
    } finally {
      if (r.active && r.version === version) this.setData({ busy: false });
    }
  },
  onShareAppMessage() {
    return { title: '我的校园伙伴小屋', path: '/pages/journal/index' };
  },
});
