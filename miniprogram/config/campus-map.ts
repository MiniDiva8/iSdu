import type { MapSize, RatioPoint } from '../utils/map-coordinates';

export const CURRENT_MAP_ASSET_VERSION = 'campus-center-clean-illustration-2026-08-v3-rect';
export const LEGACY_MAP_ASSET_VERSION = 'legacy-unversioned-map-v0';

interface CampusMapConfig {
  readonly assetPath: string;
  readonly assetVersion: string;
  readonly clusterDistancePx: number;
  readonly displayName: string;
  readonly focusScale: number;
  readonly maximumScale: number;
  readonly minimumScale: number;
  readonly originalSize: MapSize;
  readonly subjectCenter: RatioPoint;
  readonly validAreaPolygon: readonly RatioPoint[];
}

/**
 * The polygon follows the colored campus boundary on the current 1448 x 1086
 * source image. It intentionally excludes the irregular warm-white margin.
 * Ratios remain relative to the complete source image so existing marker math
 * and persisted coordinates do not depend on a device viewport.
 */
export const campusMapConfig = {
  assetPath: '/assets/demo/campus-map-placeholder.jpg',
  assetVersion: CURRENT_MAP_ASSET_VERSION,
  clusterDistancePx: 54,
  displayName: '山东大学中心校区',
  focusScale: 1.9,
  maximumScale: 2.5,
  minimumScale: 1,
  originalSize: { width: 1448, height: 1086 },
  subjectCenter: { xRatio: 0.54, yRatio: 0.53 },
  validAreaPolygon: [
    { xRatio: 0.39, yRatio: 0.012 },
    { xRatio: 0.82, yRatio: 0.01 },
    { xRatio: 0.85, yRatio: 0.06 },
    { xRatio: 0.86, yRatio: 0.33 },
    { xRatio: 0.93, yRatio: 0.41 },
    { xRatio: 0.975, yRatio: 0.54 },
    { xRatio: 0.95, yRatio: 0.67 },
    { xRatio: 0.88, yRatio: 0.75 },
    { xRatio: 0.87, yRatio: 0.99 },
    { xRatio: 0.43, yRatio: 0.995 },
    { xRatio: 0.36, yRatio: 0.91 },
    { xRatio: 0.25, yRatio: 0.89 },
    { xRatio: 0.22, yRatio: 0.81 },
    { xRatio: 0.11, yRatio: 0.78 },
    { xRatio: 0.045, yRatio: 0.7 },
    { xRatio: 0.03, yRatio: 0.58 },
    { xRatio: 0.012, yRatio: 0.45 },
    { xRatio: 0.04, yRatio: 0.38 },
    { xRatio: 0.15, yRatio: 0.35 },
    { xRatio: 0.18, yRatio: 0.28 },
    { xRatio: 0.18, yRatio: 0.21 },
    { xRatio: 0.25, yRatio: 0.18 },
    { xRatio: 0.36, yRatio: 0.17 },
  ],
} as const satisfies CampusMapConfig;
