import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCenteredOffset,
  calculateCoverSize,
  calculateRenderedMapCenterCorrection,
  calculateRenderedViewportCoverageCorrection,
  calculateTranslationToCenterMapPosition,
  clampRatio,
  clampTranslationToMapCenterBounds,
  clampTranslationToViewportCoverage,
  isRatioPointInPolygon,
  mapPositionToViewportPositionInCanvas,
  mapPositionToViewportPosition,
  mapPositionToRatio,
  ratioToMapPosition,
  renderedViewportCenterToRatio,
  validateRatio,
  viewportCenterToRatio,
  viewportCenterToRatioInCanvas,
  viewportPositionToMapPosition,
  viewportPositionToMapPositionInCanvas,
} from './map-coordinates.ts';
import { campusMapConfig, CURRENT_MAP_ASSET_VERSION } from '../config/campus-map.ts';
import { demoMemories } from '../data/demo-memories.ts';

const MAP_SIZE = { width: 1280, height: 960 };

function assertClose(actual, expected, tolerance = 1e-10) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

test('maps the top-left ratio to the top-left map position', () => {
  assert.deepEqual(ratioToMapPosition({ xRatio: 0, yRatio: 0 }, MAP_SIZE), {
    x: 0,
    y: 0,
  });
});

test('maps the bottom-right ratio to the full map dimensions', () => {
  assert.deepEqual(ratioToMapPosition({ xRatio: 1, yRatio: 1 }, MAP_SIZE), {
    x: 1280,
    y: 960,
  });
});

test('maps the center ratio to the center position', () => {
  assert.deepEqual(ratioToMapPosition({ xRatio: 0.5, yRatio: 0.5 }, MAP_SIZE), {
    x: 640,
    y: 480,
  });
});

test('clamps ratios outside the supported range', () => {
  assert.equal(clampRatio(-0.2), 0);
  assert.equal(clampRatio(1.4), 1);
  assert.deepEqual(ratioToMapPosition({ xRatio: -1, yRatio: 3 }, MAP_SIZE), {
    x: 0,
    y: 960,
  });
});

test('round-trips a ratio through map coordinates', () => {
  const original = { xRatio: 0.42, yRatio: 0.68 };
  const position = ratioToMapPosition(original, MAP_SIZE);
  const result = mapPositionToRatio(position, MAP_SIZE);

  assertClose(result.xRatio, original.xRatio);
  assertClose(result.yRatio, original.yRatio);
});

test('converts consistently across different rendered map sizes', () => {
  assert.deepEqual(
    ratioToMapPosition({ xRatio: 0.25, yRatio: 0.75 }, { width: 600, height: 400 }),
    { x: 150, y: 300 },
  );
  assert.deepEqual(
    ratioToMapPosition({ xRatio: 0.25, yRatio: 0.75 }, { width: 1200, height: 800 }),
    { x: 300, y: 600 },
  );
});

test('handles invalid ratios and rejects invalid map dimensions', () => {
  assert.equal(validateRatio(Number.NaN), false);
  assert.equal(validateRatio(Number.POSITIVE_INFINITY), false);
  assert.equal(validateRatio('0.5'), false);
  assert.equal(validateRatio(0.5), true);
  assert.equal(clampRatio(Number.NaN), 0.5);
  assert.throws(
    () => ratioToMapPosition({ xRatio: 0.5, yRatio: 0.5 }, { width: 0, height: 100 }),
    RangeError,
  );
});

test('resolves the crosshair from actual rendered viewport and map rectangles', () => {
  assert.deepEqual(
    renderedViewportCenterToRatio(
      { x: 20, y: 180, width: 360, height: 420 },
      { x: -250, y: -80, width: 900, height: 675 },
    ),
    { xRatio: 0.5, yRatio: 470 / 675 },
  );
});

test('rendered rectangle selection stays correct across translation and scale', () => {
  const viewport = { x: 12, y: 140, width: 351, height: 480 };
  const originalMapRect = { x: -93, y: 85, width: 724, height: 543 };
  const translatedAndScaledMapRect = { x: -558, y: -226, width: 1810, height: 1357.5 };
  const originalRatio = renderedViewportCenterToRatio(viewport, originalMapRect);
  const zoomedRatio = renderedViewportCenterToRatio(viewport, translatedAndScaledMapRect);

  assertClose(originalRatio.xRatio, (187.5 + 93) / 724);
  assertClose(originalRatio.yRatio, (380 - 85) / 543);
  assertClose(zoomedRatio.xRatio, (187.5 + 558) / 1810);
  assertClose(zoomedRatio.yRatio, (380 + 226) / 1357.5);
});

test('corrects only the rendered map edge that exposes viewport blank space', () => {
  const viewport = { x: 20, y: 100, width: 320, height: 480 };

  assert.deepEqual(
    calculateRenderedViewportCoverageCorrection(
      viewport,
      { x: 35, y: 90, width: 600, height: 700 },
      10,
    ),
    { x: -5, y: 0 },
  );
  assert.deepEqual(
    calculateRenderedViewportCoverageCorrection(
      viewport,
      { x: -300, y: -200, width: 630, height: 770 },
      10,
    ),
    { x: 0, y: 0 },
  );
});

test('keeps every rendered map edge reachable by the fixed centre crosshair', () => {
  const viewport = { x: 20, y: 100, width: 320, height: 480 };

  assert.deepEqual(
    calculateRenderedMapCenterCorrection(viewport, {
      x: 200,
      y: 360,
      width: 600,
      height: 700,
    }),
    { x: -20, y: -20 },
  );
  assert.deepEqual(
    calculateRenderedMapCenterCorrection(viewport, {
      x: -420,
      y: -500,
      width: 500,
      height: 700,
    }),
    { x: 100, y: 140 },
  );
  assert.deepEqual(
    calculateRenderedMapCenterCorrection(viewport, {
      x: -100,
      y: 0,
      width: 800,
      height: 900,
    }),
    { x: 0, y: 0 },
  );
});

test('rejects rendered rectangles when the crosshair is outside the map image', () => {
  assert.throws(
    () =>
      renderedViewportCenterToRatio(
        { x: 0, y: 0, width: 320, height: 480 },
        { x: 400, y: 500, width: 640, height: 480 },
      ),
    RangeError,
  );
});

test('calculates a centered cover layout for different viewport shapes', () => {
  assert.deepEqual(calculateCoverSize(MAP_SIZE, { width: 360, height: 360 }), {
    width: 480,
    height: 360,
  });

  assert.deepEqual(calculateCoverSize(MAP_SIZE, { width: 600, height: 300 }), {
    width: 600,
    height: 450,
  });

  assert.deepEqual(
    calculateCenteredOffset({ width: 480, height: 360 }, { width: 360, height: 360 }),
    { x: -60, y: 0 },
  );
});

test('resolves the viewport center at 1x scale', () => {
  assert.deepEqual(
    viewportCenterToRatio(
      { width: 320, height: 240 },
      { width: 640, height: 480 },
      { x: -160, y: -120 },
      1,
    ),
    { xRatio: 0.5, yRatio: 0.5 },
  );
});

test('resolves map center inside a padded movable canvas', () => {
  const viewportSize = { width: 320, height: 240 };
  const mapSize = { width: 640, height: 480 };
  const frame = {
    canvasSize: { width: 960, height: 720 },
    mapOffset: { x: 160, y: 120 },
  };

  assert.deepEqual(
    viewportCenterToRatioInCanvas(viewportSize, mapSize, frame, { x: -320, y: -240 }, 1),
    { xRatio: 0.5, yRatio: 0.5 },
  );
});

test('allows every map corner to reach the center crosshair at minimum scale', () => {
  const viewportSize = { width: 320, height: 240 };
  const mapSize = { width: 640, height: 480 };
  const frame = {
    canvasSize: { width: 960, height: 720 },
    mapOffset: { x: 160, y: 120 },
  };

  assert.deepEqual(viewportCenterToRatioInCanvas(viewportSize, mapSize, frame, { x: 0, y: 0 }, 1), {
    xRatio: 0,
    yRatio: 0,
  });
  assert.deepEqual(
    viewportCenterToRatioInCanvas(viewportSize, mapSize, frame, { x: -640, y: -480 }, 1),
    { xRatio: 1, yRatio: 1 },
  );
});

test('keeps edge selection and movement bounds correct after zooming', () => {
  const viewportSize = { width: 320, height: 240 };
  const mapSize = { width: 640, height: 480 };
  const frame = {
    canvasSize: { width: 960, height: 720 },
    mapOffset: { x: 160, y: 120 },
  };
  const scale = 2.5;

  assert.deepEqual(
    viewportCenterToRatioInCanvas(viewportSize, mapSize, frame, { x: 480, y: 360 }, scale),
    { xRatio: 0, yRatio: 0 },
  );
  assert.deepEqual(
    viewportCenterToRatioInCanvas(viewportSize, mapSize, frame, { x: -1120, y: -840 }, scale),
    { xRatio: 1, yRatio: 1 },
  );
  assert.deepEqual(
    clampTranslationToMapCenterBounds({ x: 900, y: -2000 }, viewportSize, mapSize, frame, scale),
    { x: 480, y: -840 },
  );
});

test('allows all four map corners to reach the viewport center after zooming', () => {
  const viewportSize = { width: 320, height: 240 };
  const mapSize = { width: 640, height: 480 };
  const frame = {
    canvasSize: { width: 960, height: 720 },
    mapOffset: { x: 160, y: 120 },
  };
  const scale = 2.5;
  const cornerTranslations = [
    { translation: { x: 480, y: 360 }, ratio: { xRatio: 0, yRatio: 0 } },
    { translation: { x: -1120, y: 360 }, ratio: { xRatio: 1, yRatio: 0 } },
    { translation: { x: 480, y: -840 }, ratio: { xRatio: 0, yRatio: 1 } },
    { translation: { x: -1120, y: -840 }, ratio: { xRatio: 1, yRatio: 1 } },
  ];

  for (const { translation, ratio } of cornerTranslations) {
    assert.deepEqual(
      clampTranslationToMapCenterBounds(translation, viewportSize, mapSize, frame, scale),
      translation,
    );
    assert.deepEqual(
      viewportCenterToRatioInCanvas(viewportSize, mapSize, frame, translation, scale),
      ratio,
    );
  }
});

test('prevents the padded canvas from settling as a large blank viewport', () => {
  const viewportSize = { width: 320, height: 240 };
  const mapSize = { width: 640, height: 480 };
  const frame = {
    canvasSize: { width: 960, height: 720 },
    mapOffset: { x: 160, y: 120 },
  };

  assert.deepEqual(
    clampTranslationToViewportCoverage({ x: 900, y: -2000 }, viewportSize, mapSize, frame, 1, 12),
    { x: -148, y: -372 },
  );
});

test('keeps translations that already cover the viewport unchanged', () => {
  const viewportSize = { width: 320, height: 240 };
  const mapSize = { width: 640, height: 480 };
  const frame = {
    canvasSize: { width: 960, height: 720 },
    mapOffset: { x: 160, y: 120 },
  };

  assert.deepEqual(
    clampTranslationToViewportCoverage({ x: -320, y: -240 }, viewportSize, mapSize, frame, 2.5, 12),
    { x: -320, y: -240 },
  );
  assert.throws(
    () => clampTranslationToViewportCoverage({ x: 0, y: 0 }, viewportSize, mapSize, frame, 1, -1),
    RangeError,
  );
});

test('keeps a saved marker on the exact selected map point inside the padded canvas', () => {
  const mapSize = { width: 640, height: 480 };
  const frame = {
    canvasSize: { width: 960, height: 720 },
    mapOffset: { x: 160, y: 120 },
  };
  const translation = { x: -475.25, y: -186.75 };
  const scale = 2.1;
  const markerMapPosition = ratioToMapPosition({ xRatio: 0.82, yRatio: 0.18 }, mapSize);
  const markerViewportPosition = mapPositionToViewportPositionInCanvas(
    markerMapPosition,
    mapSize,
    frame,
    translation,
    scale,
  );
  const selectedMapPosition = viewportPositionToMapPositionInCanvas(
    markerViewportPosition,
    mapSize,
    frame,
    translation,
    scale,
  );

  assertClose(selectedMapPosition.x, markerMapPosition.x);
  assertClose(selectedMapPosition.y, markerMapPosition.y);
  const selectedRatio = mapPositionToRatio(selectedMapPosition, mapSize);
  assertClose(selectedRatio.xRatio, 0.82);
  assertClose(selectedRatio.yRatio, 0.18);
});

test('keeps the viewport center stable at 2x scale around the movable-view center', () => {
  assert.deepEqual(
    viewportCenterToRatio(
      { width: 320, height: 240 },
      { width: 640, height: 480 },
      { x: -160, y: -120 },
      2,
    ),
    { xRatio: 0.5, yRatio: 0.5 },
  );
});

test('accounts for translation and scale when resolving the viewport center', () => {
  const result = viewportCenterToRatio(
    { width: 300, height: 200 },
    { width: 600, height: 400 },
    { x: -50, y: -20 },
    2,
  );

  assertClose(result.xRatio, 5 / 12);
  assertClose(result.yRatio, 0.4);
});

test('round-trips map and viewport positions through a center-origin transform', () => {
  const mapSize = { width: 1280, height: 960 };
  const translation = { x: -237.5, y: -119.25 };
  const scale = 2.2;
  const original = { x: 413.75, y: 702.5 };

  const viewportPosition = mapPositionToViewportPosition(original, mapSize, translation, scale);
  const result = viewportPositionToMapPosition(viewportPosition, mapSize, translation, scale);

  assertClose(result.x, original.x);
  assertClose(result.y, original.y);
});

test('rejects invalid scales and translations', () => {
  const mapSize = { width: 640, height: 480 };
  const viewportPosition = { x: 160, y: 120 };

  for (const scale of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => viewportPositionToMapPosition(viewportPosition, mapSize, { x: 0, y: 0 }, scale),
      RangeError,
    );
  }

  assert.throws(
    () => viewportPositionToMapPosition(viewportPosition, mapSize, { x: Number.NaN, y: 0 }, 1),
    RangeError,
  );
  assert.throws(
    () =>
      mapPositionToViewportPosition(
        { x: 320, y: 240 },
        mapSize,
        { x: 0, y: Number.POSITIVE_INFINITY },
        1,
      ),
    RangeError,
  );
});

test('rejects a viewport center that resolves outside the map', () => {
  assert.throws(
    () =>
      viewportCenterToRatio(
        { width: 300, height: 200 },
        { width: 600, height: 400 },
        { x: 200, y: 0 },
        1,
      ),
    RangeError,
  );
});

test('recognizes points inside, outside and on the boundary of a ratio polygon', () => {
  const polygon = [
    { xRatio: 0.1, yRatio: 0.1 },
    { xRatio: 0.9, yRatio: 0.1 },
    { xRatio: 0.9, yRatio: 0.9 },
    { xRatio: 0.5, yRatio: 0.55 },
    { xRatio: 0.1, yRatio: 0.9 },
  ];

  assert.equal(isRatioPointInPolygon({ xRatio: 0.3, yRatio: 0.3 }, polygon), true);
  assert.equal(isRatioPointInPolygon({ xRatio: 0.5, yRatio: 0.8 }, polygon), false);
  assert.equal(isRatioPointInPolygon({ xRatio: 0.1, yRatio: 0.5 }, polygon), true);
  assert.equal(isRatioPointInPolygon({ xRatio: 0.95, yRatio: 0.5 }, polygon), false);
});

test('rejects malformed ratio polygons without throwing', () => {
  assert.equal(
    isRatioPointInPolygon({ xRatio: 0.5, yRatio: 0.5 }, [
      { xRatio: 0, yRatio: 0 },
      { xRatio: 1, yRatio: 0 },
    ]),
    false,
  );
  assert.equal(
    isRatioPointInPolygon({ xRatio: Number.NaN, yRatio: 0.5 }, [
      { xRatio: 0, yRatio: 0 },
      { xRatio: 1, yRatio: 0 },
      { xRatio: 0, yRatio: 1 },
    ]),
    false,
  );
});

test('keeps the current map asset, boundary and demo coordinates in sync', () => {
  assert.deepEqual(campusMapConfig.originalSize, { width: 1448, height: 1086 });
  assert.equal(campusMapConfig.assetVersion, CURRENT_MAP_ASSET_VERSION);
  assert.match(CURRENT_MAP_ASSET_VERSION, /v3-rect$/u);
  assert.equal(
    isRatioPointInPolygon(campusMapConfig.subjectCenter, campusMapConfig.validAreaPolygon),
    true,
  );

  for (const memory of demoMemories) {
    assert.equal(memory.mapAssetVersion, CURRENT_MAP_ASSET_VERSION);
    assert.equal(
      isRatioPointInPolygon(
        { xRatio: memory.mapXRatio, yRatio: memory.mapYRatio },
        campusMapConfig.validAreaPolygon,
      ),
      true,
    );
  }
});

test('calculates translation that centers a map point at different scales', () => {
  const viewportSize = { width: 360, height: 300 };
  const mapSize = { width: 640, height: 480 };
  const mapPoint = { x: 192, y: 336 };

  for (const scale of [1, 1.75, 2.5]) {
    const translation = calculateTranslationToCenterMapPosition(
      mapPoint,
      mapSize,
      viewportSize,
      scale,
    );
    const viewportPoint = mapPositionToViewportPosition(mapPoint, mapSize, translation, scale);

    assertClose(viewportPoint.x, viewportSize.width / 2);
    assertClose(viewportPoint.y, viewportSize.height / 2);
  }
});
