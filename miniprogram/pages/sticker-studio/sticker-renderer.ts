import {
  STICKER_SIZE,
  stickerObjectSize,
  stickerTextLines,
  type StickerDocument,
  type StickerObject,
} from '../../utils/sticker-document';

export type StickerContext = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
function line(
  ctx: StickerContext,
  points: readonly (readonly [number, number])[],
  close = false,
): void {
  ctx.beginPath();
  for (const [i, p] of points.entries()) {
    if (i === 0) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  }
  if (close) ctx.closePath();
  ctx.stroke();
}
function circle(ctx: StickerContext, x: number, y: number, r: number, fill = false): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) ctx.fill();
  else ctx.stroke();
}
// Original iSdu line drawings, in a centered 104 x 104 coordinate space.
export function drawStickerStamp(ctx: StickerContext, assetId: string, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3.3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (assetId) {
    case 'tea':
      line(
        ctx,
        [
          [-31, -22],
          [-25, 38],
          [24, 38],
          [31, -22],
        ],
        true,
      );
      line(ctx, [
        [-36, -26],
        [35, -26],
      ]);
      line(ctx, [
        [13, -26],
        [23, -43],
      ]);
      ctx.beginPath();
      ctx.moveTo(-8, -42);
      ctx.quadraticCurveTo(-20, -34, -8, -31);
      ctx.stroke();
      circle(ctx, -9, 11, 2, true);
      circle(ctx, 9, 11, 2, true);
      ctx.beginPath();
      ctx.arc(0, 14, 8, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, 39);
      ctx.bezierCurveTo(-68, -1, -32, -55, 0, -22);
      ctx.bezierCurveTo(32, -55, 68, -1, 0, 39);
      ctx.closePath();
      ctx.stroke();
      line(ctx, [
        [-44, -28],
        [-48, -36],
      ]);
      line(ctx, [
        [42, -25],
        [49, -31],
      ]);
      break;
    case 'cat':
      line(ctx, [
        [-34, -14],
        [-36, -43],
        [-14, -29],
        [14, -29],
        [36, -43],
        [34, -14],
      ]);
      ctx.beginPath();
      ctx.moveTo(-34, -14);
      ctx.bezierCurveTo(-52, 51, 52, 51, 34, -14);
      ctx.stroke();
      circle(ctx, -14, 0, 2.5, true);
      circle(ctx, 14, 0, 2.5, true);
      line(ctx, [
        [-4, 10],
        [0, 14],
        [4, 10],
      ]);
      line(ctx, [
        [0, 14],
        [0, 20],
      ]);
      for (const s of [-1, 1]) {
        line(ctx, [
          [s * 21, 13],
          [s * 43, 7],
        ]);
        line(ctx, [
          [s * 22, 20],
          [s * 45, 23],
        ]);
      }
      break;
    case 'camera':
      line(
        ctx,
        [
          [-42, -24],
          [-20, -24],
          [-13, -35],
          [12, -35],
          [20, -24],
          [42, -24],
          [42, 33],
          [-42, 33],
        ],
        true,
      );
      circle(ctx, 0, 3, 22);
      circle(ctx, 0, 3, 13);
      line(ctx, [
        [26, -14],
        [32, -14],
      ]);
      break;
    case 'book':
      line(ctx, [
        [0, -27],
        [-17, -34],
        [-44, -29],
        [-44, 29],
        [-17, 24],
        [0, 32],
        [17, 24],
        [44, 29],
        [44, -29],
        [17, -34],
        [0, -27],
        [0, 32],
      ]);
      for (const y of [-14, -2, 10]) {
        line(ctx, [
          [-34, y],
          [-12, y - 3],
        ]);
        line(ctx, [
          [12, y - 3],
          [34, y],
        ]);
      }
      break;
    case 'arch':
      line(ctx, [
        [-45, 36],
        [45, 36],
      ]);
      line(ctx, [
        [-37, 36],
        [-37, -20],
        [-44, -20],
        [-44, -28],
        [44, -28],
        [44, -20],
        [37, -20],
        [37, 36],
      ]);
      line(ctx, [
        [-23, 36],
        [-23, -20],
        [23, -20],
        [23, 36],
      ]);
      line(ctx, [
        [-49, -28],
        [0, -43],
        [49, -28],
      ]);
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('1901', 0, -5);
      break;
    case 'basketball':
      circle(ctx, 0, 0, 39);
      line(ctx, [
        [-39, 0],
        [39, 0],
      ]);
      line(ctx, [
        [0, -39],
        [0, 39],
      ]);
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 25, -30);
        ctx.quadraticCurveTo(s * -10, 0, s * 25, 30);
        ctx.stroke();
      }
      break;
    case 'star': {
      const points: [number, number][] = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 18 : 43,
          a = (i * Math.PI) / 5 - Math.PI / 2;
        return [Math.cos(a) * r, Math.sin(a) * r];
      });
      line(ctx, points, true);
      circle(ctx, -8, 0, 1.8, true);
      circle(ctx, 8, 0, 1.8, true);
      break;
    }
    case 'flower':
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 3);
        ctx.beginPath();
        ctx.ellipse(0, -19, 11, 18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      circle(ctx, 0, 0, 10);
      line(ctx, [
        [0, 36],
        [0, 48],
      ]);
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(-30, 34);
      ctx.bezierCurveTo(-49, -15, 11, -28, 35, -41);
      ctx.bezierCurveTo(39, 13, 2, 42, -30, 34);
      ctx.stroke();
      line(ctx, [
        [-39, 46],
        [21, -22],
      ]);
      line(ctx, [
        [-17, 21],
        [-23, -4],
      ]);
      line(ctx, [
        [-5, 7],
        [17, 10],
      ]);
      break;
    case 'sun':
      circle(ctx, 0, 0, 24);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        line(ctx, [
          [Math.cos(a) * 33, Math.sin(a) * 33],
          [Math.cos(a) * 44, Math.sin(a) * 44],
        ]);
      }
      circle(ctx, -8, -3, 2, true);
      circle(ctx, 8, -3, 2, true);
      ctx.beginPath();
      ctx.arc(0, 5, 9, 0.2, Math.PI - 0.2);
      ctx.stroke();
      break;
    case 'rain':
      ctx.beginPath();
      ctx.moveTo(-42, 2);
      ctx.bezierCurveTo(-37, -45, 37, -45, 42, 2);
      ctx.quadraticCurveTo(27, -8, 14, 2);
      ctx.quadraticCurveTo(0, -9, -14, 2);
      ctx.quadraticCurveTo(-27, -8, -42, 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(0, 32);
      ctx.bezierCurveTo(0, 48, -19, 48, -18, 33);
      ctx.stroke();
      for (const x of [-34, 24, 38])
        line(ctx, [
          [x, 22],
          [x - 4, 32],
        ]);
      break;
  }
  ctx.restore();
}
function drawObject(ctx: StickerContext, layer: StickerObject, selected: boolean): void {
  ctx.save();
  ctx.translate(layer.x, layer.y);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.scale, layer.scale);
  if (layer.kind === 'stamp') drawStickerStamp(ctx, layer.assetId, layer.color);
  else {
    const lines = stickerTextLines(layer.text);
    ctx.fillStyle = layer.color;
    ctx.font = '500 24px "Kaiti SC", "KaiTi", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((text, i) => ctx.fillText(text, 0, (i - (lines.length - 1) / 2) * 32));
  }
  if (selected) {
    const size = stickerObjectSize(layer);
    ctx.strokeStyle = '#8d9c74';
    ctx.lineWidth = 1 / layer.scale;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(-size.width / 2 - 6, -size.height / 2 - 6, size.width + 12, size.height + 12);
  }
  ctx.restore();
}
export function renderSticker(ctx: StickerContext, doc: StickerDocument, selectedId = ''): void {
  ctx.clearRect(0, 0, STICKER_SIZE, STICKER_SIZE);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const layer of doc.layers) {
    if (layer.kind !== 'stroke') continue;
    ctx.globalCompositeOperation = layer.eraser ? 'destination-out' : 'source-over';
    ctx.strokeStyle = layer.color;
    ctx.fillStyle = layer.color;
    ctx.lineWidth = layer.width;
    const first = layer.points[0];
    if (!first) continue;
    if (layer.points.length === 1) circle(ctx, first.x, first.y, layer.width / 2, true);
    else {
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (const point of layer.points.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
  }
  // Paper goes behind ink; object layers are painted after all erasers.
  ctx.globalCompositeOperation = 'destination-over';
  if (doc.background === 'paper') {
    ctx.fillStyle = '#fdfbf1';
    ctx.fillRect(0, 0, STICKER_SIZE, STICKER_SIZE);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const layer of doc.layers)
    if (layer.kind !== 'stroke') drawObject(ctx, layer, layer.id === selectedId);
  ctx.restore();
}
