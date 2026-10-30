import { BOTTLE_HEIGHT, BOTTLE_WIDTH, type BottleParticle } from './memory-bottle';
import {
  drawBottleBackground,
  drawBottleFace,
  drawBottleForeground,
  drawMemoryBottle,
  traceBottleGlass,
} from './memory-bottle-canvas';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type Surface = WechatMiniprogram.OffscreenCanvas;
type SurfaceFactory = (width: number, height: number) => Surface;
interface Sprite {
  x: number;
  y: number;
  size: number;
}
interface Artwork {
  background: Surface;
  foreground: Surface;
  atlas: Surface;
  sprites: Map<string, Sprite>;
  ratio: number;
}
export interface BottleRenderer {
  readonly mode: 'cached' | 'vector';
  draw(context: Context, particles: readonly BottleParticle[]): void;
}
function spriteKey(particle: BottleParticle): string {
  return particle.mood + '|' + particle.color + '|' + particle.radius;
}
function surface(
  factory: SurfaceFactory,
  width: number,
  height: number,
  ratio: number,
): { image: Surface; context: Context } {
  const pixelWidth = Math.max(1, Math.ceil(width * ratio));
  const pixelHeight = Math.max(1, Math.ceil(height * ratio));
  const image = factory(pixelWidth, pixelHeight);
  image.width = pixelWidth;
  image.height = pixelHeight;
  const context = image.getContext('2d') as Context | null;
  if (!context) throw new Error('Offscreen 2D context unavailable');
  context.scale(ratio, ratio);
  return { image, context };
}
function prepareArtwork(
  particles: readonly BottleParticle[],
  ratio: number,
  factory: SurfaceFactory,
): Artwork {
  const background = surface(factory, BOTTLE_WIDTH, BOTTLE_HEIGHT, ratio);
  drawBottleBackground(background.context);
  const foreground = surface(factory, BOTTLE_WIDTH, BOTTLE_HEIGHT, ratio);
  drawBottleForeground(foreground.context);
  const unique = new Map<string, BottleParticle>();
  for (const particle of particles) unique.set(spriteKey(particle), particle);
  const maxRadius = particles.reduce((radius, particle) => Math.max(radius, particle.radius), 0);
  const size = Math.max(8, Math.ceil(maxRadius * 2 + 6));
  const columns = Math.max(1, Math.ceil(Math.sqrt(unique.size)));
  const rows = Math.max(1, Math.ceil(unique.size / columns));
  const atlas = surface(factory, columns * size, rows * size, ratio);
  const sprites = new Map<string, Sprite>();
  let index = 0;
  for (const [key, particle] of unique) {
    const x = (index % columns) * size;
    const y = Math.floor(index / columns) * size;
    drawBottleFace(atlas.context, { ...particle, x: x + size / 2, y: y + size / 2, angle: 0 });
    sprites.set(key, { x, y, size });
    index++;
  }
  return {
    background: background.image,
    foreground: foreground.image,
    atlas: atlas.image,
    sprites,
    ratio,
  };
}
function drawCached(
  context: Context,
  particles: readonly BottleParticle[],
  artwork: Artwork,
): void {
  context.drawImage(artwork.background, 0, 0, BOTTLE_WIDTH, BOTTLE_HEIGHT);
  context.save();
  try {
    traceBottleGlass(context);
    context.clip();
    for (const particle of particles) {
      const sprite = artwork.sprites.get(spriteKey(particle));
      if (!sprite) {
        drawBottleFace(context, particle);
        continue;
      }
      context.save();
      try {
        context.translate(particle.x, particle.y);
        context.rotate(particle.angle);
        const { x, y, size } = sprite;
        context.drawImage(
          artwork.atlas,
          x * artwork.ratio,
          y * artwork.ratio,
          size * artwork.ratio,
          size * artwork.ratio,
          -size / 2,
          -size / 2,
          size,
          size,
        );
      } finally {
        context.restore();
      }
    }
  } finally {
    context.restore();
  }
  context.drawImage(artwork.foreground, 0, 0, BOTTLE_WIDTH, BOTTLE_HEIGHT);
}
export function createBottleRenderer(
  particles: readonly BottleParticle[],
  pixelRatio: number,
  factory?: SurfaceFactory,
): BottleRenderer {
  const ratio = Number.isFinite(pixelRatio) ? Math.max(1, Math.min(2, pixelRatio)) : 1;
  let artwork: Artwork | null = null;
  if (factory) {
    try {
      artwork = prepareArtwork(particles, ratio, factory);
    } catch {
      /* Native vector fallback remains usable. */
    }
  }
  return {
    get mode() {
      return artwork ? 'cached' : 'vector';
    },
    draw(context, currentParticles) {
      if (artwork) {
        try {
          drawCached(context, currentParticles, artwork);
          return;
        } catch {
          artwork = null;
        }
      }
      drawMemoryBottle(context, currentParticles);
    },
  };
}
