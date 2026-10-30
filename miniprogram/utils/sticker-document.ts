export const STICKER_SIZE = 360;
export const STICKER_COLORS = ['#35402e', '#bf6854', '#c39b3d', '#628a83', '#8d7ca8', '#343434'];
export const STICKER_STAMPS = [
  { id: 'tea', label: '课后喝一杯', category: 'daily', glyph: '☕' },
  { id: 'heart', label: '小小喜欢', category: 'daily', glyph: '♡' },
  { id: 'cat', label: '遇见小猫', category: 'daily', glyph: '◕' },
  { id: 'camera', label: '留住瞬间', category: 'daily', glyph: '▣' },
  { id: 'book', label: '读完一章', category: 'campus', glyph: '▤' },
  { id: 'arch', label: '校园一角', category: 'campus', glyph: '⌂' },
  { id: 'basketball', label: '去运动吧', category: 'campus', glyph: '◉' },
  { id: 'star', label: '今日小成就', category: 'campus', glyph: '☆' },
  { id: 'flower', label: '花开的时候', category: 'nature', glyph: '❀' },
  { id: 'leaf', label: '捡一片秋天', category: 'nature', glyph: '♧' },
  { id: 'sun', label: '好天气', category: 'nature', glyph: '☀' },
  { id: 'rain', label: '听一场雨', category: 'nature', glyph: '☂' },
] as const;
export interface StickerPoint {
  x: number;
  y: number;
}
interface LayerBase {
  id: string;
  color: string;
}
export interface StickerStroke extends LayerBase {
  kind: 'stroke';
  points: StickerPoint[];
  width: number;
  eraser: boolean;
}
export interface StickerObjectBase extends LayerBase {
  x: number;
  y: number;
  scale: number;
  rotation: number;
}
export interface StickerText extends StickerObjectBase {
  kind: 'text';
  text: string;
}
export interface StickerStamp extends StickerObjectBase {
  kind: 'stamp';
  assetId: string;
}
export type StickerObject = StickerText | StickerStamp;
export type StickerLayer = StickerStroke | StickerObject;
export interface StickerDocument {
  schemaVersion: 1;
  background: 'paper' | 'transparent';
  layers: StickerLayer[];
}
export const STICKER_MAX_POINTS = 1200;
const MAX_LAYERS = 80;
const MAX_TOTAL_POINTS = 12000;
const MAX_HISTORY = 24;
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const validColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/iu.test(v);
let sequence = 0;
function id(): string {
  return `sticker-${Date.now().toString(36)}-${sequence++}`;
}
function clone(doc: StickerDocument): StickerDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) =>
      l.kind === 'stroke' ? { ...l, points: l.points.map((p) => ({ ...p })) } : { ...l },
    ),
  };
}
export function createStickerDocument(): StickerDocument {
  return { schemaVersion: 1, background: 'transparent', layers: [] };
}
export function parseStickerDocument(value: unknown): StickerDocument | null {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !['paper', 'transparent'].includes(String(value.background)) ||
    !Array.isArray(value.layers) ||
    value.layers.length > MAX_LAYERS
  )
    return null;
  const layers: StickerLayer[] = [],
    ids = new Set<string>();
  let totalPoints = 0;
  for (const raw of value.layers) {
    if (
      !record(raw) ||
      typeof raw.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,90}$/u.test(raw.id) ||
      ids.has(raw.id) ||
      !validColor(raw.color)
    )
      return null;
    ids.add(raw.id);
    if (raw.kind === 'stroke') {
      if (
        !Array.isArray(raw.points) ||
        !raw.points.length ||
        raw.points.length > STICKER_MAX_POINTS ||
        !finite(raw.width) ||
        raw.width < 1 ||
        raw.width > 36 ||
        typeof raw.eraser !== 'boolean'
      )
        return null;
      totalPoints += raw.points.length;
      if (totalPoints > MAX_TOTAL_POINTS) return null;
      const points: StickerPoint[] = [];
      for (const p of raw.points) {
        if (
          !record(p) ||
          !finite(p.x) ||
          !finite(p.y) ||
          p.x < 0 ||
          p.x > STICKER_SIZE ||
          p.y < 0 ||
          p.y > STICKER_SIZE
        )
          return null;
        points.push({ x: p.x, y: p.y });
      }
      layers.push({
        kind: 'stroke',
        id: raw.id,
        color: raw.color,
        points,
        width: raw.width,
        eraser: raw.eraser,
      });
      continue;
    }
    if (
      !finite(raw.x) ||
      !finite(raw.y) ||
      raw.x < 0 ||
      raw.x > STICKER_SIZE ||
      raw.y < 0 ||
      raw.y > STICKER_SIZE ||
      !finite(raw.scale) ||
      raw.scale < 0.35 ||
      raw.scale > 2.4 ||
      !finite(raw.rotation) ||
      raw.rotation < -180 ||
      raw.rotation > 180
    )
      return null;
    const base = {
      id: raw.id,
      color: raw.color,
      x: raw.x,
      y: raw.y,
      scale: raw.scale,
      rotation: raw.rotation,
    };
    if (
      raw.kind === 'text' &&
      typeof raw.text === 'string' &&
      raw.text.trim() &&
      raw.text.length <= 60
    )
      layers.push({ ...base, kind: 'text', text: raw.text });
    else if (raw.kind === 'stamp' && STICKER_STAMPS.some((s) => s.id === raw.assetId))
      layers.push({ ...base, kind: 'stamp', assetId: raw.assetId as string });
    else return null;
  }
  return {
    schemaVersion: 1,
    background: value.background as StickerDocument['background'],
    layers,
  };
}
function validated(value: unknown): StickerDocument {
  const doc = parseStickerDocument(value);
  if (!doc) throw new Error('画布内容超出限制或格式无效，请撤销部分内容后重试。');
  return doc;
}
export function createTextLayer(text: string, color: string): StickerText {
  const layer: StickerText = {
    kind: 'text',
    id: id(),
    text: text.trim(),
    color,
    x: 180,
    y: 180,
    scale: 1,
    rotation: 0,
  };
  validated({ ...createStickerDocument(), layers: [layer] });
  return layer;
}
export function createStampLayer(assetId: string, color: string): StickerStamp {
  const layer: StickerStamp = {
    kind: 'stamp',
    id: id(),
    assetId,
    color,
    x: 180,
    y: 180,
    scale: 1,
    rotation: 0,
  };
  validated({ ...createStickerDocument(), layers: [layer] });
  return layer;
}
export function createStrokeLayer(
  points: readonly StickerPoint[],
  color: string,
  width: number,
  eraser = false,
): StickerStroke {
  const layer: StickerStroke = {
    kind: 'stroke',
    id: id(),
    points: points.map((p) => ({ ...p })),
    color,
    width,
    eraser,
  };
  validated({ ...createStickerDocument(), layers: [layer] });
  return layer;
}
export function appendStickerLayer(doc: StickerDocument, layer: StickerLayer): StickerDocument {
  return validated({ ...doc, layers: [...doc.layers, layer] });
}
export function removeStickerLayer(doc: StickerDocument, layerId: string): StickerDocument {
  return { ...clone(doc), layers: clone(doc).layers.filter((l) => l.id !== layerId) };
}
export function stickerTextLines(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    const chars = Array.from(line);
    return Array.from({ length: Math.max(1, Math.ceil(chars.length / 10)) }, (_, i) =>
      chars.slice(i * 10, (i + 1) * 10).join(''),
    );
  });
}
export function stickerObjectSize(layer: StickerObject): { width: number; height: number } {
  if (layer.kind === 'stamp') return { width: 104, height: 104 };
  const lines = stickerTextLines(layer.text);
  return {
    width: Math.max(...lines.map((l) => Array.from(l).length), 1) * 24 + 16,
    height: lines.length * 32 + 12,
  };
}
export function transformStickerLayer(
  doc: StickerDocument,
  layerId: string,
  patch: Partial<Pick<StickerObject, 'x' | 'y' | 'scale' | 'rotation' | 'color'>> & {
    text?: string;
  },
): StickerDocument {
  for (const field of ['x', 'y', 'scale', 'rotation'] as const)
    if (patch[field] !== undefined && !finite(patch[field]))
      throw new Error('位置和缩放必须是有效数字。');
  return validated({
    ...doc,
    layers: doc.layers.map((layer) => {
      if (layer.id !== layerId || layer.kind === 'stroke') return layer;
      const updated = {
        ...layer,
        ...patch,
        scale: clamp(patch.scale ?? layer.scale, 0.35, 2.4),
        rotation: (((((patch.rotation ?? layer.rotation) + 180) % 360) + 360) % 360) - 180,
      };
      const size = stickerObjectSize(updated),
        rad = (updated.rotation * Math.PI) / 180;
      const w = Math.abs(size.width * Math.cos(rad)) + Math.abs(size.height * Math.sin(rad));
      const h = Math.abs(size.width * Math.sin(rad)) + Math.abs(size.height * Math.cos(rad));
      updated.scale = Math.max(0.35, Math.min(updated.scale, 340 / Math.max(w, h)));
      const halfW = Math.min(178, (w * updated.scale) / 2),
        halfH = Math.min(178, (h * updated.scale) / 2);
      return {
        ...updated,
        x: clamp(updated.x, halfW, STICKER_SIZE - halfW),
        y: clamp(updated.y, halfH, STICKER_SIZE - halfH),
      };
    }),
  });
}
export function hitTestSticker(doc: StickerDocument, point: StickerPoint): string {
  for (const layer of [...doc.layers].reverse()) {
    if (layer.kind === 'stroke') continue;
    const rad = (-layer.rotation * Math.PI) / 180,
      dx = point.x - layer.x,
      dy = point.y - layer.y;
    const x = (dx * Math.cos(rad) - dy * Math.sin(rad)) / layer.scale;
    const y = (dx * Math.sin(rad) + dy * Math.cos(rad)) / layer.scale;
    const size = stickerObjectSize(layer);
    if (Math.abs(x) <= size.width / 2 + 8 && Math.abs(y) <= size.height / 2 + 8) return layer.id;
  }
  return '';
}
export function hasStickerContent(doc: StickerDocument): boolean {
  return doc.layers.some((l) => l.kind !== 'stroke' || !l.eraser);
}
export class StickerHistory {
  private documents: StickerDocument[];
  private cursor = 0;
  constructor(initial: StickerDocument = createStickerDocument()) {
    this.documents = [validated(initial)];
  }
  get document(): StickerDocument {
    return clone(this.documents[this.cursor]!);
  }
  get canUndo(): boolean {
    return this.cursor > 0;
  }
  get canRedo(): boolean {
    return this.cursor < this.documents.length - 1;
  }
  commit(doc: StickerDocument): StickerDocument {
    const next = validated(doc);
    if (JSON.stringify(next) === JSON.stringify(this.documents[this.cursor])) return this.document;
    this.documents = this.documents.slice(0, this.cursor + 1);
    this.documents.push(next);
    if (this.documents.length > MAX_HISTORY + 1) this.documents.shift();
    this.cursor = this.documents.length - 1;
    return this.document;
  }
  undo(): StickerDocument {
    if (this.canUndo) this.cursor--;
    return this.document;
  }
  redo(): StickerDocument {
    if (this.canRedo) this.cursor++;
    return this.document;
  }
}
