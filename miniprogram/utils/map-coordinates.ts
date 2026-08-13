export interface MapSize {
  width: number;
  height: number;
}

export interface MapPosition {
  x: number;
  y: number;
}

export interface RatioPoint {
  xRatio: number;
  yRatio: number;
}

export interface RenderedRect extends MapSize, MapPosition {}

export interface MapCanvasFrame {
  canvasSize: MapSize;
  mapOffset: MapPosition;
}

const MIN_RATIO = 0;
const MAX_RATIO = 1;
const INVALID_RATIO_FALLBACK = 0.5;

function assertValidSize(size: MapSize, label: string): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new RangeError(`${label} width and height must be finite positive numbers`);
  }
}

function assertFinitePosition(position: MapPosition, label: string): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new RangeError(`${label} x and y must be finite numbers`);
  }
}

function assertValidScale(scale: number): void {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError('scale must be a finite positive number');
  }
}

export function validateRatio(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= MIN_RATIO && value <= MAX_RATIO
  );
}

export function clampRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return INVALID_RATIO_FALLBACK;
  }

  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, value));
}

export function ratioToMapPosition(point: RatioPoint, mapSize: MapSize): MapPosition {
  assertValidSize(mapSize, 'mapSize');

  return {
    x: clampRatio(point.xRatio) * mapSize.width,
    y: clampRatio(point.yRatio) * mapSize.height,
  };
}

export function mapPositionToRatio(position: MapPosition, mapSize: MapSize): RatioPoint {
  assertValidSize(mapSize, 'mapSize');

  return {
    xRatio: clampRatio(position.x / mapSize.width),
    yRatio: clampRatio(position.y / mapSize.height),
  };
}

/**
 * Resolves the center of the visible viewport directly against the map
 * image's rendered rectangle. Both rectangles use screen coordinates, so the
 * result is independent of movable-view's platform-specific scale origin and
 * x/y event semantics.
 */
export function renderedViewportCenterToRatio(
  viewportRect: RenderedRect,
  mapRect: RenderedRect,
): RatioPoint {
  assertValidSize(viewportRect, 'viewportRect');
  assertFinitePosition(viewportRect, 'viewportRect');
  assertValidSize(mapRect, 'mapRect');
  assertFinitePosition(mapRect, 'mapRect');

  const viewportCenter = {
    x: viewportRect.x + viewportRect.width / 2,
    y: viewportRect.y + viewportRect.height / 2,
  };
  const mapPosition = {
    x: viewportCenter.x - mapRect.x,
    y: viewportCenter.y - mapRect.y,
  };

  if (!isMapPositionWithinBounds(mapPosition, mapRect)) {
    throw new RangeError('rendered viewport center must be inside the rendered map');
  }

  return mapPositionToRatio(mapPosition, mapRect);
}

export function mapPositionToViewportPosition(
  position: MapPosition,
  mapSize: MapSize,
  translation: MapPosition,
  scale: number,
): MapPosition {
  assertValidSize(mapSize, 'mapSize');
  assertFinitePosition(position, 'position');
  assertFinitePosition(translation, 'translation');
  assertValidScale(scale);

  const originX = mapSize.width / 2;
  const originY = mapSize.height / 2;

  return {
    x: translation.x + originX + scale * (position.x - originX),
    y: translation.y + originY + scale * (position.y - originY),
  };
}

export function viewportPositionToMapPosition(
  position: MapPosition,
  mapSize: MapSize,
  translation: MapPosition,
  scale: number,
): MapPosition {
  assertValidSize(mapSize, 'mapSize');
  assertFinitePosition(position, 'position');
  assertFinitePosition(translation, 'translation');
  assertValidScale(scale);

  const originX = mapSize.width / 2;
  const originY = mapSize.height / 2;

  return {
    x: originX + (position.x - translation.x - originX) / scale,
    y: originY + (position.y - translation.y - originY) / scale,
  };
}

export function isMapPositionWithinBounds(position: MapPosition, mapSize: MapSize): boolean {
  assertValidSize(mapSize, 'mapSize');

  return (
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    position.x >= 0 &&
    position.x <= mapSize.width &&
    position.y >= 0 &&
    position.y <= mapSize.height
  );
}

function isRatioPointOnSegment(point: RatioPoint, start: RatioPoint, end: RatioPoint): boolean {
  const crossProduct =
    (point.yRatio - start.yRatio) * (end.xRatio - start.xRatio) -
    (point.xRatio - start.xRatio) * (end.yRatio - start.yRatio);

  if (Math.abs(crossProduct) > Number.EPSILON * 16) {
    return false;
  }

  const dotProduct =
    (point.xRatio - start.xRatio) * (end.xRatio - start.xRatio) +
    (point.yRatio - start.yRatio) * (end.yRatio - start.yRatio);
  const squaredLength = (end.xRatio - start.xRatio) ** 2 + (end.yRatio - start.yRatio) ** 2;

  return dotProduct >= 0 && dotProduct <= squaredLength;
}

/** Returns true for points inside the polygon or on its boundary. */
export function isRatioPointInPolygon(point: RatioPoint, polygon: readonly RatioPoint[]): boolean {
  if (
    !validateRatio(point.xRatio) ||
    !validateRatio(point.yRatio) ||
    polygon.length < 3 ||
    polygon.some((vertex) => !validateRatio(vertex.xRatio) || !validateRatio(vertex.yRatio))
  ) {
    return false;
  }

  let isInside = false;

  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];

    if (!current || !previous) {
      return false;
    }

    if (isRatioPointOnSegment(point, previous, current)) {
      return true;
    }

    const crossesHorizontalRay =
      current.yRatio > point.yRatio !== previous.yRatio > point.yRatio &&
      point.xRatio <
        ((previous.xRatio - current.xRatio) * (point.yRatio - current.yRatio)) /
          (previous.yRatio - current.yRatio) +
          current.xRatio;

    if (crossesHorizontalRay) {
      isInside = !isInside;
    }

    previousIndex = index;
  }

  return isInside;
}

/**
 * Calculates the movable-view translation that places a map point at the
 * center of the viewport for a center-origin scale transform.
 */
export function calculateTranslationToCenterMapPosition(
  position: MapPosition,
  mapSize: MapSize,
  viewportSize: MapSize,
  scale: number,
): MapPosition {
  assertFinitePosition(position, 'position');
  assertValidSize(mapSize, 'mapSize');
  assertValidSize(viewportSize, 'viewportSize');
  assertValidScale(scale);

  const originX = mapSize.width / 2;
  const originY = mapSize.height / 2;

  return {
    x: viewportSize.width / 2 - originX - scale * (position.x - originX),
    y: viewportSize.height / 2 - originY - scale * (position.y - originY),
  };
}

export function viewportCenterToRatio(
  viewportSize: MapSize,
  mapSize: MapSize,
  translation: MapPosition,
  scale: number,
): RatioPoint {
  assertValidSize(viewportSize, 'viewportSize');

  const mapPosition = viewportPositionToMapPosition(
    {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
    },
    mapSize,
    translation,
    scale,
  );

  if (!isMapPositionWithinBounds(mapPosition, mapSize)) {
    throw new RangeError('viewport center must resolve to a position within the map');
  }

  return mapPositionToRatio(mapPosition, mapSize);
}

/**
 * Converts a viewport position into a map position when the map is embedded
 * inside a larger movable-view canvas. The canvas is scaled around its center,
 * while mapOffset locates the original map's top-left corner in that canvas.
 */
export function viewportPositionToMapPositionInCanvas(
  position: MapPosition,
  mapSize: MapSize,
  frame: MapCanvasFrame,
  translation: MapPosition,
  scale: number,
): MapPosition {
  assertFinitePosition(position, 'position');
  assertValidSize(mapSize, 'mapSize');
  assertValidSize(frame.canvasSize, 'canvasSize');
  assertFinitePosition(frame.mapOffset, 'mapOffset');
  assertFinitePosition(translation, 'translation');
  assertValidScale(scale);

  const canvasOriginX = frame.canvasSize.width / 2;
  const canvasOriginY = frame.canvasSize.height / 2;

  return {
    x: canvasOriginX + (position.x - translation.x - canvasOriginX) / scale - frame.mapOffset.x,
    y: canvasOriginY + (position.y - translation.y - canvasOriginY) / scale - frame.mapOffset.y,
  };
}

export function mapPositionToViewportPositionInCanvas(
  position: MapPosition,
  mapSize: MapSize,
  frame: MapCanvasFrame,
  translation: MapPosition,
  scale: number,
): MapPosition {
  assertFinitePosition(position, 'position');
  assertValidSize(mapSize, 'mapSize');
  assertValidSize(frame.canvasSize, 'canvasSize');
  assertFinitePosition(frame.mapOffset, 'mapOffset');
  assertFinitePosition(translation, 'translation');
  assertValidScale(scale);

  const canvasOriginX = frame.canvasSize.width / 2;
  const canvasOriginY = frame.canvasSize.height / 2;
  const canvasPositionX = frame.mapOffset.x + position.x;
  const canvasPositionY = frame.mapOffset.y + position.y;

  return {
    x: translation.x + canvasOriginX + scale * (canvasPositionX - canvasOriginX),
    y: translation.y + canvasOriginY + scale * (canvasPositionY - canvasOriginY),
  };
}

export function viewportCenterToRatioInCanvas(
  viewportSize: MapSize,
  mapSize: MapSize,
  frame: MapCanvasFrame,
  translation: MapPosition,
  scale: number,
): RatioPoint {
  assertValidSize(viewportSize, 'viewportSize');

  const mapPosition = viewportPositionToMapPositionInCanvas(
    {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
    },
    mapSize,
    frame,
    translation,
    scale,
  );

  if (!isMapPositionWithinBounds(mapPosition, mapSize)) {
    throw new RangeError('viewport center must resolve to a position within the map');
  }

  return mapPositionToRatio(mapPosition, mapSize);
}

/**
 * Clamps movable-view translation so the viewport center always resolves to
 * a point on the map. This keeps the map visible while still allowing every
 * edge and corner to reach the fixed center crosshair.
 */
export function clampTranslationToMapCenterBounds(
  translation: MapPosition,
  viewportSize: MapSize,
  mapSize: MapSize,
  frame: MapCanvasFrame,
  scale: number,
): MapPosition {
  assertFinitePosition(translation, 'translation');
  assertValidSize(viewportSize, 'viewportSize');
  assertValidSize(mapSize, 'mapSize');
  assertValidSize(frame.canvasSize, 'canvasSize');
  assertFinitePosition(frame.mapOffset, 'mapOffset');
  assertValidScale(scale);

  const canvasOriginX = frame.canvasSize.width / 2;
  const canvasOriginY = frame.canvasSize.height / 2;
  const viewportCenterX = viewportSize.width / 2;
  const viewportCenterY = viewportSize.height / 2;
  const mapStartX = frame.mapOffset.x;
  const mapStartY = frame.mapOffset.y;
  const mapEndX = mapStartX + mapSize.width;
  const mapEndY = mapStartY + mapSize.height;

  const minimumX = viewportCenterX - canvasOriginX - scale * (mapEndX - canvasOriginX);
  const maximumX = viewportCenterX - canvasOriginX - scale * (mapStartX - canvasOriginX);
  const minimumY = viewportCenterY - canvasOriginY - scale * (mapEndY - canvasOriginY);
  const maximumY = viewportCenterY - canvasOriginY - scale * (mapStartY - canvasOriginY);

  return {
    x: Math.min(maximumX, Math.max(minimumX, translation.x)),
    y: Math.min(maximumY, Math.max(minimumY, translation.y)),
  };
}

/**
 * Clamps movable-view translation so the rendered map continues covering the
 * viewport. A small allowance keeps the native edge resistance visible without
 * letting the padded canvas settle as a large blank area.
 */
export function clampTranslationToViewportCoverage(
  translation: MapPosition,
  viewportSize: MapSize,
  mapSize: MapSize,
  frame: MapCanvasFrame,
  scale: number,
  blankAllowance = 0,
): MapPosition {
  assertFinitePosition(translation, 'translation');
  assertValidSize(viewportSize, 'viewportSize');
  assertValidSize(mapSize, 'mapSize');
  assertValidSize(frame.canvasSize, 'canvasSize');
  assertFinitePosition(frame.mapOffset, 'mapOffset');
  assertValidScale(scale);

  if (!Number.isFinite(blankAllowance) || blankAllowance < 0) {
    throw new RangeError('blankAllowance must be a non-negative finite number');
  }

  const canvasOriginX = frame.canvasSize.width / 2;
  const canvasOriginY = frame.canvasSize.height / 2;
  const scaledMapStartWithoutTranslationX =
    canvasOriginX + scale * (frame.mapOffset.x - canvasOriginX);
  const scaledMapStartWithoutTranslationY =
    canvasOriginY + scale * (frame.mapOffset.y - canvasOriginY);
  const minimumX =
    viewportSize.width - blankAllowance - scaledMapStartWithoutTranslationX - scale * mapSize.width;
  const maximumX = blankAllowance - scaledMapStartWithoutTranslationX;
  const minimumY =
    viewportSize.height -
    blankAllowance -
    scaledMapStartWithoutTranslationY -
    scale * mapSize.height;
  const maximumY = blankAllowance - scaledMapStartWithoutTranslationY;

  return {
    x: Math.min(maximumX, Math.max(minimumX, translation.x)),
    y: Math.min(maximumY, Math.max(minimumY, translation.y)),
  };
}

export function calculateCoverSize(mapSize: MapSize, viewportSize: MapSize): MapSize {
  assertValidSize(mapSize, 'mapSize');
  assertValidSize(viewportSize, 'viewportSize');

  const scale = Math.max(viewportSize.width / mapSize.width, viewportSize.height / mapSize.height);

  return {
    width: mapSize.width * scale,
    height: mapSize.height * scale,
  };
}

export function calculateCenteredOffset(contentSize: MapSize, viewportSize: MapSize): MapPosition {
  assertValidSize(contentSize, 'contentSize');
  assertValidSize(viewportSize, 'viewportSize');

  return {
    x: (viewportSize.width - contentSize.width) / 2,
    y: (viewportSize.height - contentSize.height) / 2,
  };
}
