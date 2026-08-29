import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  MEMORY_MOODS,
  MEMORY_MOOD_LABELS,
  getMemoryCategoryLabel,
  getMemoryMoodLabel,
  isMemoryCategory,
  isMemoryMood,
  type Memory,
  type MemoryCategory,
  type MemoryMood,
} from '../../models/memory';
import { campusMapConfig } from '../../config/campus-map';
import { consumeMapFocusIntent, type MapFocusIntent } from '../../services/map-focus-intent';
import { memoryRepository } from '../../services/repository/index';
import type { FriendMapPoint } from '../../models/friend-map-point';
import { cloudModeService } from '../../services/cloud/cloud-mode-service';
import { cloudMemoryRepository } from '../../services/repository/cloud-memory-repository';
import {
  calculateCenteredOffset,
  calculateCoverSize,
  calculateRenderedMapCenterCorrection,
  calculateRenderedViewportCoverageCorrection,
  clampTranslationToMapCenterBounds,
  isRatioPointInPolygon,
  mapPositionToViewportPositionInCanvas,
  renderedViewportCenterToRatio,
  ratioToMapPosition,
  validateRatio,
  type MapPosition,
  type MapSize,
} from '../../utils/map-coordinates';
import { formatMemoryDateTime } from '../../utils/date-format';
import {
  countActiveMemoryFilters,
  filterMemories,
  type MemoryDatePreset,
  type MemoryFilterCriteria,
} from '../../utils/memory-filters';
const MAP_SOURCE: string = campusMapConfig.assetPath;
const ORIGINAL_MAP_SIZE: MapSize = campusMapConfig.originalSize;
const MIN_SCALE: number = campusMapConfig.minimumScale;
const MAX_SCALE: number = campusMapConfig.maximumScale;
const DEFAULT_WINDOW_SIZE: MapSize = { width: 375, height: 667 };
const MAP_BOUNDARY_SETTLE_DELAY_MS = 80;
const MAP_EDGE_BLANK_ALLOWANCE_PX = 10;
type ScaleBoundary = 'maximum' | 'minimum' | 'normal';
type MarkerMode = 'dot' | 'photo';
type MapLayer = 'friends' | 'mine';
interface FilterOption<T extends string> {
  label: string;
  value: T;
}
interface MapFilterState {
  filterCategory: 'all' | MemoryCategory;
  filterCustomEndDate: string;
  filterCustomStartDate: string;
  filterDatePreset: MemoryDatePreset;
  filterMood: 'all' | MemoryMood;
}
interface MapLayout {
  canvasSize: MapSize;
  defaultPosition: MapPosition;
  mapOffset: MapPosition;
  mapSize: MapSize;
  viewportSize: MapSize;
}
interface MemoryMarker extends MapPosition {
  hasThumbnail: boolean;
  id: string;
  moodClass: MemoryMood;
  renderKey: string;
  showThumbnail: boolean;
  thumbnail: string;
  thumbnailFailed: boolean;
  title: string;
}

interface FriendMemoryMarker extends MapPosition {
  id: string;
  moodClass: MemoryMood;
  ownerDisplayName: string;
  renderKey: string;
  title: string;
}

type MapFilterPatch = Partial<MapFilterState>;
interface MarkerSnapshot {
  activeFilterCount: number;
  availableMarkerCount: number;
  incompatibleMapCount: number;
  invalidCount: number;
  markers: MemoryMarker[];
}
const DATE_FILTER_OPTIONS: readonly FilterOption<MemoryDatePreset>[] = [
  { label: '全部', value: 'all' },
  { label: '近 1 天', value: 'day' },
  { label: '近 7 天', value: 'week' },
  { label: '近 30 天', value: 'month' },
  { label: '自定义', value: 'custom' },
];
const MOOD_FILTER_OPTIONS: readonly FilterOption<'all' | MemoryMood>[] = [
  { label: '全部', value: 'all' },
  ...MEMORY_MOODS.map((value) => ({ label: MEMORY_MOOD_LABELS[value], value })),
];
const CATEGORY_FILTER_OPTIONS: readonly FilterOption<'all' | MemoryCategory>[] = [
  { label: '全部', value: 'all' },
  ...MEMORY_CATEGORIES.map((value) => ({ label: MEMORY_CATEGORY_LABELS[value], value })),
];
const MEMORY_DATE_PRESETS: readonly MemoryDatePreset[] = ['all', 'day', 'week', 'month', 'custom'];
function isMemoryDatePreset(value: unknown): value is MemoryDatePreset {
  return typeof value === 'string' && (MEMORY_DATE_PRESETS as readonly string[]).includes(value);
}
function isMarkerMode(value: unknown): value is MarkerMode {
  return value === 'dot' || value === 'photo';
}
function getInitialCategoryFilter(): 'all' | MemoryCategory {
  return 'all';
}
function getInitialDateFilter(): MemoryDatePreset {
  return 'all';
}
function getInitialMarkerMode(): MarkerMode {
  return 'dot';
}
function getInitialMoodFilter(): 'all' | MemoryMood {
  return 'all';
}
function getInitialMapLayer(): MapLayer {
  return 'mine';
}

function createFilterCriteria(filterState: MapFilterState): MemoryFilterCriteria {
  return {
    category: filterState.filterCategory,
    customEndDate: filterState.filterCustomEndDate,
    customStartDate: filterState.filterCustomStartDate,
    datePreset: filterState.filterDatePreset,
    keyword: '',
    mood: filterState.filterMood,
  };
}

function mergeMapFilterState(current: MapFilterState, patch: MapFilterPatch): MapFilterState {
  return {
    filterCategory: patch.filterCategory ?? current.filterCategory,
    filterCustomEndDate: patch.filterCustomEndDate ?? current.filterCustomEndDate,
    filterCustomStartDate: patch.filterCustomStartDate ?? current.filterCustomStartDate,
    filterDatePreset: patch.filterDatePreset ?? current.filterDatePreset,
    filterMood: patch.filterMood ?? current.filterMood,
  };
}
interface MemoryCardView {
  categoryLabel: string;
  dateLabel: string;
  hasImage: boolean;
  id: string;
  imagePath: string;
  moodLabel: string;
  placeLabel: string;
  text: string;
  title: string;
}
interface NodeRect {
  height: number;
  left: number;
  top: number;
  width: number;
}
function isNodeRect(value: unknown): value is NodeRect {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const rect = value as Partial<NodeRect>;
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    (rect.width ?? 0) > 0 &&
    (rect.height ?? 0) > 0
  );
}
function createMapLayout(windowSize: MapSize): MapLayout {
  const horizontalPadding = windowSize.width <= 340 ? 32 : 40;
  const viewportSize = {
    width: Math.max(280, Math.min(920, Math.round(windowSize.width - horizontalPadding))),
    height: Math.max(320, Math.min(620, Math.round(windowSize.height * 0.62))),
  };
  const mapSize = calculateCoverSize(ORIGINAL_MAP_SIZE, viewportSize);
  const mapOffset = { x: viewportSize.width / 2, y: viewportSize.height / 2 };
  const canvasSize = {
    width: mapSize.width + viewportSize.width,
    height: mapSize.height + viewportSize.height,
  };
  return {
    canvasSize,
    defaultPosition: calculateCenteredOffset(canvasSize, viewportSize),
    mapOffset,
    mapSize,
    viewportSize,
  };
}
function getMemoryTitle(memory: Memory): string {
  const firstLine = memory.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine?.slice(0, 24) || memory.placeName || '一段校园回忆';
}
function createMemoryCard(memory: Memory): MemoryCardView {
  const imagePath = memory.imagePaths[0] ?? '';
  return {
    categoryLabel: getMemoryCategoryLabel(memory),
    dateLabel: formatMemoryDateTime(memory.recordedAt),
    hasImage: Boolean(imagePath),
    id: memory.id,
    imagePath,
    moodLabel: getMemoryMoodLabel(memory),
    placeLabel: memory.placeName || '校园中的某处',
    text: memory.text || '这是一段只有照片的校园回忆。',
    title: getMemoryTitle(memory),
  };
}
function createMemoryMarkers(
  memories: readonly Memory[],
  mapSize: MapSize,
  markerMode: MarkerMode,
  filterState: MapFilterState,
): MarkerSnapshot {
  const markers: MemoryMarker[] = [];
  const criteria = createFilterCriteria(filterState);
  const filteredIds = new Set(filterMemories(memories, criteria).map((memory) => memory.id));
  const renderScope = [
    criteria.datePreset,
    criteria.customStartDate,
    criteria.customEndDate,
    criteria.mood,
    criteria.category,
    markerMode,
  ].join('|');
  let availableMarkerCount = 0;
  let incompatibleMapCount = 0;
  let invalidCount = 0;
  for (const memory of memories) {
    if (memory.mapAssetVersion !== campusMapConfig.assetVersion) {
      incompatibleMapCount += 1;
      continue;
    }
    const ratio = { xRatio: memory.mapXRatio, yRatio: memory.mapYRatio };
    if (
      !validateRatio(ratio.xRatio) ||
      !validateRatio(ratio.yRatio) ||
      !isRatioPointInPolygon(ratio, campusMapConfig.validAreaPolygon)
    ) {
      invalidCount += 1;
      continue;
    }
    availableMarkerCount += 1;
    if (!filteredIds.has(memory.id)) {
      continue;
    }
    const position = ratioToMapPosition(ratio, mapSize);
    const thumbnail = memory.imagePaths[0] ?? '';
    markers.push({
      ...position,
      hasThumbnail: Boolean(thumbnail),
      id: memory.id,
      moodClass: memory.mood,
      renderKey: `${renderScope}|${memory.id}`,
      showThumbnail: markerMode === 'photo' && Boolean(thumbnail),
      thumbnail,
      thumbnailFailed: false,
      title: getMemoryTitle(memory),
    });
  }
  return {
    activeFilterCount: countActiveMemoryFilters(criteria),
    availableMarkerCount,
    incompatibleMapCount,
    invalidCount,
    markers,
  };
}

function createFriendMarkers(
  points: readonly FriendMapPoint[],
  mapSize: MapSize,
): FriendMemoryMarker[] {
  return points
    .filter(
      (point) =>
        point.mapAssetVersion === campusMapConfig.assetVersion &&
        validateRatio(point.mapXRatio) &&
        validateRatio(point.mapYRatio) &&
        isRatioPointInPolygon(
          { xRatio: point.mapXRatio, yRatio: point.mapYRatio },
          campusMapConfig.validAreaPolygon,
        ),
    )
    .map((point) => ({
      ...ratioToMapPosition({ xRatio: point.mapXRatio, yRatio: point.mapYRatio }, mapSize),
      id: point.id,
      moodClass: point.mood,
      ownerDisplayName: point.ownerDisplayName,
      renderKey: `friend|${point.publishedAt}|${point.id}`,
      title: `${point.ownerDisplayName} · ${point.placeName || '校园中的某处'}`,
    }));
}
function getScaleBoundary(scale: number): ScaleBoundary {
  if (scale <= MIN_SCALE + 0.01) {
    return 'minimum';
  }
  if (scale >= MAX_SCALE - 0.01) {
    return 'maximum';
  }
  return 'normal';
}
function getScaleStatus(boundary: ScaleBoundary): string {
  const statusByBoundary: Record<ScaleBoundary, string> = {
    maximum: `已到最大缩放 ${MAX_SCALE}×`,
    minimum: `当前为最小缩放 ${MIN_SCALE}×`,
    normal: `可在 ${MIN_SCALE}×—${MAX_SCALE}× 之间缩放`,
  };
  return statusByBoundary[boundary];
}
function getMarkerVisualScale(scale: number): number {
  const safeScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
  return Number((1 / safeScale).toFixed(4));
}
const initialLayout = createMapLayout(DEFAULT_WINDOW_SIZE);
let latestViewPosition = initialLayout.defaultPosition;
let latestViewScale: number = MIN_SCALE;
let lastScaleBoundary: ScaleBoundary = 'minimum';
let mapBoundaryTimer: ReturnType<typeof setTimeout> | undefined;
let isMapGestureActive = false;
let mapGestureRevision = 0;
let pendingFocusIntent: MapFocusIntent | null = null;
Page({
  data: {
    activeFilterCount: 0,
    availableMarkerCount: 0,
    categoryFilterOptions: CATEGORY_FILTER_OPTIONS,
    dateFilterOptions: DATE_FILTER_OPTIONS,
    defaultViewMessage: '正在准备校园地图…',
    defaultViewX: initialLayout.defaultPosition.x,
    defaultViewY: initialLayout.defaultPosition.y,
    hasInvalidMarkers: false,
    hasIncompatibleMapMemories: false,
    hasNoMarkers: true,
    hasRepositoryError: false,
    filterCategory: getInitialCategoryFilter(),
    filterCustomEndDate: '',
    filterCustomStartDate: '',
    filterDatePreset: getInitialDateFilter(),
    filterMood: getInitialMoodFilter(),
    filterPanelOpen: false,
    friendLoadError: '',
    friendMarkers: [] as FriendMemoryMarker[],
    friendPoints: [] as FriendMapPoint[],
    invalidMarkerCount: 0,
    incompatibleMapMemoryCount: 0,
    isMapError: false,
    isMapLoading: true,
    isMapReady: false,
    isMemoryLoading: true,
    isFriendLayerLoading: false,
    isNavigatingToEditor: false,
    isPickingLocation: false,
    mapCanvasHeight: initialLayout.canvasSize.height,
    mapCanvasWidth: initialLayout.canvasSize.width,
    mapOffsetX: initialLayout.mapOffset.x,
    mapOffsetY: initialLayout.mapOffset.y,
    mapRenderHeight: initialLayout.mapSize.height,
    mapRenderWidth: initialLayout.mapSize.width,
    mapSource: MAP_SOURCE,
    markerMode: getInitialMarkerMode(),
    markerVisualScale: getMarkerVisualScale(MIN_SCALE),
    mapLayer: getInitialMapLayer(),
    markers: [] as MemoryMarker[],
    maxScale: MAX_SCALE,
    memories: [] as Memory[],
    minScale: MIN_SCALE,
    moodFilterOptions: MOOD_FILTER_OPTIONS,
    repositoryErrorMessage: '',
    scaleStatus: getScaleStatus('minimum'),
    selectedMemory: null as MemoryCardView | null,
    selectedMemorySource: getInitialMapLayer(),
    viewportHeight: initialLayout.viewportSize.height,
    viewportWidth: initialLayout.viewportSize.width,
    viewScale: MIN_SCALE,
    viewX: initialLayout.defaultPosition.x,
    viewY: initialLayout.defaultPosition.y,
    visibleMarkerCount: 0,
  },
  onLoad() {
    const windowInfo = wx.getWindowInfo();
    this.applyLayout(
      { width: windowInfo.windowWidth, height: windowInfo.windowHeight },
      '已按当前屏幕计算默认视图',
    );
  },
  onShow() {
    pendingFocusIntent = consumeMapFocusIntent();
    void this.refreshMemories();
  },
  onResize(options: WechatMiniprogram.Page.IResizeOption) {
    this.applyLayout(
      { width: options.size.windowWidth, height: options.size.windowHeight },
      '屏幕尺寸变化，已恢复默认视图；如需记录请重新选点',
    );
  },
  applyLayout(windowSize: MapSize, message: string) {
    if (mapBoundaryTimer) {
      clearTimeout(mapBoundaryTimer);
      mapBoundaryTimer = undefined;
    }
    const layout = createMapLayout(windowSize);
    const markerResult = createMemoryMarkers(
      this.data.memories,
      layout.mapSize,
      this.data.markerMode,
      this.data,
    );
    const friendMarkers = createFriendMarkers(this.data.friendPoints, layout.mapSize);
    latestViewPosition = layout.defaultPosition;
    latestViewScale = MIN_SCALE;
    lastScaleBoundary = 'minimum';
    this.setData({
      defaultViewMessage: message,
      defaultViewX: layout.defaultPosition.x,
      defaultViewY: layout.defaultPosition.y,
      friendMarkers,
      hasInvalidMarkers: markerResult.invalidCount > 0,
      hasIncompatibleMapMemories: markerResult.incompatibleMapCount > 0,
      hasNoMarkers: markerResult.markers.length === 0,
      activeFilterCount: markerResult.activeFilterCount,
      availableMarkerCount: markerResult.availableMarkerCount,
      invalidMarkerCount: markerResult.invalidCount,
      incompatibleMapMemoryCount: markerResult.incompatibleMapCount,
      isNavigatingToEditor: false,
      isPickingLocation: false,
      mapCanvasHeight: layout.canvasSize.height,
      mapCanvasWidth: layout.canvasSize.width,
      mapOffsetX: layout.mapOffset.x,
      mapOffsetY: layout.mapOffset.y,
      mapRenderHeight: layout.mapSize.height,
      mapRenderWidth: layout.mapSize.width,
      markerVisualScale: getMarkerVisualScale(MIN_SCALE),
      markers: markerResult.markers,
      scaleStatus: getScaleStatus('minimum'),
      selectedMemory: null,
      viewportHeight: layout.viewportSize.height,
      viewportWidth: layout.viewportSize.width,
      viewScale: MIN_SCALE,
      viewX: layout.defaultPosition.x,
      viewY: layout.defaultPosition.y,
      visibleMarkerCount: markerResult.markers.length,
    });
  },
  async refreshMemories() {
    this.setData({
      isMemoryLoading: true,
    });
    try {
      const memories = await memoryRepository.listMemories();
      const mapSize = { width: this.data.mapRenderWidth, height: this.data.mapRenderHeight };
      const markerResult = createMemoryMarkers(memories, mapSize, this.data.markerMode, this.data);
      const selectedId = this.data.selectedMemory?.id;
      const selected = selectedId ? memories.find((memory) => memory.id === selectedId) : undefined;
      this.setData(
        {
          activeFilterCount: markerResult.activeFilterCount,
          availableMarkerCount: markerResult.availableMarkerCount,
          hasInvalidMarkers: markerResult.invalidCount > 0,
          hasIncompatibleMapMemories: markerResult.incompatibleMapCount > 0,
          hasNoMarkers: markerResult.markers.length === 0,
          hasRepositoryError: false,
          invalidMarkerCount: markerResult.invalidCount,
          incompatibleMapMemoryCount: markerResult.incompatibleMapCount,
          isMemoryLoading: false,
          markers: markerResult.markers,
          memories,
          repositoryErrorMessage: '',
          selectedMemory: selected ? createMemoryCard(selected) : null,
          visibleMarkerCount: markerResult.markers.length,
        },
        () => void this.applyPendingFocusIntent(),
      );
    } catch (error) {
      this.setData({
        hasNoMarkers: true,
        hasRepositoryError: true,
        isMemoryLoading: false,
        markers: [],
        memories: [],
        repositoryErrorMessage: error instanceof Error ? error.message : '本地回忆读取失败，请重试',
        selectedMemory: null,
      });
    }
  },
  async refreshFriendLayer() {
    if (cloudModeService.getState().mode !== 'cloud') {
      this.setData({
        friendLoadError: '请先在“时光 → 数据管理”中开启云端与好友功能。',
        friendMarkers: [],
        friendPoints: [],
        isFriendLayerLoading: false,
      });
      return;
    }
    this.setData({ friendLoadError: '', isFriendLayerLoading: true });
    try {
      const points = await cloudMemoryRepository.listFriendRecentMapPoints(
        campusMapConfig.assetVersion,
      );
      const friendMarkers = createFriendMarkers(points, {
        height: this.data.mapRenderHeight,
        width: this.data.mapRenderWidth,
      });
      this.setData({ friendMarkers, friendPoints: points, isFriendLayerLoading: false });
    } catch (error: unknown) {
      this.setData({
        friendLoadError: error instanceof Error ? error.message : '好友 24 小时地图暂时无法读取。',
        friendMarkers: [],
        friendPoints: [],
        isFriendLayerLoading: false,
      });
    }
  },
  handleMapLayerTap(event: WechatMiniprogram.BaseEvent) {
    const layer = (event.currentTarget.dataset as { layer?: unknown }).layer;
    if (layer !== 'mine' && layer !== 'friends') return;
    this.setData({
      filterPanelOpen: false,
      mapLayer: layer,
      selectedMemory: null,
      selectedMemorySource: layer,
    });
    if (layer === 'friends') void this.refreshFriendLayer();
  },
  focusOnMemory(intent: MapFocusIntent, memory: Memory, source: MapLayer, message: string) {
    const mapSize = { width: this.data.mapRenderWidth, height: this.data.mapRenderHeight };
    const canvasSize = { width: this.data.mapCanvasWidth, height: this.data.mapCanvasHeight };
    const mapOffset = { x: this.data.mapOffsetX, y: this.data.mapOffsetY };
    const viewportCenter = { x: this.data.viewportWidth / 2, y: this.data.viewportHeight / 2 };
    const mapPosition = ratioToMapPosition(
      { xRatio: intent.mapXRatio, yRatio: intent.mapYRatio },
      mapSize,
    );
    const currentViewportPosition = mapPositionToViewportPositionInCanvas(
      mapPosition,
      mapSize,
      { canvasSize, mapOffset },
      latestViewPosition,
      latestViewScale,
    );
    const targetPosition = {
      x: latestViewPosition.x + viewportCenter.x - currentViewportPosition.x,
      y: latestViewPosition.y + viewportCenter.y - currentViewportPosition.y,
    };
    const correctedPosition = clampTranslationToMapCenterBounds(
      targetPosition,
      { width: this.data.viewportWidth, height: this.data.viewportHeight },
      mapSize,
      { canvasSize, mapOffset },
      latestViewScale,
    );

    latestViewPosition = correctedPosition;
    this.setData({
      defaultViewMessage: message,
      mapLayer: source,
      selectedMemory: createMemoryCard(memory),
      selectedMemorySource: source,
      viewScale: latestViewScale,
      viewX: correctedPosition.x,
      viewY: correctedPosition.y,
    });
  },
  async applyPendingFocusIntent() {
    const intent = pendingFocusIntent;
    pendingFocusIntent = null;
    if (!intent || this.data.isPickingLocation) {
      return;
    }

    if (intent.source === 'friend-timeline') {
      this.setData({
        defaultViewMessage: '正在定位好友回忆…',
        filterPanelOpen: false,
        mapLayer: 'friends',
        selectedMemory: null,
        selectedMemorySource: 'friends',
      });
      await this.refreshFriendLayer();
      const point = this.data.friendPoints.find((item) => item.id === intent.memoryId);
      if (!point || point.mapAssetVersion !== campusMapConfig.assetVersion) {
        this.setData({ defaultViewMessage: '这段回忆已不在好友 24 小时地图中。' });
        return;
      }
      try {
        const sharedMemory = await cloudMemoryRepository.getSharedMemoryById(intent.memoryId);
        this.focusOnMemory(
          intent,
          sharedMemory,
          'friends',
          `已回到 ${sharedMemory.ownerDisplayName} 分享的位置`,
        );
      } catch (error: unknown) {
        this.setData({
          defaultViewMessage: error instanceof Error ? error.message : '这段好友回忆当前无法访问。',
          selectedMemory: null,
        });
      }
      return;
    }

    const memory = this.data.memories.find((item) => item.id === intent.memoryId);
    if (!memory || memory.mapAssetVersion !== campusMapConfig.assetVersion) {
      return;
    }
    this.focusOnMemory(intent, memory, 'mine', `已回到：${memory.placeName || '校园中的某处'}`);
  },
  refreshVisibleMarkers(message = '') {
    const markerResult = createMemoryMarkers(
      this.data.memories,
      { width: this.data.mapRenderWidth, height: this.data.mapRenderHeight },
      this.data.markerMode,
      this.data,
    );
    const selectedId = this.data.selectedMemory?.id;
    this.setData({
      activeFilterCount: markerResult.activeFilterCount,
      availableMarkerCount: markerResult.availableMarkerCount,
      defaultViewMessage: message || this.data.defaultViewMessage,
      hasInvalidMarkers: markerResult.invalidCount > 0,
      hasIncompatibleMapMemories: markerResult.incompatibleMapCount > 0,
      hasNoMarkers: markerResult.markers.length === 0,
      incompatibleMapMemoryCount: markerResult.incompatibleMapCount,
      invalidMarkerCount: markerResult.invalidCount,
      markers: markerResult.markers,
      selectedMemory:
        selectedId && markerResult.markers.some((marker) => marker.id === selectedId)
          ? this.data.selectedMemory
          : null,
      visibleMarkerCount: markerResult.markers.length,
    });
  },
  applyMapFilterPatch(patch: MapFilterPatch, message: string) {
    const filterState = mergeMapFilterState(this.data, patch);
    const markerResult = createMemoryMarkers(
      this.data.memories,
      { width: this.data.mapRenderWidth, height: this.data.mapRenderHeight },
      this.data.markerMode,
      filterState,
    );
    const selectedId = this.data.selectedMemory?.id;
    this.setData({
      ...patch,
      activeFilterCount: markerResult.activeFilterCount,
      availableMarkerCount: markerResult.availableMarkerCount,
      defaultViewMessage: message,
      hasInvalidMarkers: markerResult.invalidCount > 0,
      hasIncompatibleMapMemories: markerResult.incompatibleMapCount > 0,
      hasNoMarkers: markerResult.markers.length === 0,
      incompatibleMapMemoryCount: markerResult.incompatibleMapCount,
      invalidMarkerCount: markerResult.invalidCount,
      markers: markerResult.markers,
      selectedMemory:
        selectedId && markerResult.markers.some((marker) => marker.id === selectedId)
          ? this.data.selectedMemory
          : null,
      visibleMarkerCount: markerResult.markers.length,
    });
  },
  toggleFilterPanel() {
    if (this.data.isPickingLocation) {
      return;
    }
    this.setData({ filterPanelOpen: !this.data.filterPanelOpen });
  },
  closeFilterPanel() {
    this.setData({ filterPanelOpen: false });
  },
  stopEvent() {
    return;
  },
  handleDatePresetTap(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { value?: unknown };
    if (!isMemoryDatePreset(dataset.value)) {
      return;
    }
    this.applyMapFilterPatch({ filterDatePreset: dataset.value }, '已按日期筛选地图回忆');
  },
  handleMoodFilterTap(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { value?: unknown };
    const value = dataset.value;
    if (value !== 'all' && !isMemoryMood(value)) {
      return;
    }
    this.applyMapFilterPatch({ filterMood: value }, '已按心情筛选地图回忆');
  },
  handleCategoryFilterTap(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { value?: unknown };
    const value = dataset.value;
    if (value !== 'all' && !isMemoryCategory(value)) {
      return;
    }
    this.applyMapFilterPatch({ filterCategory: value }, '已按内容主题筛选地图回忆');
  },
  handleCustomStartDateChange(event: WechatMiniprogram.PickerChange) {
    const value = typeof event.detail.value === 'string' ? event.detail.value : '';
    this.applyMapFilterPatch(
      { filterCustomStartDate: value, filterDatePreset: 'custom' },
      '已更新自定义日期范围',
    );
  },
  handleCustomEndDateChange(event: WechatMiniprogram.PickerChange) {
    const value = typeof event.detail.value === 'string' ? event.detail.value : '';
    this.applyMapFilterPatch(
      { filterCustomEndDate: value, filterDatePreset: 'custom' },
      '已更新自定义日期范围',
    );
  },
  handleMarkerModeTap(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { value?: unknown };
    if (!isMarkerMode(dataset.value)) {
      return;
    }
    this.setData({ markerMode: dataset.value }, () => {
      this.refreshVisibleMarkers(
        dataset.value === 'dot' ? '已切换为心情彩色小点' : '已切换为照片标记',
      );
    });
  },
  resetMapFilters() {
    this.applyMapFilterPatch(
      {
        filterCategory: 'all',
        filterCustomEndDate: '',
        filterCustomStartDate: '',
        filterDatePreset: 'all',
        filterMood: 'all',
      },
      '已显示全部地图回忆',
    );
  },
  applyMapFilters() {
    const visibleCount = this.data.visibleMarkerCount;
    const activeFilterCount = this.data.activeFilterCount;
    this.setData({
      defaultViewMessage: activeFilterCount
        ? `筛选已生效，地图显示 ${visibleCount} 段回忆`
        : '当前显示全部地图回忆',
      filterPanelOpen: false,
    });
  },
  handleMapLoad(event: WechatMiniprogram.ImageLoad) {
    const matchesExpectedSize =
      event.detail.width === ORIGINAL_MAP_SIZE.width &&
      event.detail.height === ORIGINAL_MAP_SIZE.height;
    this.setData({
      defaultViewMessage: matchesExpectedSize
        ? '校园地图已准备好'
        : `地图已加载，但资源尺寸为
        ${event.detail.width} × ${event.detail.height}`,
      isMapError: false,
      isMapLoading: false,
      isMapReady: true,
    });
  },
  handleMapError() {
    this.setData({
      defaultViewMessage: '地图资源加载失败，可点击重试',
      isMapError: true,
      isMapLoading: false,
      isMapReady: false,
      isPickingLocation: false,
      selectedMemory: null,
    });
  },
  reloadMapSource(source: string) {
    this.setData(
      {
        defaultViewMessage: '正在重新加载地图资源…',
        isMapError: false,
        isMapLoading: true,
        isMapReady: false,
        mapSource: '',
      },
      () => this.setData({ mapSource: source }),
    );
  },
  retryMap() {
    this.reloadMapSource(MAP_SOURCE);
  },
  handleViewChange(event: WechatMiniprogram.MovableViewChange) {
    if (Number.isFinite(event.detail.x) && Number.isFinite(event.detail.y)) {
      latestViewPosition = { x: event.detail.x, y: event.detail.y };
    }
  },
  handleMapTouchStart() {
    isMapGestureActive = true;
    mapGestureRevision += 1;
    if (mapBoundaryTimer) {
      clearTimeout(mapBoundaryTimer);
      mapBoundaryTimer = undefined;
    }
  },
  handleMapTouchEnd() {
    isMapGestureActive = false;
    const completedGestureRevision = mapGestureRevision;
    const markerVisualScale = getMarkerVisualScale(latestViewScale);
    if (Math.abs(markerVisualScale - this.data.markerVisualScale) >= 0.001) {
      this.setData({ markerVisualScale });
    }
    this.scheduleMapBoundaryCorrection(completedGestureRevision);
  },
  handleScale(event: WechatMiniprogram.MovableViewScale) {
    if (
      !Number.isFinite(event.detail.x) ||
      !Number.isFinite(event.detail.y) ||
      !Number.isFinite(event.detail.scale)
    ) {
      return;
    }
    latestViewPosition = { x: event.detail.x, y: event.detail.y };
    latestViewScale = event.detail.scale;
    if (!isMapGestureActive) {
      const markerVisualScale = getMarkerVisualScale(event.detail.scale);
      if (Math.abs(markerVisualScale - this.data.markerVisualScale) >= 0.001) {
        this.setData({ markerVisualScale });
      }
    }
    const nextBoundary = getScaleBoundary(event.detail.scale);
    if (nextBoundary !== lastScaleBoundary) {
      lastScaleBoundary = nextBoundary;
      this.setData({ scaleStatus: getScaleStatus(nextBoundary) });
    }
  },
  scheduleMapBoundaryCorrection(expectedGestureRevision = mapGestureRevision) {
    if (isMapGestureActive) {
      return;
    }
    if (mapBoundaryTimer) {
      clearTimeout(mapBoundaryTimer);
    }

    mapBoundaryTimer = setTimeout(() => {
      mapBoundaryTimer = undefined;
      void this.correctMapBoundary(expectedGestureRevision);
    }, MAP_BOUNDARY_SETTLE_DELAY_MS);
  },
  async correctMapBoundary(expectedGestureRevision = mapGestureRevision) {
    if (
      !this.data.isMapReady ||
      isMapGestureActive ||
      expectedGestureRevision !== mapGestureRevision
    ) {
      return;
    }

    let renderedMap: { mapRect: NodeRect; viewportRect: NodeRect };
    try {
      renderedMap = await this.measureRenderedMap();
    } catch {
      return;
    }
    if (isMapGestureActive || expectedGestureRevision !== mapGestureRevision) {
      return;
    }

    const viewportRect = {
      x: renderedMap.viewportRect.left,
      y: renderedMap.viewportRect.top,
      width: renderedMap.viewportRect.width,
      height: renderedMap.viewportRect.height,
    };
    const mapRect = {
      x: renderedMap.mapRect.left,
      y: renderedMap.mapRect.top,
      width: renderedMap.mapRect.width,
      height: renderedMap.mapRect.height,
    };
    const correction = this.data.isPickingLocation
      ? calculateRenderedMapCenterCorrection(viewportRect, mapRect)
      : calculateRenderedViewportCoverageCorrection(
          viewportRect,
          mapRect,
          MAP_EDGE_BLANK_ALLOWANCE_PX,
        );

    if (Math.abs(correction.x) < 0.5 && Math.abs(correction.y) < 0.5) {
      return;
    }

    const correctedPosition = {
      x: latestViewPosition.x + correction.x,
      y: latestViewPosition.y + correction.y,
    };
    latestViewPosition = correctedPosition;
    this.setData({
      viewScale: latestViewScale,
      viewX: correctedPosition.x,
      viewY: correctedPosition.y,
    });
  },
  resetMapView() {
    if (mapBoundaryTimer) {
      clearTimeout(mapBoundaryTimer);
      mapBoundaryTimer = undefined;
    }
    this.setData(
      { viewScale: latestViewScale, viewX: latestViewPosition.x, viewY: latestViewPosition.y },
      () => {
        latestViewPosition = { x: this.data.defaultViewX, y: this.data.defaultViewY };
        latestViewScale = MIN_SCALE;
        lastScaleBoundary = 'minimum';
        this.setData({
          defaultViewMessage: '已回到初始位置',
          markerVisualScale: getMarkerVisualScale(MIN_SCALE),
          scaleStatus: getScaleStatus('minimum'),
          selectedMemory: null,
          viewScale: MIN_SCALE,
          viewX: this.data.defaultViewX,
          viewY: this.data.defaultViewY,
        });
      },
    );
  },
  startPickingLocation() {
    this.setData({
      defaultViewMessage: this.data.isMapReady
        ? '移动地图，让目标地点停在准星下方'
        : '地图加载完成后即可用中心准星选点',
      isPickingLocation: true,
      filterPanelOpen: false,
      selectedMemory: null,
    });
  },
  cancelPickingLocation() {
    this.setData({
      defaultViewMessage: '已取消本次选点',
      isPickingLocation: false,
    });
    this.scheduleMapBoundaryCorrection();
  },
  measureRenderedMap(): Promise<{ mapRect: NodeRect; viewportRect: NodeRect }> {
    return new Promise((resolve, reject) => {
      const query = wx.createSelectorQuery();
      query.select('#map-viewport').boundingClientRect();
      query.select('#map-image').boundingClientRect();
      query.exec((results: unknown[]) => {
        const viewportRect = results[0];
        const mapRect = results[1];
        if (!isNodeRect(viewportRect) || !isNodeRect(mapRect)) {
          reject(new Error('无法读取地图的实际显示位置'));
          return;
        }
        resolve({
          mapRect,
          viewportRect,
        });
      });
    });
  },
  async confirmPickingLocation() {
    if (!this.data.isMapReady || this.data.isNavigatingToEditor) {
      this.setData({
        defaultViewMessage: '请等待地图加载完成后再确认位置',
      });
      return;
    }
    this.setData({
      defaultViewMessage: '正在校准准星位置…',
      isNavigatingToEditor: true,
    });
    try {
      const { mapRect, viewportRect } = await this.measureRenderedMap();
      const ratio = renderedViewportCenterToRatio(
        {
          x: viewportRect.left,
          y: viewportRect.top,
          width: viewportRect.width,
          height: viewportRect.height,
        },
        { x: mapRect.left, y: mapRect.top, width: mapRect.width, height: mapRect.height },
      );
      if (!isRatioPointInPolygon(ratio, campusMapConfig.validAreaPolygon)) {
        this.setData({
          defaultViewMessage: '准星位于校园边界外，请移动到地图中的校园区域再确认',
          isNavigatingToEditor: false,
        });
        return;
      }
      const url = `/pages/editor/index?mapXRatio=${ratio.xRatio.toFixed(
        6,
      )}&mapYRatio=${ratio.yRatio.toFixed(6)}`;
      this.setData({ defaultViewMessage: '位置已确认，正在打开记录页…' });
      void wx.navigateTo({
        url,
        success: () => {
          this.setData({
            isNavigatingToEditor: false,
            isPickingLocation: false,
          });
        },
        fail: () => {
          this.setData({
            defaultViewMessage: '记录页打开失败，请稍后重试',
            isNavigatingToEditor: false,
          });
        },
      });
    } catch (error) {
      this.setData({
        defaultViewMessage:
          error instanceof Error ? `${error.message}，请稍后重试` : '地图位置校准失败，请稍后重试',
        isNavigatingToEditor: false,
      });
    }
  },
  handleMarkerTap(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isPickingLocation) {
      return;
    }
    const dataset = event.currentTarget.dataset as { memoryId?: unknown };
    const memoryId = typeof dataset.memoryId === 'string' ? dataset.memoryId : '';
    const memory = this.data.memories.find((item) => item.id === memoryId);
    if (!memory) {
      this.setData({ defaultViewMessage: '这条回忆已不存在，正在刷新地图', selectedMemory: null });
      void this.refreshMemories();
      return;
    }
    this.setData({
      defaultViewMessage: `已选择：${memory.placeName || '校园中的某处'}`,
      selectedMemory: createMemoryCard(memory),
      selectedMemorySource: 'mine',
    });
  },
  async handleFriendMarkerTap(event: WechatMiniprogram.BaseEvent) {
    if (this.data.isPickingLocation) return;
    const memoryId = (event.currentTarget.dataset as { memoryId?: unknown }).memoryId;
    if (typeof memoryId !== 'string') return;
    this.setData({ defaultViewMessage: '正在确认好友回忆权限…', selectedMemory: null });
    try {
      const memory = await cloudMemoryRepository.getSharedMemoryById(memoryId);
      this.setData({
        defaultViewMessage: `已选择 ${memory.ownerDisplayName} 的回忆`,
        selectedMemory: createMemoryCard(memory),
        selectedMemorySource: 'friends',
      });
    } catch (error: unknown) {
      this.setData({
        defaultViewMessage:
          error instanceof Error ? error.message : '这段好友回忆的权限可能已经改变。',
        selectedMemory: null,
      });
      void this.refreshFriendLayer();
    }
  },
  handleMarkerImageError(event: WechatMiniprogram.BaseEvent) {
    const dataset = event.currentTarget.dataset as { memoryId?: unknown };
    const memoryId = typeof dataset.memoryId === 'string' ? dataset.memoryId : '';
    this.setData({
      markers: this.data.markers.map((marker) =>
        marker.id === memoryId ? { ...marker, thumbnailFailed: true } : marker,
      ),
    });
  },
  handleCardImageError() {
    const selectedMemory = this.data.selectedMemory;
    if (selectedMemory) {
      this.setData({
        selectedMemory: {
          ...selectedMemory,
          hasImage: false,
        },
      });
    }
  },
  closeMemoryCard() {
    this.setData({
      selectedMemory: null,
    });
  },
  goToDetail() {
    const selectedMemory = this.data.selectedMemory;
    if (!selectedMemory) {
      this.setData({ defaultViewMessage: '请先选择一个记忆标记' });
      return;
    }
    void wx.navigateTo({
      url: `/pages/detail/index?memoryId=${encodeURIComponent(selectedMemory.id)}${
        this.data.selectedMemorySource === 'friends' ? '&source=friend' : ''
      }`,
      fail: () => this.setData({ defaultViewMessage: '详情页打开失败，请稍后重试' }),
    });
  },
  goToProfile() {
    void wx.navigateTo({
      url: '/pages/profile/index',
      fail: () =>
        this.setData({
          defaultViewMessage: '个人页打开失败，请稍后重试',
        }),
    });
  },
  onUnload() {
    if (mapBoundaryTimer) {
      clearTimeout(mapBoundaryTimer);
      mapBoundaryTimer = undefined;
    }
    latestViewPosition = initialLayout.defaultPosition;
    latestViewScale = MIN_SCALE;
    lastScaleBoundary = 'minimum';
    isMapGestureActive = false;
    mapGestureRevision = 0;
    pendingFocusIntent = null;
  },
});
