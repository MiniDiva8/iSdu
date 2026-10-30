import {
  MEMORY_MOODS,
  MEMORY_MOOD_LABELS,
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  isMemoryMood,
  isMemoryCategory,
} from '../../models/memory';
import { journalPreferencesService } from '../../services/journal-preferences-service';
import { createJournalTimestamp, getJournalDayKey } from '../../utils/journal';
import {
  normalizeWheelAngle,
  wheelPointAngle,
  wheelIndexAtRotation,
  wheelRotationForIndex,
  wheelReleaseRotation,
  type WheelPoint,
} from '../../utils/selection-wheel';

interface WheelOption {
  value: string;
  label: string;
  left: string;
  top: string;
  color: string;
  icon: string;
}
interface WheelGesture {
  identifier: number;
  center: WheelPoint;
  lastAngle: number;
  lastTime: number;
  velocity: number;
  distance: number;
}
const topicColors = [
  '#eadba5',
  '#e5bac8',
  '#e7c786',
  '#cad9ab',
  '#f0c39e',
  '#b6d4cb',
  '#c9bfd9',
  '#c0cedf',
  '#ddd7bd',
];
const topicIcons = [
  'location',
  'usergroup',
  'book',
  'sunny',
  'shop',
  'flag',
  'calendar',
  'heart',
  'edit',
];
function createOptions(kind: string): WheelOption[] {
  const values = kind === 'category' ? MEMORY_CATEGORIES : MEMORY_MOODS;
  return values.map((value, index) => {
    const angle = (index / values.length) * Math.PI * 2;
    return {
      value,
      label:
        isMemoryMood(value) && kind === 'mood'
          ? MEMORY_MOOD_LABELS[value]
          : MEMORY_CATEGORY_LABELS[value as keyof typeof MEMORY_CATEGORY_LABELS],
      left: (50 + Math.cos(angle) * 38.5).toFixed(3) + '%',
      top: (50 + Math.sin(angle) * 38.5).toFixed(3) + '%',
      color: topicColors[index % topicColors.length] ?? '#e7dcc0',
      icon: topicIcons[index % topicIcons.length] ?? 'book',
    };
  });
}
Page({
  _gesture: null as WheelGesture | null,
  _gestureGeneration: 0,
  _ignoreTapUntil: 0,
  _lastHaptic: 0,
  _active: true,
  data: {
    topInset: 24,
    stageSize: 360,
    kind: 'mood',
    source: 'editor',
    dateKey: '',
    options: [] as WheelOption[],
    selectedIndex: 0,
    selectedValue: '',
    selectedLabel: '',
    rotation: 0,
    counterRotation: 0,
    dragging: false,
    settling: false,
    defaultMood: 'calm',
    defaultCategory: 'campus-life',
    haptics: false,
    errorMessage: '',
    isReady: false,
    isSubmitting: false,
  },
  onLoad(query: Record<string, string | undefined>) {
    const prefs = journalPreferencesService.read();
    const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : null;
    const kind = query.kind === 'category' ? 'category' : 'mood';
    const source = query.source || 'editor';
    const options = createOptions(kind);
    const fallback = kind === 'mood' ? prefs.defaultMood : prefs.defaultCategory;
    const selectedIndex = Math.max(
      0,
      options.findIndex((option) => option.value === (query.value || fallback)),
    );
    this._active = true;
    this.setData({
      topInset: info?.statusBarHeight ?? 24,
      stageSize: Math.round(
        Math.min((info?.windowWidth ?? 375) - 12, (info?.windowHeight ?? 800) * 0.49, 430),
      ),
      kind,
      source,
      options,
      defaultMood: prefs.defaultMood,
      defaultCategory: prefs.defaultCategory,
      haptics: prefs.haptics,
      dateKey: query.date || getJournalDayKey(new Date().toISOString()),
    });
    try {
      if (!['journal', 'editor', 'preferences'].includes(source))
        throw new Error('选择入口无效，请返回后重试。');
      if (source === 'journal') createJournalTimestamp(this.data.dateKey, new Date().toISOString());
      this.applyRotation((-selectedIndex * 360) / options.length, false);
      this.setData({ isReady: true });
    } catch (error: unknown) {
      this.setData({
        errorMessage: error instanceof Error ? error.message : '选择页暂时无法打开。',
      });
    }
  },
  onShow() {
    this._active = true;
  },
  onHide() {
    this._active = false;
    this._gestureGeneration += 1;
    this._gesture = null;
  },
  onUnload() {
    this._active = false;
    this._gestureGeneration += 1;
    this._gesture = null;
  },
  applyRotation(rotation: number, settling: boolean) {
    rotation = rotation === 0 ? 0 : rotation;
    if (!this._active || this.data.options.length < 2) return;
    const selectedIndex = wheelIndexAtRotation(rotation, this.data.options.length);
    const selected = this.data.options[selectedIndex];
    if (!selected) return;
    if (
      selectedIndex !== this.data.selectedIndex &&
      this.data.haptics &&
      Date.now() - this._lastHaptic > 80
    ) {
      this._lastHaptic = Date.now();
      if (typeof wx.vibrateShort === 'function')
        void wx.vibrateShort({ type: 'light', fail: () => undefined });
    }
    this.setData({
      rotation,
      counterRotation: -rotation,
      selectedIndex,
      selectedValue: selected.value,
      selectedLabel: selected.label,
      settling,
    });
  },
  handleWheelTouchStart(event: WechatMiniprogram.TouchEvent) {
    if (this.data.isSubmitting || !this.data.isReady || event.touches.length !== 1) {
      this.handleWheelTouchCancel();
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    const generation = ++this._gestureGeneration;
    this._gesture = null;
    this.createSelectorQuery()
      .select('.wheel-stage')
      .boundingClientRect((rect) => {
        if (!this._active || generation !== this._gestureGeneration || !rect?.width || !rect.height)
          return;
        const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        const angle = wheelPointAngle(
          { x: touch.clientX, y: touch.clientY },
          center,
          rect.width * 0.18,
        );
        if (angle === null) return;
        this._gesture = {
          identifier: touch.identifier,
          center,
          lastAngle: angle,
          lastTime: Date.now(),
          velocity: 0,
          distance: 0,
        };
        this.setData({ dragging: true, settling: false });
      })
      .exec();
  },
  handleWheelTouchMove(event: WechatMiniprogram.TouchEvent) {
    const gesture = this._gesture;
    if (!gesture || this.data.isSubmitting) return;
    if (event.touches.length !== 1) {
      this.handleWheelTouchCancel();
      return;
    }
    const touch = event.touches[0];
    if (!touch || touch.identifier !== gesture.identifier) return;
    const angle = wheelPointAngle(
      { x: touch.clientX, y: touch.clientY },
      gesture.center,
      this.data.stageSize * 0.18,
    );
    if (angle === null) {
      this.handleWheelTouchCancel();
      return;
    }
    const now = Date.now();
    const delta = normalizeWheelAngle(angle - gesture.lastAngle);
    gesture.velocity = delta / Math.max(16, now - gesture.lastTime);
    gesture.distance += Math.abs(delta);
    gesture.lastAngle = angle;
    gesture.lastTime = now;
    this.applyRotation(this.data.rotation + delta, false);
  },
  handleWheelTouchEnd(event: WechatMiniprogram.TouchEvent) {
    this._gestureGeneration += 1;
    const gesture = this._gesture;
    this._gesture = null;
    if (!gesture) return;
    const ended = event.changedTouches.find((touch) => touch.identifier === gesture.identifier);
    const speed = ended && Date.now() - gesture.lastTime < 100 ? gesture.velocity : 0;
    if (gesture.distance > 5) this._ignoreTapUntil = Date.now() + 280;
    this.setData({ dragging: false });
    this.applyRotation(
      wheelReleaseRotation(this.data.rotation, speed, this.data.options.length),
      true,
    );
  },
  handleWheelTouchCancel() {
    this._gestureGeneration += 1;
    const gesture = this._gesture;
    this._gesture = null;
    if (gesture?.distance && gesture.distance > 5) this._ignoreTapUntil = Date.now() + 280;
    this.setData({ dragging: false });
    if (this.data.options.length > 1)
      this.applyRotation(
        wheelReleaseRotation(this.data.rotation, 0, this.data.options.length),
        true,
      );
  },
  selectOption(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isSubmitting || Date.now() < this._ignoreTapUntil) return;
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || index < 0 || index >= this.data.options.length) return;
    this.applyRotation(
      wheelRotationForIndex(this.data.rotation, index, this.data.options.length),
      true,
    );
  },
  stepOption() {
    if (this.data.isSubmitting) return;
    this.applyRotation(this.data.rotation - 360 / this.data.options.length, true);
  },
  resetSelection() {
    if (this.data.isSubmitting) return;
    const value = this.data.kind === 'mood' ? this.data.defaultMood : this.data.defaultCategory;
    const index = Math.max(
      0,
      this.data.options.findIndex((option) => option.value === value),
    );
    this.applyRotation(
      wheelRotationForIndex(this.data.rotation, index, this.data.options.length),
      true,
    );
  },
  confirmSelection() {
    if (this.data.isSubmitting || !this.data.isReady || !this.data.selectedValue) return;
    this.setData({ isSubmitting: true, errorMessage: '' });
    try {
      const value = this.data.selectedValue;
      if (this.data.source === 'journal') {
        createJournalTimestamp(this.data.dateKey, new Date().toISOString());
        const mood = this.data.kind === 'mood' ? value : this.data.defaultMood;
        const category = this.data.kind === 'category' ? value : this.data.defaultCategory;
        if (!isMemoryMood(mood) || !isMemoryCategory(category))
          throw new Error('请选择有效的心情和主题。');
        void wx.redirectTo({
          url:
            '/pages/editor/index?source=journal&date=' +
            encodeURIComponent(this.data.dateKey) +
            '&mood=' +
            mood +
            '&category=' +
            category,
          fail: () =>
            this.setData({
              isSubmitting: false,
              errorMessage: '日记页暂时没有打开，请返回后重试。',
            }),
        });
        return;
      }
      if (this.data.source === 'preferences') {
        if (this.data.kind === 'mood' && isMemoryMood(value))
          journalPreferencesService.save({ defaultMood: value });
        else if (this.data.kind === 'category' && isMemoryCategory(value))
          journalPreferencesService.save({ defaultCategory: value });
        else throw new Error('偏好选择无效。');
      } else {
        const channel = this.getOpenerEventChannel?.();
        if (!channel || typeof channel.emit !== 'function')
          throw new Error('编辑页暂时没有连接，请返回重试。');
        channel.emit('selection', { kind: this.data.kind, value });
      }
      void wx.navigateBack({
        delta: 1,
        fail: () =>
          this.setData({ isSubmitting: false, errorMessage: '选择已确认，请使用左上角返回。' }),
      });
    } catch (error: unknown) {
      this.setData({
        isSubmitting: false,
        errorMessage: error instanceof Error ? error.message : '选择未能确认，请重试。',
      });
    }
  },
  cancelSelection() {
    if (this.data.isSubmitting) return;
    void wx.navigateBack({
      delta: 1,
      fail: () => {
        void wx.switchTab({ url: '/pages/journal/index' });
      },
    });
  },
});
