import { stickerDraftService } from '../../services/sticker-draft-service';
import { SAFETY_IMAGE_MAX_BYTES } from '../../services/image-safety-service';
import {
  STICKER_COLORS,
  STICKER_MAX_POINTS,
  STICKER_SIZE,
  STICKER_STAMPS,
  StickerHistory,
  appendStickerLayer,
  createStickerDocument,
  createStampLayer,
  createStrokeLayer,
  createTextLayer,
  hasStickerContent,
  hitTestSticker,
  removeStickerLayer,
  transformStickerLayer,
  type StickerDocument,
  type StickerObject,
  type StickerPoint,
  type StickerStroke,
} from '../../utils/sticker-document';
import { drawStickerStamp, renderSticker, type StickerContext } from './sticker-renderer';

interface Touch {
  x?: number;
  y?: number;
  clientX?: number;
  clientY?: number;
}
interface TouchEvent {
  touches?: readonly Touch[];
  changedTouches?: readonly Touch[];
}
interface CanvasInfo {
  node?: WechatMiniprogram.Canvas;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}
interface ObjectGesture {
  layer: StickerObject;
  start: StickerPoint;
  distance: number;
  angle: number;
}
interface StudioRuntime {
  active: boolean;
  disposed: boolean;
  version: number;
  history: StickerHistory;
  canvas: WechatMiniprogram.Canvas | null;
  context: StickerContext | null;
  left: number;
  pageTop: number;
  scrollTop: number;
  width: number;
  stroke: StickerStroke | null;
  gesture: ObjectGesture | null;
  live: StickerDocument | null;
  frame: number | null;
  delivered: boolean;
  changed: boolean;
}
const runtimes = new WeakMap<object, StudioRuntime>();
function runtimeFor(page: object): StudioRuntime {
  let runtime = runtimes.get(page);
  if (!runtime) {
    runtime = {
      active: true,
      disposed: false,
      version: 0,
      history: new StickerHistory(),
      canvas: null,
      context: null,
      left: 0,
      pageTop: 0,
      scrollTop: 0,
      width: 300,
      stroke: null,
      gesture: null,
      live: null,
      frame: null,
      delivered: false,
      changed: false,
    };
    runtimes.set(page, runtime);
  }
  return runtime;
}
function pointOf(touch: Touch | undefined, r: StudioRuntime): StickerPoint | null {
  if (!touch) return null;
  const x = Number.isFinite(touch.x) ? touch.x! : (touch.clientX ?? NaN) - r.left;
  const y = Number.isFinite(touch.y)
    ? touch.y!
    : (touch.clientY ?? NaN) - (r.pageTop - r.scrollTop);
  if (!Number.isFinite(x) || !Number.isFinite(y) || r.width <= 0) return null;
  return {
    x: Math.max(0, Math.min(STICKER_SIZE, (x / r.width) * STICKER_SIZE)),
    y: Math.max(0, Math.min(STICKER_SIZE, (y / r.width) * STICKER_SIZE)),
  };
}
function center(a: StickerPoint, b: StickerPoint | null): StickerPoint {
  return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a;
}
function distance(a: StickerPoint, b: StickerPoint | null): number {
  return b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
}
function angle(a: StickerPoint, b: StickerPoint | null): number {
  return b ? (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI : 0;
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : '创作暂时未能完成，请重试。';
}
function stampsInCategory(category: string): (typeof STICKER_STAMPS)[number][] {
  return STICKER_STAMPS.filter((stamp) => stamp.category === category);
}

Page({
  data: {
    ready: false,
    tool: 'pen',
    colors: STICKER_COLORS,
    color: '#35402e',
    penWidth: 4,
    background: 'transparent',
    canUndo: false,
    canRedo: false,
    hasContent: false,
    layerCount: 0,
    selectedId: '',
    selectedIsText: false,
    selectedScale: 100,
    selectedRotation: 0,
    textInput: '',
    textLimit: 60,
    category: 'daily',
    categories: [
      { id: 'daily', label: '日常小事' },
      { id: 'campus', label: '在山大' },
      { id: 'nature', label: '花草天气' },
    ],
    stamps: stampsInCategory('daily'),
    phrases: [
      '今天也很棒',
      '图书馆的傍晚',
      '课后喝一杯',
      '和朋友在一起',
      '慢慢来就好',
      '记住这一刻',
    ],
    notice: '',
    draftNotice: '创作草稿只保存在本机。',
    isExporting: false,
    hasAdded: false,
    tools: [
      { id: 'pen', label: '画笔', icon: 'edit' },
      { id: 'eraser', label: '橡皮', icon: 'clear' },
      { id: 'text', label: '文字', icon: 'textbox' },
      { id: 'stamp', label: '素材', icon: 'sticker' },
      { id: 'select', label: '调整', icon: 'move' },
    ],
  },
  onLoad() {
    const r = runtimeFor(this);
    try {
      const draft = stickerDraftService.read();
      if (draft) {
        r.history = new StickerHistory(draft);
        this.setData({
          draftNotice: draft.layers.length
            ? '已恢复上次创作，可继续画，也可清空重来。'
            : '创作草稿只保存在本机。',
        });
      }
    } catch {
      this.setData({ draftNotice: '上次草稿暂时无法读取，新创作前请留意本机空间。' });
    }
    this.syncDocument();
  },
  onShow() {
    const r = runtimeFor(this);
    r.active = true;
    if (r.canvas) this.drawNow();
  },
  onReady() {
    this.initCanvas();
  },
  onPageScroll(event: WechatMiniprogram.Page.IPageScrollOption) {
    runtimeFor(this).scrollTop = event.scrollTop;
  },
  onResize() {
    this.touchCancel();
    // initCanvas invalidates pending exports; release their UI lock as well.
    this.setData({ isExporting: false });
    this.initCanvas();
  },
  initCanvas() {
    const r = runtimeFor(this),
      version = ++r.version;
    this.setData({ ready: false });
    try {
      wx.createSelectorQuery()
        .in(this)
        .select('#sticker-canvas')
        .fields({ node: true, size: true, rect: true })
        .exec((values: unknown[]) => {
          if (r.disposed || !r.active || version !== r.version) return;
          const info = values[0] as CanvasInfo | undefined;
          try {
            if (!info?.node || !info.width || !info.height)
              throw new Error('画布暂时无法打开，点下方重试；草稿仍保留。');
            r.canvas = info.node;
            r.context = info.node.getContext('2d');
            r.width = info.width;
            r.left = info.left ?? 0;
            r.pageTop = (info.top ?? 0) + r.scrollTop;
            // Render at 3x; export at 2x within the existing cloud image dimension limits.
            r.canvas.width = 1080;
            r.canvas.height = 1080;
            this.setData({ ready: true, notice: '' });
            this.drawNow();
            this.drawPalette();
          } catch (error: unknown) {
            r.canvas = null;
            r.context = null;
            this.setData({ ready: false, notice: message(error) });
          }
        });
    } catch {
      this.setData({ ready: false, notice: '画布暂时无法打开，点下方重试；草稿仍保留。' });
    }
  },
  drawPalette() {
    const r = runtimeFor(this),
      version = r.version,
      stamps = this.data.stamps;
    if (this.data.tool !== 'stamp' || !r.active || r.disposed) return;
    try {
      wx.createSelectorQuery()
        .in(this)
        .selectAll('.stamp-preview')
        .fields({ node: true, size: true })
        .exec((values: unknown[]) => {
          if (r.disposed || !r.active || version !== r.version) return;
          const infos = values[0] as CanvasInfo[] | undefined;
          if (!Array.isArray(infos)) return;
          infos.forEach((info, index) => {
            if (!info.node || !stamps[index]) return;
            info.node.width = 160;
            info.node.height = 140;
            const ctx = info.node.getContext('2d');
            ctx.clearRect(0, 0, 160, 140);
            ctx.save();
            ctx.translate(80, 70);
            ctx.scale(1.15, 1.15);
            drawStickerStamp(ctx, stamps[index].id, this.data.color);
            ctx.restore();
          });
        });
    } catch {
      /* Labels remain usable if a preview canvas is unavailable. */
    }
  },
  drawNow(exportOnly = false, transparent = false) {
    const r = runtimeFor(this);
    if (!r.context || !r.canvas || r.disposed) return;
    let doc = r.live ?? r.history.document;
    if (r.stroke) {
      try {
        doc = appendStickerLayer(doc, r.stroke);
      } catch {
        /* Existing content remains visible at the limit. */
      }
    }
    r.context.setTransform(3, 0, 0, 3, 0, 0);
    renderSticker(
      r.context,
      transparent ? { ...doc, background: 'transparent' } : doc,
      exportOnly ? '' : this.data.selectedId,
    );
  },
  scheduleDraw() {
    const r = runtimeFor(this);
    if (r.frame !== null || !r.canvas || !r.active) return;
    r.frame = r.canvas.requestAnimationFrame(() => {
      r.frame = null;
      if (r.active && !r.disposed) this.drawNow();
    });
  },
  syncDocument() {
    const r = runtimeFor(this),
      doc = r.history.document;
    const selected = doc.layers.find(
      (l) => l.id === this.data.selectedId && l.kind !== 'stroke',
    ) as StickerObject | undefined;
    this.setData({
      background: doc.background,
      layerCount: doc.layers.length,
      canUndo: r.history.canUndo,
      canRedo: r.history.canRedo,
      hasContent: hasStickerContent(doc),
      selectedId: selected?.id ?? '',
      selectedIsText: selected?.kind === 'text',
      selectedScale: Math.round((selected?.scale ?? 1) * 100),
      selectedRotation: Math.round(selected?.rotation ?? 0),
    });
    this.drawNow();
  },
  commit(doc: StickerDocument) {
    const r = runtimeFor(this);
    if (r.disposed || this.data.isExporting || r.delivered) return;
    try {
      r.history.commit(doc);
      r.changed = true;
      this.setData({ notice: '' });
      this.syncDocument();
      this.saveDraft();
    } catch (error: unknown) {
      this.setData({ notice: message(error) });
    }
  },
  saveDraft() {
    const r = runtimeFor(this);
    if (!r.changed) return;
    try {
      stickerDraftService.save(r.history.document);
      this.setData({ draftNotice: '创作草稿已存本机，下次可以接着画。' });
    } catch {
      this.setData({ draftNotice: '草稿未能保存，当前画面仍在；请先加入日记，或腾出本机空间。' });
    }
  },
  chooseTool(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isExporting || runtimeFor(this).delivered) return;
    const tool = String(event.currentTarget.dataset.tool);
    if (!this.data.tools.some((t) => t.id === tool)) return;
    this.touchCancel();
    const layer = runtimeFor(this).history.document.layers.find(
      (l) => l.id === this.data.selectedId,
    );
    this.setData(
      {
        tool,
        selectedId: ['pen', 'eraser'].includes(tool) ? '' : this.data.selectedId,
        textInput: tool === 'text' && layer?.kind === 'text' ? layer.text : this.data.textInput,
      },
      () => this.drawPalette(),
    );
    this.drawNow();
  },
  chooseColor(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isExporting) return;
    const color = String(event.currentTarget.dataset.color);
    if (!STICKER_COLORS.includes(color)) return;
    this.setData({ color });
    if (this.data.selectedId)
      this.commit(
        transformStickerLayer(runtimeFor(this).history.document, this.data.selectedId, { color }),
      );
    this.drawPalette();
  },
  changeWidth(event: WechatMiniprogram.SliderChange) {
    if (!this.data.isExporting)
      this.setData({ penWidth: Math.max(1, Math.min(24, event.detail.value)) });
  },
  handleTextInput(event: WechatMiniprogram.Input) {
    if (!this.data.isExporting) this.setData({ textInput: event.detail.value.slice(0, 60) });
  },
  choosePhrase(event: WechatMiniprogram.BaseEvent) {
    if (!this.data.isExporting)
      this.setData({ textInput: String(event.currentTarget.dataset.text).slice(0, 60) });
  },
  addText() {
    if (!this.data.textInput.trim() || this.data.isExporting) return;
    const r = runtimeFor(this),
      doc = r.history.document;
    try {
      const selected = doc.layers.find((l) => l.id === this.data.selectedId);
      if (selected?.kind === 'text' && this.data.tool === 'text')
        this.commit(
          transformStickerLayer(doc, selected.id, {
            text: this.data.textInput.trim(),
            color: this.data.color,
          }),
        );
      else {
        const layer = createTextLayer(this.data.textInput, this.data.color);
        this.setData({ selectedId: layer.id, tool: 'select' });
        this.commit(appendStickerLayer(doc, layer));
      }
    } catch (error: unknown) {
      this.setData({ notice: message(error) });
    }
  },
  chooseCategory(event: WechatMiniprogram.BaseEvent) {
    const category = String(event.currentTarget.dataset.id);
    if (!this.data.categories.some((c) => c.id === category) || this.data.isExporting) return;
    this.setData({ category, stamps: STICKER_STAMPS.filter((s) => s.category === category) }, () =>
      this.drawPalette(),
    );
  },
  addStamp(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isExporting) return;
    try {
      const layer = createStampLayer(String(event.currentTarget.dataset.id), this.data.color);
      this.setData({ selectedId: layer.id, tool: 'select' });
      this.commit(appendStickerLayer(runtimeFor(this).history.document, layer));
    } catch (error: unknown) {
      this.setData({ notice: message(error) });
    }
  },
  changeTransform(event: WechatMiniprogram.SliderChange) {
    const kind = String(event.currentTarget.dataset.kind);
    if (!this.data.selectedId || this.data.isExporting || !Number.isFinite(event.detail.value))
      return;
    this.commit(
      transformStickerLayer(
        runtimeFor(this).history.document,
        this.data.selectedId,
        kind === 'scale' ? { scale: event.detail.value / 100 } : { rotation: event.detail.value },
      ),
    );
  },
  editSelectedText() {
    this.setData({ tool: 'text' });
    const layer = runtimeFor(this).history.document.layers.find(
      (l) => l.id === this.data.selectedId,
    );
    if (layer?.kind === 'text') this.setData({ textInput: layer.text });
  },
  removeSelected() {
    if (!this.data.isExporting)
      this.commit(removeStickerLayer(runtimeFor(this).history.document, this.data.selectedId));
  },
  toggleBackground() {
    const doc = runtimeFor(this).history.document;
    this.commit({ ...doc, background: doc.background === 'paper' ? 'transparent' : 'paper' });
  },
  undo() {
    const r = runtimeFor(this);
    if (this.data.isExporting || r.delivered) return;
    this.touchCancel();
    r.history.undo();
    r.changed = true;
    this.syncDocument();
    this.saveDraft();
  },
  redo() {
    const r = runtimeFor(this);
    if (this.data.isExporting || r.delivered) return;
    this.touchCancel();
    r.history.redo();
    r.changed = true;
    this.syncDocument();
    this.saveDraft();
  },
  clearCanvas() {
    if (this.data.isExporting) return;
    const r = runtimeFor(this),
      version = r.version;
    wx.showModal({
      title: '开始一张新的贴纸？',
      content: '当前画布会清空，在本页还能用撤销找回。已加入日记的成品不受影响。',
      confirmText: '清空画布',
      success: (result) => {
        if (result.confirm && r.active && !r.disposed && r.version === version)
          this.commit(createStickerDocument());
      },
    });
  },
  touchStart(event: TouchEvent) {
    const r = runtimeFor(this);
    if (!this.data.ready || this.data.isExporting || r.disposed || r.delivered) return;
    const first = pointOf(event.touches?.[0], r),
      second = pointOf(event.touches?.[1], r);
    if (!first) return;
    if (['pen', 'eraser'].includes(this.data.tool)) {
      if (second) {
        this.touchCancel();
        return;
      }
      r.stroke = createStrokeLayer(
        [first],
        this.data.color,
        this.data.tool === 'eraser' ? this.data.penWidth * 1.5 : this.data.penWidth,
        this.data.tool === 'eraser',
      );
    } else {
      const doc = r.live ?? r.history.document;
      const id = second && this.data.selectedId ? this.data.selectedId : hitTestSticker(doc, first);
      const layer = doc.layers.find((l) => l.id === id);
      this.setData({ selectedId: id, selectedIsText: layer?.kind === 'text' });
      r.gesture =
        layer && layer.kind !== 'stroke'
          ? {
              layer,
              start: center(first, second),
              distance: distance(first, second),
              angle: angle(first, second),
            }
          : null;
      if (layer && layer.kind !== 'stroke')
        this.setData({
          selectedScale: Math.round(layer.scale * 100),
          selectedRotation: Math.round(layer.rotation),
        });
    }
    this.drawNow();
  },
  touchMove(event: TouchEvent) {
    const r = runtimeFor(this),
      first = pointOf(event.touches?.[0], r),
      second = pointOf(event.touches?.[1], r);
    if (!first || this.data.isExporting || !r.active) return;
    if (r.stroke) {
      if (second) {
        this.touchCancel();
        return;
      }
      const previous = r.stroke.points[r.stroke.points.length - 1]!;
      if (
        r.stroke.points.length < STICKER_MAX_POINTS &&
        Math.hypot(first.x - previous.x, first.y - previous.y) >= 1
      )
        r.stroke.points.push(first);
    } else if (r.gesture) {
      const g = r.gesture,
        c = center(first, second);
      r.live = transformStickerLayer(r.history.document, g.layer.id, {
        x: g.layer.x + c.x - g.start.x,
        y: g.layer.y + c.y - g.start.y,
        scale:
          g.distance > 0 && second
            ? (g.layer.scale * distance(first, second)) / g.distance
            : g.layer.scale,
        rotation:
          g.distance > 0 && second
            ? g.layer.rotation + angle(first, second) - g.angle
            : g.layer.rotation,
      });
    }
    this.scheduleDraw();
  },
  touchEnd(event: TouchEvent) {
    const r = runtimeFor(this);
    if (event.touches?.length && r.gesture) {
      this.touchStart(event);
      return;
    }
    if (this.data.isExporting || !r.active) {
      this.touchCancel();
      return;
    }
    try {
      if (r.stroke) {
        const stroke = r.stroke;
        r.stroke = null;
        this.commit(appendStickerLayer(r.history.document, stroke));
      } else if (r.live) {
        const doc = r.live;
        r.live = null;
        this.commit(doc);
      }
    } catch (error: unknown) {
      this.setData({ notice: message(error) });
    }
    r.gesture = null;
    r.stroke = null;
    r.live = null;
    this.drawNow();
  },
  touchCancel() {
    const r = runtimeFor(this);
    r.stroke = null;
    r.gesture = null;
    r.live = null;
    this.drawNow();
  },
  async addToDiary() {
    const r = runtimeFor(this);
    if (r.delivered) {
      this.returnToDiary();
      return;
    }
    if (this.data.isExporting || !this.data.ready || !r.active || r.disposed) return;
    this.touchEnd({});
    if (!hasStickerContent(r.history.document)) {
      this.setData({ notice: '先画一笔、写句话，或放一张素材吧。' });
      return;
    }
    const version = ++r.version;
    this.setData({ isExporting: true, notice: '' });
    this.saveDraft();
    if (r.frame !== null && r.canvas) {
      r.canvas.cancelAnimationFrame(r.frame);
      r.frame = null;
    }
    try {
      // Test actual visible ink on transparent content, including a fully erased drawing.
      this.drawNow(true, true);
      const pixels = r.context!.getImageData(0, 0, 1080, 1080).data;
      let visible = false;
      for (let i = 3; i < pixels.length; i += 4)
        if (pixels[i]! > 8) {
          visible = true;
          break;
        }
      if (!visible) throw new Error('画布现在是空白，再留下一个小记号吧。');
      this.drawNow(true);
      const path = await new Promise<string>((resolve, reject) => {
        wx.canvasToTempFilePath(
          {
            canvas: r.canvas!,
            x: 0,
            y: 0,
            width: 1080,
            height: 1080,
            destWidth: 720,
            destHeight: 720,
            fileType: 'png',
            success: (result) => resolve(result.tempFilePath),
            fail: () => reject(new Error('贴纸导出失败，画面和草稿仍保留，请重试。')),
          },
          this,
        );
      });
      // Keep the PNG inside the existing safety limits so photos' JPEG compression
      // is never needed for a sticker, preserving its alpha channel in cloud mode.
      const bytes = await new Promise<number>((resolve, reject) => {
        wx.getFileSystemManager().getFileInfo({
          filePath: path,
          success: (result) => resolve(result.size),
          fail: () => reject(new Error('贴纸文件暂时无法读取，请重新制作；草稿仍保留。')),
        });
      });
      if (!Number.isFinite(bytes) || bytes <= 0 || bytes > SAFETY_IMAGE_MAX_BYTES) {
        throw new Error('这张贴纸内容有些多，请撤销部分笔画后重新加入；草稿仍保留。');
      }
      if (!r.active || r.disposed || version !== r.version) return;
      const channel = this.getOpenerEventChannel();
      if (typeof channel?.emit !== 'function')
        throw new Error('请从写日记页面打开创作，草稿已保留。');
      channel.emit('stickerCreated', { path });
      r.delivered = true;
      this.setData({ hasAdded: true, isExporting: false });
      this.returnToDiary();
    } catch (error: unknown) {
      if (r.active && !r.disposed && version === r.version)
        this.setData({ notice: message(error), isExporting: false });
    } finally {
      if (r.active && !r.disposed && version === r.version) {
        this.setData({ isExporting: false });
        this.drawNow();
      }
    }
  },
  returnToDiary() {
    void wx.navigateBack({
      delta: 1,
      fail: () => {
        if (!runtimeFor(this).disposed)
          this.setData({ notice: '返回日记未完成，请使用左上角返回；作品和草稿仍保留。' });
      },
    });
  },
  onHide() {
    const r = runtimeFor(this);
    if (!this.data.isExporting) this.touchEnd({});
    this.saveDraft();
    r.active = false;
    r.version++;
    if (r.frame !== null && r.canvas) r.canvas.cancelAnimationFrame(r.frame);
    r.frame = null;
    this.setData({ isExporting: false });
  },
  onUnload() {
    void this.onHide();
    const r = runtimeFor(this);
    r.disposed = true;
    r.canvas = null;
    r.context = null;
  },
});
