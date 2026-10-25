export interface WheelPoint {
  readonly x: number;
  readonly y: number;
}
function assertCount(count: number): number {
  if (!Number.isInteger(count) || count < 2 || count > 24) throw new Error('转盘选项数量无效');
  return 360 / count;
}
export function normalizeWheelAngle(angle: number): number {
  if (!Number.isFinite(angle)) throw new Error('转盘角度无效');
  return ((((angle + 180) % 360) + 360) % 360) - 180;
}
export function wheelIndexAtRotation(rotation: number, count: number): number {
  const step = assertCount(count);
  if (!Number.isFinite(rotation)) throw new Error('转盘角度无效');
  return ((Math.round(-rotation / step) % count) + count) % count;
}
export function wheelRotationForIndex(rotation: number, index: number, count: number): number {
  const step = assertCount(count);
  if (!Number.isInteger(index) || index < 0 || index >= count) throw new Error('转盘选项无效');
  return rotation + normalizeWheelAngle(-index * step - rotation);
}
export function wheelReleaseRotation(rotation: number, velocity: number, count: number): number {
  const speed = Number.isFinite(velocity) ? Math.max(-0.65, Math.min(0.65, velocity)) : 0;
  const projected = rotation + speed * 180;
  return wheelRotationForIndex(rotation, wheelIndexAtRotation(projected, count), count);
}
export function wheelPointAngle(
  point: WheelPoint,
  center: WheelPoint,
  deadRadius = 20,
): number | null {
  if (![point.x, point.y, center.x, center.y].every(Number.isFinite)) return null;
  const x = point.x - center.x;
  const y = point.y - center.y;
  if (Math.hypot(x, y) < deadRadius) return null;
  return normalizeWheelAngle((Math.atan2(y, x) * 180) / Math.PI);
}
