import type { CompanionPlacement } from '../models/companion';
import { resolveCompanionAsset, companionFurnitureLayer } from '../data/companion-assets';
export const COMPANION_WORLD = { width: 800, height: 1100 };
export interface CompanionPoint {
  x: number;
  y: number;
}
export interface CompanionViewport {
  width: number;
  height: number;
}
export interface CompanionCamera {
  x: number;
  y: number;
  zoom: number;
}
export interface CompanionPosition extends CompanionPoint {
  moving: boolean;
  facing: number;
}
export function companionGroundPoint(p: CompanionPoint, theme: string): CompanionPoint {
  const minimum = theme === 'dusk' ? 0.52 : theme === 'blossom' ? 0.58 : 0.54;
  return {
    x: Math.max(0.08, Math.min(0.92, Number.isFinite(p.x) ? p.x : 0.5)),
    y: Math.max(minimum, Math.min(0.9, Number.isFinite(p.y) ? p.y : (minimum + 0.9) / 2)),
  };
}
export function companionDepthScale(y: number): number {
  const t = Math.max(0, Math.min(1, ((Number.isFinite(y) ? y : 0.72) - 0.54) / 0.36));
  return 0.8 + 0.32 * t * t * (3 - 2 * t);
}
export function companionScale(c: CompanionCamera, v: CompanionViewport): number {
  return Math.max(v.width / COMPANION_WORLD.width, v.height / COMPANION_WORLD.height) * c.zoom;
}
export function clampCompanionCamera(c: CompanionCamera, v: CompanionViewport): CompanionCamera {
  const zoom = Number.isFinite(c.zoom) ? Math.max(1, Math.min(2.5, c.zoom)) : 1,
    scale = companionScale({ ...c, zoom }, v);
  const maxX = Math.max(0, (800 * scale - v.width) / 2),
    maxY = Math.max(0, (1100 * scale - v.height) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, Number.isFinite(c.x) ? c.x : 0)),
    y: Math.max(-maxY, Math.min(maxY, Number.isFinite(c.y) ? c.y : 0)),
    zoom,
  };
}
export function worldToScreen(
  p: CompanionPoint,
  c: CompanionCamera,
  v: CompanionViewport,
): CompanionPoint {
  const s = companionScale(c, v);
  return {
    x: (p.x - 0.5) * 800 * s + v.width / 2 + c.x,
    y: (p.y - 0.5) * 1100 * s + v.height / 2 + c.y,
  };
}
export function screenToWorld(
  p: CompanionPoint,
  c: CompanionCamera,
  v: CompanionViewport,
): CompanionPoint {
  const s = companionScale(c, v);
  return {
    x: (p.x - v.width / 2 - c.x) / (800 * s) + 0.5,
    y: (p.y - v.height / 2 - c.y) / (1100 * s) + 0.5,
  };
}
export function zoomCompanionCamera(
  c: CompanionCamera,
  zoom: number,
  anchor: CompanionPoint,
  v: CompanionViewport,
): CompanionCamera {
  const point = screenToWorld(anchor, c, v),
    next = clampCompanionCamera({ ...c, zoom }, v),
    projected = worldToScreen(point, next, v);
  return clampCompanionCamera(
    { ...next, x: next.x + anchor.x - projected.x, y: next.y + anchor.y - projected.y },
    v,
  );
}
export function stepCompanion(
  p: CompanionPosition,
  target: CompanionPoint,
  elapsed: number,
): CompanionPosition {
  const dx = (target.x - p.x) * 800,
    dy = (target.y - p.y) * 1100,
    distance = Math.hypot(dx, dy);
  const step = 160 * Math.max(0, Math.min(0.05, Number.isFinite(elapsed) ? elapsed : 0));
  if (distance < 0.5 || distance <= step)
    return { ...target, moving: false, facing: dx < 0 ? -1 : dx > 0 ? 1 : p.facing };
  return {
    x: p.x + ((target.x - p.x) * step) / distance,
    y: p.y + ((target.y - p.y) * step) / distance,
    moving: true,
    facing: dx < 0 ? -1 : dx > 0 ? 1 : p.facing,
  };
}
export function hitCompanionFurniture(
  p: CompanionPoint,
  items: readonly CompanionPlacement[],
): CompanionPlacement | null {
  for (const item of [...items]
    .reverse()
    .sort(
      (a, b) => companionFurnitureLayer(b.itemId) - companionFurnitureLayer(a.itemId) || b.y - a.y,
    )) {
    const a = resolveCompanionAsset('furniture', item.itemId),
      depth = companionFurnitureLayer(item.itemId) === 2 ? companionDepthScale(item.y) : 1,
      x = ((p.x - item.x) * 800) / depth,
      y = ((p.y - item.y) * 1100) / depth;
    const angle = (-item.rotation * Math.PI) / 180;
    const localX = x * Math.cos(angle) - y * Math.sin(angle);
    const localY = x * Math.sin(angle) + y * Math.cos(angle);
    if (
      localX >= -a.width * a.anchorX &&
      localX <= a.width * (1 - a.anchorX) &&
      localY >= -a.height * a.anchorY &&
      localY <= a.height * (1 - a.anchorY)
    )
      return item;
  }
  return null;
}
