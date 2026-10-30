export const AVATAR_BALL_RADIUS = 0.46;
export const AVATAR_TRAVEL_LIMIT = 1 - AVATAR_BALL_RADIUS;
export interface AvatarPose {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  omega: number;
}
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
function limitVelocity(pose: AvatarPose) {
  const speed = Math.hypot(pose.vx, pose.vy);
  if (speed > 3.8) {
    pose.vx *= 3.8 / speed;
    pose.vy *= 3.8 / speed;
  }
  pose.omega = clamp(pose.omega, 8);
}
export class AvatarMotion {
  private pose: AvatarPose = this.home();
  private gravity = { x: 0, y: 1 };
  private wakeGravity = { x: 0, y: 1 };
  private lastSample: { x: number; y: number; z: number } | null = null;
  private home(): AvatarPose {
    return { x: 0, y: AVATAR_TRAVEL_LIMIT, vx: 0, vy: 0, angle: 0, omega: 0 };
  }
  reset(): void {
    this.pose = this.home();
    this.gravity = { x: 0, y: 1 };
    this.wakeGravity = { x: 0, y: 1 };
    this.lastSample = null;
  }
  snapshot(): AvatarPose {
    return { ...this.pose };
  }
  setGravity(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const length = Math.hypot(x, y);
    const factor = length > 1.8 ? 1.8 / length : 1;
    const next = { x: x * factor, y: y * factor };
    if (length < 0.12) next.y = 0.25;
    const changed = Math.hypot(next.x - this.wakeGravity.x, next.y - this.wakeGravity.y) > 0.003;
    this.gravity = next;
    if (changed) this.wakeGravity = { ...next };
    return changed;
  }
  acceptAcceleration(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false;
    const sample = value as Record<string, unknown>;
    if (
      typeof sample.x !== 'number' ||
      typeof sample.y !== 'number' ||
      typeof sample.z !== 'number' ||
      ![sample.x, sample.y, sample.z].every(Number.isFinite)
    )
      return false;
    const next = { x: clamp(sample.x, 3), y: clamp(sample.y, 3), z: clamp(sample.z, 3) };
    const gx = clamp(next.x, 1.8);
    let gy = clamp(-next.y, 1.8);
    if (Math.hypot(gx, gy) < 0.12) gy = 0.25;
    let changed = this.setGravity(
      this.gravity.x + (gx - this.gravity.x) * 0.18,
      this.gravity.y + (gy - this.gravity.y) * 0.18,
    );
    if (this.lastSample) {
      const dx = next.x - this.lastSample.x,
        dy = -(next.y - this.lastSample.y);
      if (Math.hypot(dx, dy) > 0.55) changed = this.kick(-dx * 0.55, -dy * 0.55) || changed;
    }
    this.lastSample = next;
    return changed;
  }
  kick(x: number, y: number): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    this.pose.vx += clamp(x, 3.8);
    this.pose.vy += clamp(y, 3.8);
    this.pose.omega += clamp(-x * 0.7 + y * 0.15, 5);
    limitVelocity(this.pose);
    return true;
  }
  advance(milliseconds: number): void {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return;
    const elapsed = Math.min(milliseconds, 50) / 1000;
    const steps = Math.ceil(elapsed * 120);
    for (let i = 0; i < steps; i += 1) this.integrate(elapsed / steps);
  }
  private integrate(dt: number): void {
    const p = this.pose;
    const damping = Math.exp(-1.6 * dt);
    p.vx = (p.vx + this.gravity.x * 3.8 * dt) * damping;
    p.vy = (p.vy + this.gravity.y * 3.8 * dt) * damping;
    limitVelocity(p);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const distance = Math.hypot(p.x, p.y);
    if (distance > AVATAR_TRAVEL_LIMIT) {
      const nx = p.x / distance,
        ny = p.y / distance;
      p.x = nx * AVATAR_TRAVEL_LIMIT;
      p.y = ny * AVATAR_TRAVEL_LIMIT;
      const outward = p.vx * nx + p.vy * ny;
      if (outward > 0) {
        const restitution = outward < 0.12 ? 0 : 0.18;
        p.vx -= (1 + restitution) * outward * nx;
        p.vy -= (1 + restitution) * outward * ny;
      }
      const tangentSpeed = -ny * p.vx + nx * p.vy;
      p.omega += (-tangentSpeed / AVATAR_BALL_RADIUS - p.omega) * 0.16;
    }
    p.omega *= Math.exp(-3.2 * dt);
    p.angle += p.omega * dt;
    p.angle = Math.atan2(Math.sin(p.angle), Math.cos(p.angle));
  }
  isSettled(): boolean {
    const length = Math.hypot(this.gravity.x, this.gravity.y);
    const restingX = (this.gravity.x / length) * AVATAR_TRAVEL_LIMIT;
    const restingY = (this.gravity.y / length) * AVATAR_TRAVEL_LIMIT;
    return (
      Math.hypot(this.pose.vx, this.pose.vy) < 0.012 &&
      Math.abs(this.pose.omega) < 0.025 &&
      Math.hypot(this.pose.x - restingX, this.pose.y - restingY) < 0.003
    );
  }
}
