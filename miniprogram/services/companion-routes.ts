type Section = 'tasks' | 'collection' | 'mail' | 'card' | 'photo';
interface RouteData {
  destination: string;
  errorMessage: string;
}
interface RoutePage {
  data: RouteData;
  _active: boolean;
  _pending: boolean;
  setData(patch: Partial<RouteData>): void;
  retry(): void;
}
/** Keep previously shared/deep-linked subpage paths working after the normal package split. */
export function legacyCompanionPage(section: Section) {
  return {
    _active: false,
    _pending: false,
    data: { destination: '', errorMessage: '' },
    onLoad(this: RoutePage, query: Record<string, string | undefined>) {
      this._active = true;
      const parameters: string[] = [];
      if (section === 'collection') {
        if (['skins', 'accessories', 'furniture'].includes(query.tab ?? ''))
          parameters.push('tab=' + encodeURIComponent(query.tab ?? 'skins'));
        if (['inventory', 'shop'].includes(query.mode ?? ''))
          parameters.push('mode=' + encodeURIComponent(query.mode ?? 'inventory'));
      }
      this.setData({
        destination:
          '/pages/companion/' +
          section +
          '/index' +
          (parameters.length ? '?' + parameters.join('&') : ''),
      });
      this.retry();
    },
    onShow(this: RoutePage) {
      this._active = true;
    },
    onHide(this: RoutePage) {
      this._active = false;
    },
    onUnload(this: RoutePage) {
      this._active = false;
    },
    retry(this: RoutePage) {
      if (!this._active || this._pending || !this.data.destination) return;
      this._pending = true;
      this.setData({ errorMessage: '' });
      void wx.redirectTo({
        url: this.data.destination,
        success: () => {
          this._pending = false;
        },
        fail: () => {
          this._pending = false;
          if (this._active) this.setData({ errorMessage: '伙伴页面暂时没有打开，请重试。' });
        },
      });
    },
    back() {
      void wx.navigateBack({
        fail: () => {
          void wx.switchTab({ url: '/pages/journal/index' });
        },
      });
    },
  };
}
