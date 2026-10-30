import { drawCompanionVector } from './companion-vector';
import type { CompanionPlacement } from '../models/companion';
import { COMPANION_THEMES } from '../data/companion-catalog';
import {
  resolveCompanionAsset,
  companionSpriteFrame,
  companionPoseAsset,
  companionFurnitureLayer,
  companionThemeBackground,
  type CompanionPose,
  type CompanionAssetDefinition,
  type CompanionAssetKind,
} from '../data/companion-assets';
import {
  companionScale,
  companionDepthScale,
  type CompanionCamera,
  type CompanionPosition,
  type CompanionViewport,
} from './companion-scene';
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type Surface = WechatMiniprogram.OffscreenCanvas;
export interface CompanionSceneSnapshot {
  name: string;
  skinId: string;
  accessoryId: string;
  theme: string;
  placements: readonly CompanionPlacement[];
}
export type CompanionImages = Map<string, WechatMiniprogram.Image>;
export interface CompanionSceneRenderer {
  readonly mode: 'cached' | 'vector';
  draw(
    context: Context,
    pet: CompanionPosition,
    camera: CompanionCamera,
    seconds: number,
    selectedId?: string,
    interacting?: boolean,
    pose?: CompanionPose,
  ): void;
  dispose(): void;
}
function neutral(ctx: Context, a: CompanionAssetDefinition, kind: CompanionAssetKind): void {
  const x = -a.width * a.anchorX,
    y = -a.height * a.anchorY;
  ctx.fillStyle = a.color;
  ctx.strokeStyle = '#747e72';
  ctx.lineWidth = 2;
  if (kind === 'skin') {
    ctx.beginPath();
    ctx.ellipse(0, -a.height * 0.32, a.width * 0.48, a.height * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x + 3, y + 3, a.width - 6, a.height - 6);
    ctx.strokeRect(x + 3, y + 3, a.width - 6, a.height - 6);
  }
  ctx.fillStyle = '#4f5e4c';
  ctx.textAlign = 'center';
  ctx.font = (kind === 'skin' ? 15 : 13) + 'px sans-serif';
  ctx.fillText(
    kind === 'skin' ? '伙伴' : kind === 'accessory' ? '装饰' : a.label.slice(0, 4),
    0,
    -a.height * 0.25,
  );
}
function worldTransform(ctx: Context, c: CompanionCamera, v: CompanionViewport): void {
  ctx.translate(v.width / 2 + c.x, v.height / 2 + c.y);
  const scale = companionScale(c, v);
  ctx.scale(scale, scale);
  ctx.translate(-400, -550);
}
function grass(
  ctx: Context,
  theme: string,
  c: CompanionCamera,
  v: CompanionViewport,
  images: CompanionImages,
): void {
  ctx.fillStyle = COMPANION_THEMES.find((t) => t.id === theme)?.color ?? '#bed391';
  ctx.fillRect(0, 0, v.width, v.height);
  ctx.save();
  worldTransform(ctx, c, v);
  const background = companionThemeBackground(theme);
  const room = images.get(background.src);
  if (room) {
    // Preserve each scene's aspect ratio while covering the portrait world.
    const sourceWidth = Math.min(background.width, (background.height * 800) / 1100);
    const sourceHeight = (sourceWidth * 1100) / 800;
    ctx.drawImage(
      room,
      (background.width - sourceWidth) / 2,
      (background.height - sourceHeight) / 2,
      sourceWidth,
      sourceHeight,
      0,
      0,
      800,
      1100,
    );
    ctx.restore();
    return;
  }
  // Keep a usable floor while scene artwork is loading or unavailable.
  ctx.fillStyle = theme === 'blossom' ? '#f8eddb' : '#f1e7cc';
  ctx.beginPath();
  ctx.ellipse(410, 740, 230, 440, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme === 'blossom' ? '#c9b7a0' : 'rgba(74,100,53,.23)';
  ctx.lineWidth = 2;
  for (let row = 0; row < 12; row++)
    for (let col = 0; col < 9; col++) {
      const x = col * 108 + (row % 2) * 38,
        y = row * 100 + 37;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x - 3, y - 6);
      ctx.lineTo(x + 1, y - 1);
      ctx.lineTo(x + 6, y - 7);
      ctx.stroke();
    }
  ctx.restore();
}
export function createCompanionSceneRenderer(
  snapshot: CompanionSceneSnapshot,
  viewport: CompanionViewport,
  ratio: number,
  images: CompanionImages = new Map(),
  factory?: (w: number, h: number) => Surface,
): CompanionSceneRenderer {
  let background: Surface | null = null,
    backgroundContext: Context | null = null,
    cachedCamera = '',
    failed = false;
  const sprites = new Map<string, Surface>();
  const dpr = Math.max(1, Math.min(2, ratio));
  const sorted = [...snapshot.placements].sort(
    (a, b) => companionFurnitureLayer(a.itemId) - companionFurnitureLayer(b.itemId) || a.y - b.y,
  );
  const baseSkin = resolveCompanionAsset('skin', snapshot.skinId);
  const furnitureAssets = new Map(
    sorted.map((p) => [p.itemId, resolveCompanionAsset('furniture', p.itemId)]),
  );
  function create(w: number, h: number): { image: Surface; ctx: Context } | null {
    if (!factory || failed) return null;
    try {
      const image = factory(Math.ceil(w * dpr), Math.ceil(h * dpr));
      image.width = Math.ceil(w * dpr);
      image.height = Math.ceil(h * dpr);
      const ctx = image.getContext('2d') as Context | null;
      if (!ctx) return null;
      ctx.scale(dpr, dpr);
      return { image, ctx };
    } catch {
      failed = true;
      return null;
    }
  }
  function asset(
    ctx: Context,
    kind: CompanionAssetKind,
    id: string,
    seconds: number,
    pose: 'idle' | 'walk' | 'interact',
    appearance: CompanionPose = 'idle',
  ) {
    const a =
        kind === 'skin'
          ? companionPoseAsset(id, appearance)
          : (furnitureAssets.get(id) ?? resolveCompanionAsset(kind, id)),
      image = a.src ? images.get(a.src) : undefined;
    if (a.vector) {
      drawCompanionVector(ctx, a.vector, a.width, a.height);
      return;
    }
    if (image) {
      if (a.columns === 1 && a.rows === 1)
        ctx.drawImage(image, -a.width * a.anchorX, -a.height * a.anchorY, a.width, a.height);
      else {
        const f = companionSpriteFrame(a, pose, seconds);
        ctx.drawImage(
          image,
          f.sx,
          f.sy,
          f.sw,
          f.sh,
          -a.width * a.anchorX,
          -a.height * a.anchorY,
          a.width,
          a.height,
        );
      }
      return;
    }
    const key = kind + ':' + id;
    let sprite = sprites.get(key);
    if (!sprite) {
      const cache = create(a.width + 8, a.height + 8);
      if (cache) {
        cache.ctx.translate(a.width * a.anchorX + 4, a.height * a.anchorY + 4);
        neutral(cache.ctx, a, kind);
        sprite = cache.image;
        sprites.set(key, sprite);
      }
    }
    if (sprite) {
      try {
        ctx.drawImage(
          sprite,
          -a.width * a.anchorX - 4,
          -a.height * a.anchorY - 4,
          a.width + 8,
          a.height + 8,
        );
        return;
      } catch {
        failed = true;
        sprites.clear();
      }
    }
    neutral(ctx, a, kind);
  }
  return {
    get mode() {
      return background && !failed ? 'cached' : 'vector';
    },
    draw(
      ctx,
      pet,
      camera,
      seconds,
      selectedId = '',
      interacting = false,
      appearance: CompanionPose = 'idle',
    ) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, viewport.width, viewport.height);
      const key = camera.x + ':' + camera.y + ':' + camera.zoom;
      if (key !== cachedCamera || !background) {
        if (!background) {
          const cache = create(viewport.width, viewport.height);
          if (cache) {
            background = cache.image;
            backgroundContext = cache.ctx;
          }
        }
        if (background && backgroundContext) {
          backgroundContext.setTransform(dpr, 0, 0, dpr, 0, 0);
          backgroundContext.clearRect(0, 0, viewport.width, viewport.height);
          grass(backgroundContext, snapshot.theme, camera, viewport, images);
          cachedCamera = key;
        }
      }
      if (background && !failed) {
        try {
          ctx.drawImage(background, 0, 0, viewport.width, viewport.height);
        } catch {
          failed = true;
          background = null;
          backgroundContext = null;
          grass(ctx, snapshot.theme, camera, viewport, images);
        }
      } else grass(ctx, snapshot.theme, camera, viewport, images);
      ctx.save();
      worldTransform(ctx, camera, viewport);
      const drawPet = () => {
        ctx.save();
        ctx.translate(pet.x * 800, pet.y * 1100);
        const depth = companionDepthScale(pet.y);
        ctx.scale(depth, depth);
        ctx.fillStyle = 'rgba(54,68,40,.13)';
        ctx.beginPath();
        ctx.ellipse(0, 2, 42, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        if (pet.moving) ctx.translate(0, -Math.abs(Math.sin(seconds * 12)) * 5);
        if (interacting) {
          const s = 1 + Math.sin(seconds * 18) * 0.06;
          ctx.scale(s, s);
        }
        ctx.scale(pet.facing < 0 ? -1 : 1, 1);
        const pose = interacting ? 'interact' : pet.moving ? 'walk' : 'idle';
        asset(
          ctx,
          'skin',
          snapshot.skinId,
          seconds,
          pose,
          interacting ? 'happy' : pet.moving ? 'idle' : appearance,
        );
        if (snapshot.accessoryId !== 'none') {
          const offsets: Record<string, [number, number]> = {
            scarf: [0, -67],
            hat: [0, -139],
            book: [0, -42],
            headphones: [0, -114],
            flower: [43, -119],
          };
          const offset = offsets[snapshot.accessoryId] ?? [0, -58];
          ctx.translate(offset[0], offset[1]);
          asset(ctx, 'accessory', snapshot.accessoryId, seconds, pose);
        }
        ctx.restore();
      };
      let drawn = false;
      for (const item of sorted) {
        if (!drawn && companionFurnitureLayer(item.itemId) === 2 && pet.y < item.y) {
          drawPet();
          drawn = true;
        }
        ctx.save();
        ctx.translate(item.x * 800, item.y * 1100);
        if (companionFurnitureLayer(item.itemId) === 2) {
          const depth = companionDepthScale(item.y);
          const a = furnitureAssets.get(item.itemId) ?? baseSkin;
          ctx.scale(depth, depth);
          ctx.save();
          ctx.fillStyle = 'rgba(54,68,40,.12)';
          ctx.shadowColor = 'rgba(54,68,40,.12)';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.ellipse(0, 2, a.width * 0.32, Math.max(5, a.width * 0.045), 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (item.itemId === 'sign' && ['meadow', 'dusk'].includes(snapshot.theme)) {
          const a = furnitureAssets.get(item.itemId)!;
          const wallEdge = snapshot.theme === 'meadow' ? 0.4 : 0.36;
          const lowerEdge = item.y + (a.height * (1 - a.anchorY)) / 1100;
          if (lowerEdge > wallEdge) {
            // Old wall-plaque coordinates remain editable and unchanged. Where
            // the new scene has open ground, support the plaque as an easel.
            const floor = snapshot.theme === 'meadow' ? 0.55 : 0.53;
            const foot = (Math.max(floor, lowerEdge + 0.025) - item.y) * 1100;
            const angle = (item.rotation * Math.PI) / 180;
            const hinge = a.height * a.anchorY - 15;
            const topX = Math.sin(angle) * hinge;
            const topY = -Math.cos(angle) * hinge;
            const halfWidth = a.width * 0.28;
            ctx.save();
            ctx.fillStyle = 'rgba(71,58,34,.12)';
            ctx.beginPath();
            ctx.ellipse(0, foot + 2, halfWidth + 10, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.lineCap = 'round';
            for (const [color, width] of [
              ['#6b7352', 12],
              ['#d9b982', 7],
            ] as const) {
              ctx.strokeStyle = color;
              ctx.lineWidth = width;
              ctx.beginPath();
              ctx.moveTo(-halfWidth, foot);
              ctx.lineTo(topX, topY);
              ctx.lineTo(halfWidth, foot);
              ctx.moveTo(-halfWidth * 0.8, foot - 20);
              ctx.lineTo(halfWidth * 0.8, foot - 20);
              ctx.stroke();
            }
            ctx.restore();
          }
        }
        ctx.rotate((item.rotation * Math.PI) / 180);
        asset(ctx, 'furniture', item.itemId, 0, 'idle');
        if (item.id === selectedId) {
          const a = furnitureAssets.get(item.itemId) ?? baseSkin;
          ctx.strokeStyle = '#fff9e6';
          ctx.lineWidth = 4;
          ctx.setLineDash([6, 5]);
          ctx.strokeRect(
            -a.width * a.anchorX - 8,
            -a.height * a.anchorY - 8,
            a.width + 16,
            a.height + 16,
          );
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
      if (!drawn) drawPet();
      ctx.restore();
    },
    dispose() {
      background = null;
      backgroundContext = null;
      sprites.clear();
    },
  };
}
export function companionImageSources(s: CompanionSceneSnapshot): string[] {
  const skin = resolveCompanionAsset('skin', s.skinId);
  const definitions = [
    skin,
    resolveCompanionAsset('accessory', s.accessoryId),
    ...s.placements.map((p) => resolveCompanionAsset('furniture', p.itemId)),
  ];
  return [
    ...new Set(
      [
        companionThemeBackground(s.theme).src,
        ...definitions.filter((a) => !a.vector).map((a) => a.src),
        ...Object.values(skin.poseSources ?? {}),
      ].filter((p): p is string => !!p),
    ),
  ];
}
