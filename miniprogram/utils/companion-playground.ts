import type { CompanionFacts, CompanionState, CompanionTask } from '../models/companion';
import { COMPANION_SKINS } from '../data/companion-catalog';
import { resolveCompanionAsset } from '../data/companion-assets';
import { buildCompanionTasks } from './companion-engine';

export interface PlaygroundBody {
  id: string;
  skinId: string;
  variant: number;
  x: number;
  y: number;
  z: number;
  size: number;
  vx: number;
  vy: number;
  vz: number;
  wait: number;
  tilt: number;
}
export interface PlaygroundRound {
  width: number;
  height: number;
  luckyId: string;
  bodies: PlaygroundBody[];
  seed: number;
}
export interface PlaygroundNote {
  id: string;
  name: string;
  role: string;
  line: string;
  src: string;
  color: string;
  task: CompanionTask;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function createPlayground(
  width: number,
  height: number,
  random: () => number = Math.random,
): PlaygroundRound {
  width = Number.isFinite(width) ? Math.max(180, width) : 300;
  height = Number.isFinite(height) ? Math.max(260, height) : 400;
  const unit = () => {
    const value = random();
    return Number.isFinite(value) ? clamp(value, 0, 0.999999) : 0.5;
  };
  const count = 20,
    lucky = Math.floor(unit() * count);
  const cols = Math.max(2, Math.min(10, Math.round(Math.sqrt((count * width) / height))));
  const rows = Math.ceil(count / cols);
  const baseSize = clamp(Math.sqrt((width * height) / count) * 0.76, 58, 198);
  const cells = Array.from({ length: cols * rows }, (_, index) => index);
  for (let index = cells.length - 1; index > 0; index--) {
    const other = Math.floor(unit() * (index + 1));
    [cells[index], cells[other]] = [cells[other] ?? 0, cells[index] ?? 0];
  }
  const bodies = Array.from({ length: count }, (_, index) => {
    const skinId = COMPANION_SKINS[index % COMPANION_SKINS.length]?.id ?? 'sprout';
    const variant = Math.floor(index / COMPANION_SKINS.length);
    const id = variant ? skinId + '_' + variant : skinId;
    const size = Math.min(baseSize * (0.82 + unit() * 0.36), width * 0.38, height * 0.23);
    const cell = cells[index] ?? index;
    return {
      id,
      skinId,
      variant,
      size,
      x: clamp((((cell % cols) + 0.28 + unit() * 0.44) * width) / cols, size / 2, width - size / 2),
      y: clamp(
        ((Math.floor(cell / cols) + 0.28 + unit() * 0.44) * height) / rows,
        Math.max(size / 2, 76),
        height - size / 2,
      ),
      z: 0,
      vx: (unit() - 0.5) * size * 0.8,
      vy: (unit() - 0.5) * size * 0.66,
      vz: 0,
      wait: 0.1 + unit() * 3.4,
      tilt: (unit() - 0.5) * 20,
    };
  });
  return {
    width,
    height,
    luckyId: bodies[lucky]?.id ?? 'sprout',
    bodies,
    seed: Math.floor(unit() * 0xffffffff) || 74291,
  };
}

function nextRandom(round: PlaygroundRound): number {
  round.seed = (Math.imul(round.seed, 1664525) + 1013904223) >>> 0;
  return round.seed / 0x100000000;
}

/** Mutates only the transient field; elapsed time is bounded after a suspended frame. */
export function stepPlayground(round: PlaygroundRound, seconds: number, heldId = ''): void {
  const dt = Number.isFinite(seconds) ? clamp(seconds, 0, 0.04) : 0;
  if (!dt) return;
  for (const b of round.bodies) {
    if (b.id === heldId) continue;
    b.wait -= dt;
    if (b.wait <= 0 && b.z === 0) {
      b.vz = b.size * (1.2 + nextRandom(round) * 0.85);
      b.wait = 1.2 + nextRandom(round) * 3.3;
      const angle = nextRandom(round) * Math.PI * 2;
      const speed = b.size * (0.23 + nextRandom(round) * 0.32);
      b.vx = Math.cos(angle) * speed;
      b.vy = Math.sin(angle) * speed;
    }
    b.vz -= b.size * 6.8 * dt;
    b.z = Math.max(0, b.z + b.vz * dt);
    if (!b.z) b.vz = 0;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    keepInside(b, round);
  }
  for (let i = 0; i < round.bodies.length; i++) {
    for (let j = i + 1; j < round.bodies.length; j++) {
      const a = round.bodies[i],
        b = round.bodies[j];
      if (!a || !b || a.id === heldId || b.id === heldId || Math.abs(a.z - b.z) > 8) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const distance = Math.hypot(dx, dy);
      const radius = (a.size + b.size) * 0.29;
      if (distance >= radius) continue;
      const nx = distance > 0 ? dx / distance : 1;
      const ny = distance > 0 ? dy / distance : 0;
      const depth = (radius - distance) / 2;
      a.x -= nx * depth;
      a.y -= ny * depth;
      b.x += nx * depth;
      b.y += ny * depth;
      const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (approach > 0) {
        a.vx -= approach * nx;
        a.vy -= approach * ny;
        b.vx += approach * nx;
        b.vy += approach * ny;
        if (approach > 20 && !b.z) b.vz = b.size * 1.25;
      }
      keepInside(a, round);
      keepInside(b, round);
    }
  }
}

function keepInside(b: PlaygroundBody, round: PlaygroundRound): void {
  const margin = b.size / 2;
  if (b.x < margin || b.x > round.width - margin) b.vx = (b.x < margin ? 1 : -1) * Math.abs(b.vx);
  const top = Math.max(margin, 76);
  if (b.y < top || b.y > round.height - margin) b.vy = (b.y < top ? 1 : -1) * Math.abs(b.vy);
  b.x = clamp(b.x, margin, round.width - margin);
  b.y = clamp(b.y, top, round.height - margin);
}

export function hitPlayground(round: PlaygroundRound, x: number, y: number): PlaygroundBody | null {
  const front = [...round.bodies].sort((a, b) => b.y - a.y);
  return (
    front.find((b) => Math.hypot(b.x - x, Math.max(b.size / 2, b.y - b.z) - y) <= b.size * 0.46) ??
    null
  );
}

export function recommendPlaygroundTask(tasks: readonly CompanionTask[]): CompanionTask | null {
  return tasks.find((t) => t.eligible && !t.claimed) ?? tasks.find((t) => !t.claimed) ?? null;
}

export function buildPlaygroundNotes(
  state: CompanionState,
  facts: CompanionFacts,
  now: string,
): PlaygroundNote[] {
  if (!state.adoptedAt) return [];
  const tasks = buildCompanionTasks(state, facts, now);
  const mapping: Record<string, string> = {
    sprout: 'play',
    sunshine: 'write',
    sky: 'photo',
    peach: 'days',
    lavender: 'decorate',
    cocoa: 'letter',
    mint: 'visit',
    night: 'welcome',
  };
  const starTask =
    tasks.find((t) => t.id === 'welcome' && !t.claimed) ??
    tasks.find((t) => t.id === 'name' && !t.claimed) ??
    recommendPlaygroundTask(tasks);
  return COMPANION_SKINS.flatMap((skin) => {
    const task =
      skin.id === 'night' && starTask ? starTask : tasks.find((t) => t.id === mapping[skin.id]);
    if (!task) return [];
    return [
      {
        id: skin.id,
        name: skin.name,
        role: skin.role ?? '校园伙伴',
        line: skin.line ?? '',
        color: skin.color,
        src: resolveCompanionAsset('skin', skin.id).src,
        task:
          task.id === 'days'
            ? {
                ...task,
                hint:
                  '已记录 ' +
                  Math.min(3, facts.recordedDays) +
                  ' / 3 天。在不同的日子留下心情，慢慢收集。',
              }
            : task,
      },
    ];
  });
}

export function playgroundFlipState(elapsed: number) {
  const progress = clamp(elapsed / 460, 0, 1);
  return {
    scaleX: Math.max(0.025, Math.abs(Math.cos(progress * Math.PI))),
    back: progress >= 0.5,
    done: progress >= 1,
  };
}
export function playgroundPaperRect(round: PlaygroundRound, id: string, topInset = 68) {
  const width = Math.min(154, round.width - 28),
    height = Math.min(160, round.height - topInset - 88);
  const body = round.bodies.find((item) => item.id === id);
  const x = clamp(body?.x ?? round.width / 2, width / 2 + 14, round.width - width / 2 - 14);
  const y = clamp(
    (body?.y ?? round.height / 2) - (body?.z ?? 0),
    topInset + 8 + height / 2,
    round.height - 68 - height / 2,
  );
  if (body) Object.assign(body, { x, y, z: 0, vz: 0 });
  return { left: x - width / 2, top: y - height / 2, width, height };
}
export function resolvePlaygroundNote(
  round: PlaygroundRound,
  notes: PlaygroundNote[],
  id: string,
): PlaygroundNote | null {
  const body = round.bodies.find((item) => item.id === id);
  const note = body ? notes.find((item) => item.id === body.skinId) : null;
  return note ? { ...note, id } : null;
}
