import { campusMapConfig, CURRENT_MAP_ASSET_VERSION } from '../../config/campus-map';
import {
  isMapPositionWithinBounds,
  isRatioPointInPolygon,
  mapPositionToRatio,
  validateRatio,
  type RatioPoint,
} from '../../utils/map-coordinates';
Page({
  data: {
    mapSource: campusMapConfig.assetPath,
    hasPicked: false,
    errorMessage: '',
    xRatio: Number(campusMapConfig.subjectCenter.xRatio),
    yRatio: Number(campusMapConfig.subjectCenter.yRatio),
    markerX: '54%',
    markerY: '53%',
  },
  onLoad(query: Record<string, string | undefined>) {
    const xRatio = Number(query.xRatio);
    const yRatio = Number(query.yRatio);
    if (validateRatio(xRatio) && validateRatio(yRatio)) this.acceptPoint({ xRatio, yRatio });
  },
  acceptPoint(point: RatioPoint) {
    if (
      !validateRatio(point.xRatio) ||
      !validateRatio(point.yRatio) ||
      !isRatioPointInPolygon(point, campusMapConfig.validAreaPolygon)
    ) {
      this.setData({ errorMessage: '这里在校园范围外，换一个位置轻点试试。' });
      return;
    }
    this.setData({
      ...point,
      markerX: point.xRatio * 100 + '%',
      markerY: point.yRatio * 100 + '%',
      hasPicked: true,
      errorMessage: '',
    });
  },
  selectPoint(event: WechatMiniprogram.TouchEvent) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    if (!touch) return;
    this.createSelectorQuery()
      .select('#picker-map')
      .boundingClientRect((raw) => {
        const rect = raw;
        if (!rect || !rect.width || !rect.height) {
          this.setData({ errorMessage: '地图还在准备，请稍后再点。' });
          return;
        }
        const position = { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
        if (!isMapPositionWithinBounds(position, rect)) return;
        this.acceptPoint(mapPositionToRatio(position, rect));
      })
      .exec();
  },
  confirmPoint() {
    if (!this.data.hasPicked) return;
    const point = { xRatio: this.data.xRatio, yRatio: this.data.yRatio };
    if (!isRatioPointInPolygon(point, campusMapConfig.validAreaPolygon)) return;
    try {
      const channel = this.getOpenerEventChannel?.();
      if (!channel || typeof channel.emit !== 'function')
        throw new Error('Missing editor event channel');
      channel.emit('locationSelected', { ...point, mapAssetVersion: CURRENT_MAP_ASSET_VERSION });
      void wx.navigateBack({ delta: 1 });
    } catch {
      this.setData({ errorMessage: '选点结果暂时没有传回，请返回日记页重试。' });
    }
  },
});
