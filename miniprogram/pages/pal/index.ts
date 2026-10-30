interface PalEntryData {
  opening: boolean;
  errorMessage: string;
}
interface PalEntryPage {
  data: PalEntryData;
  _visible: boolean;
  _hasShown: boolean;
  _openWhenVisible: boolean;
  _homeOpen: boolean;
  _pending: boolean;
  _request: number;
  setData(patch: Partial<PalEntryData>): void;
  openHome(): void;
}

Page({
  data: { opening: false, errorMessage: '' },
  _visible: false,
  _hasShown: false,
  _openWhenVisible: false,
  _homeOpen: false,
  _pending: false,
  _request: 0,
  onShow(this: PalEntryPage) {
    const firstShow = !this._hasShown;
    this._visible = true;
    this._hasShown = true;
    // Returning from the full-screen home must leave the native tabs usable.
    if (this._homeOpen) {
      this._homeOpen = false;
      this._pending = false;
      this._request += 1;
      if (this._openWhenVisible) this.openHome();
      else this.setData({ opening: false });
      return;
    }
    if (firstShow || this._openWhenVisible) this.openHome();
    else this.setData({ opening: false });
  },
  onTabItemTap(this: PalEntryPage) {
    if (this._pending || (this._homeOpen && this._visible)) return;
    // Native tab/show callbacks may arrive in either order.
    this._openWhenVisible = true;
    if (this._visible) this.openHome();
  },
  onHide(this: PalEntryPage) {
    this._visible = false;
  },
  onUnload(this: PalEntryPage) {
    this._visible = false;
    this._pending = false;
    this._homeOpen = false;
    this._openWhenVisible = false;
    this._request += 1;
  },
  openHome(this: PalEntryPage) {
    if (!this._visible || this._pending || this._homeOpen) return;
    this._pending = true;
    this._homeOpen = true;
    this._openWhenVisible = false;
    const request = ++this._request;
    this.setData({ opening: true, errorMessage: '' });
    void wx.navigateTo({
      url: '/pages/companion/index',
      success: () => {
        if (request === this._request) this._pending = false;
      },
      fail: () => {
        if (request !== this._request) return;
        this._pending = false;
        this._homeOpen = false;
        if (this._visible)
          this.setData({ opening: false, errorMessage: '家园暂时未能打开，请再试一次。' });
      },
    });
  },
});
