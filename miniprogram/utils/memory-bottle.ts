import {
  getMemoryMoodLabel,
  sortMemoriesByDate,
  type Memory,
  type MemoryMood,
} from '../models/memory';
import { formatMemoryDateTime } from './date-format';

export const BOTTLE_WIDTH = 320;
export const BOTTLE_HEIGHT = 400;
export const BOTTLE_PAGE_SIZE = 60;

export const BOTTLE_WALLS: readonly { x: number; y: number }[] = [
  { x: 108, y: 58 },
  { x: 212, y: 58 },
  { x: 294, y: 118 },
  { x: 294, y: 344 },
  { x: 274, y: 382 },
  { x: 46, y: 382 },
  { x: 26, y: 344 },
  { x: 26, y: 118 },
];

const BOTTLE_PLANES = BOTTLE_WALLS.flatMap((a, index) => {
  const b = BOTTLE_WALLS[(index + 1) % BOTTLE_WALLS.length];
  if (!b) return [];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return [{ x: a.x, y: a.y, nx: -(b.y - a.y) / length, ny: (b.x - a.x) / length }];
});

const MOOD_COLORS: Readonly<Record<MemoryMood, string>> = {
  happy: '#F4CC63',
  calm: '#8DBEAF',
  excited: '#F39C79',
  grateful: '#ECA3B4',
  relaxed: '#B2CF92',
  nostalgic: '#C3A181',
  inspired: '#B4A0D3',
  proud: '#DBAA54',
  lonely: '#9CA9CD',
  sad: '#85B5D0',
  tired: '#AEB8B5',
  custom: '#B9A6A1',
};

export interface BottleMemory {
  id: string;
  mood: MemoryMood;
  moodLabel: string;
  color: string;
  dateLabel: string;
  placeLabel: string;
  summary: string;
  isDemo: boolean;
}

export interface BottleParticle {
  id: string;
  mood: MemoryMood;
  color: string;
  radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
}

export interface BottleGravity {
  x: number;
  y: number;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (const character of text) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function moodColor(memory: Memory): string {
  return memory.mood === 'custom' && memory.customMood.trim()
    ? 'hsl(' + (hashText(memory.customMood.trim()) % 360) + ', 48%, 72%)'
    : MOOD_COLORS[memory.mood];
}

export function createBottleMemories(memories: readonly Memory[]): BottleMemory[] {
  return sortMemoriesByDate(memories).map((memory) => ({
    id: memory.id,
    mood: memory.mood,
    moodLabel: getMemoryMoodLabel(memory),
    color: moodColor(memory),
    dateLabel: formatMemoryDateTime(memory.recordedAt),
    placeLabel: memory.placeName || '校园中的某处',
    summary:
      memory.text.trim().replace(/\s+/gu, ' ').slice(0, 64) || '这是一段用照片留下的校园时光。',
    isDemo: memory.origin === 'demo',
  }));
}

export function getBottlePage(
  memories: readonly BottleMemory[],
  pageIndex: number,
): BottleMemory[] {
  const lastPage = Math.max(0, Math.ceil(memories.length / BOTTLE_PAGE_SIZE) - 1);
  const page = clamp(Number.isFinite(pageIndex) ? Math.floor(pageIndex) : 0, 0, lastPage);
  return memories.slice(page * BOTTLE_PAGE_SIZE, (page + 1) * BOTTLE_PAGE_SIZE);
}

function containParticle(particle: BottleParticle): void {
  for (let pass = 0; pass < 2; pass++) {
    for (const plane of BOTTLE_PLANES) {
      const { nx, ny } = plane;
      const distance = (particle.x - plane.x) * nx + (particle.y - plane.y) * ny;
      if (distance >= particle.radius) continue;
      particle.x += nx * (particle.radius - distance);
      particle.y += ny * (particle.radius - distance);
      const normalVelocity = particle.vx * nx + particle.vy * ny;
      if (normalVelocity < 0) {
        const bounce = normalVelocity < -12 ? 1.38 : 1;
        particle.vx -= nx * normalVelocity * bounce;
        particle.vy -= ny * normalVelocity * bounce;
        particle.vx *= 0.96;
        particle.vy *= 0.96;
      }
    }
  }
}

export function createBottleParticles(memories: readonly BottleMemory[]): BottleParticle[] {
  const radius = memories.length > 40 ? 14 : memories.length > 18 ? 17 : 20;
  const spacing = radius * 2 + 3;
  const columns = Math.floor(248 / spacing);
  const particles = memories.map((memory, index) => ({
    id: memory.id,
    mood: memory.mood,
    color: memory.color,
    radius,
    x: 36 + radius + (index % columns) * spacing,
    y: 362 - Math.floor(index / columns) * spacing,
    vx: 0,
    vy: 0,
    angle: (((hashText(memory.id) % 31) - 15) * Math.PI) / 180,
  }));
  particles.forEach(containParticle);
  return particles;
}

export function getBottleGravity(acceleration: { x: number; y: number; z: number }): BottleGravity {
  const x = Number.isFinite(acceleration.x) ? clamp(acceleration.x, -2, 2) : 0;
  const y = Number.isFinite(acceleration.y) ? clamp(-acceleration.y, -2, 2) : 1;
  return { x, y: Math.abs(y) < 0.12 ? 0.25 : y };
}

function separateParticles(particles: BottleParticle[]): void {
  for (let i = 0; i < particles.length; i++) {
    const a = particles[i];
    if (!a) continue;
    for (let j = i + 1; j < particles.length; j++) {
      const b = particles[j];
      if (!b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const diameter = a.radius + b.radius;
      const squaredDistance = dx * dx + dy * dy;
      if (squaredDistance >= diameter * diameter) continue;
      const distance = Math.sqrt(squaredDistance);
      const nx = distance > 0.0001 ? dx / distance : 1;
      const ny = distance > 0.0001 ? dy / distance : 0;
      const correction = (diameter - distance) / 2;
      a.x -= nx * correction;
      a.y -= ny * correction;
      b.x += nx * correction;
      b.y += ny * correction;
      const relativeSpeed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (relativeSpeed < 0) {
        const impulse = -relativeSpeed * 0.65;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
      }
    }
  }
}

export function stepBottle(
  particles: BottleParticle[],
  gravity: BottleGravity,
  elapsed: number,
): void {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return;
  const duration = Math.min(elapsed, 1 / 30);
  // At up to 600px/s per circle, <=22ms cannot cross a minimum 28px pair.
  const substeps = duration > 0.022 ? 2 : 1;
  const dt = duration / substeps;
  const gx = Number.isFinite(gravity.x) ? clamp(gravity.x, -2, 2) : 0;
  const gy = Number.isFinite(gravity.y) ? clamp(gravity.y, -2, 2) : 1;
  const damping = Math.exp(-1.3 * dt);
  for (let substep = 0; substep < substeps; substep++) {
    for (const particle of particles) {
      particle.vx = clamp((particle.vx + gx * 850 * dt) * damping, -600, 600);
      particle.vy = clamp((particle.vy + gy * 850 * dt) * damping, -600, 600);
      const squaredSpeed = particle.vx * particle.vx + particle.vy * particle.vy;
      if (squaredSpeed > 600 * 600) {
        const speedScale = 600 / Math.sqrt(squaredSpeed);
        particle.vx *= speedScale;
        particle.vy *= speedScale;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.angle =
        (particle.angle + ((particle.vx * dt) / particle.radius) * 0.45) % (Math.PI * 2);
    }
    for (let iteration = 0; iteration < 5; iteration++) {
      separateParticles(particles);
      particles.forEach(containParticle);
    }
  }
}

export function shakeBottle(particles: BottleParticle[], seed: number): void {
  for (const particle of particles) {
    const hash = hashText(particle.id + ':' + seed);
    particle.vx = ((hash % 1000) / 999 - 0.5) * 600;
    particle.vy = -250 - ((hash >>> 10) % 201);
  }
}

export function hitTestBottle(
  particles: readonly BottleParticle[],
  x: number,
  y: number,
): string | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    if (particle && Math.hypot(particle.x - x, particle.y - y) <= particle.radius + 4)
      return particle.id;
  }
  return null;
}
