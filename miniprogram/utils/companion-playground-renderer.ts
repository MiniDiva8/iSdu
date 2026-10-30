import { COMPANION_SKINS } from '../data/companion-catalog';
import {
  playgroundFlipState,
  type PlaygroundRound,
  type PlaygroundBody,
} from './companion-playground';
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
export type PlaygroundImages = Map<string, WechatMiniprogram.Image>;

function meadow(ctx: Context, width: number, height: number) {
  const tint = ctx.createLinearGradient(0, 0, width, height);
  tint.addColorStop(0, '#dce6c9');
  tint.addColorStop(0.55, '#cbdcc0');
  tint.addColorStop(1, '#c1d7b9');
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, width, height);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#7fa27455';
  for (let index = 0; index < Math.ceil((width * height) / 7200); index++) {
    const x = ((index * 137 + 53) % Math.max(1, width - 12)) + 6;
    const y = ((index * 211 + 31) % Math.max(1, height - 12)) + 6;
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 2);
    ctx.quadraticCurveTo(x, y - 1, x, y + 3);
    ctx.quadraticCurveTo(x + 1, y - 4, x + 4, y - 5);
    ctx.stroke();
    if (index % 7 === 0) {
      ctx.fillStyle = '#fff7d4';
      ctx.beginPath();
      ctx.arc(x + 10, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#dbbd6c';
      ctx.beginPath();
      ctx.arc(x + 10, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
function back(ctx: Context, b: PlaygroundBody, color: string) {
  const s = b.size;
  ctx.fillStyle = color;
  ctx.strokeStyle = '#47614f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-s * 0.27, -s * 0.28);
  ctx.quadraticCurveTo(0, -s * 0.44, s * 0.27, -s * 0.28);
  ctx.quadraticCurveTo(s * 0.4, 0, s * 0.25, s * 0.3);
  ctx.quadraticCurveTo(0, s * 0.39, -s * 0.25, s * 0.3);
  ctx.quadraticCurveTo(-s * 0.4, 0, -s * 0.27, -s * 0.28);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#ffffff55';
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, -s * 0.17);
  ctx.quadraticCurveTo(-s * 0.27, 0, -s * 0.17, s * 0.2);
  ctx.moveTo(s * 0.18, -s * 0.17);
  ctx.quadraticCurveTo(s * 0.27, 0, s * 0.17, s * 0.2);
  ctx.stroke();
}
function variation(ctx: Context, b: PlaygroundBody) {
  if (!b.variant) return;
  const s = b.size;
  ctx.save();
  ctx.translate(s * 0.17, -s * 0.3);
  ctx.rotate(-0.18);
  ctx.fillStyle = b.variant === 1 ? '#f6d580' : '#e8a6ae';
  ctx.strokeStyle = '#58674e';
  ctx.lineWidth = 1;
  if (b.variant === 1) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? s * 0.035 : s * 0.075,
        a = -Math.PI / 2 + (i * Math.PI) / 5;
      if (i) ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(-s * 0.035, 0, s * 0.055, s * 0.03, -0.5, 0, Math.PI * 2);
    ctx.ellipse(s * 0.035, 0, s * 0.055, s * 0.03, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
/** Full-field original rendering using the existing campus character artwork. */
export function drawPlayground(
  ctx: Context,
  round: PlaygroundRound,
  images: PlaygroundImages,
  selectedId = '',
  won = false,
  flipElapsed = 460,
): void {
  const { width, height } = round;
  ctx.clearRect(0, 0, width, height);
  meadow(ctx, width, height);
  const ordered = [...round.bodies].sort((a, b) => a.y - b.y),
    selected = ordered.find((b) => b.id === selectedId);
  if (selected) {
    ordered.splice(ordered.indexOf(selected), 1);
    ordered.push(selected);
  }
  for (const b of ordered) {
    const skin = COMPANION_SKINS.find((s) => s.id === b.skinId),
      chosen = b.id === selectedId;
    ctx.fillStyle = '#5c7e623c';
    ctx.beginPath();
    ctx.ellipse(
      b.x,
      b.y + b.size * 0.32,
      b.size * Math.max(0.16, 0.3 - (b.z / b.size) * 0.5),
      b.size * 0.055,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.save();
    ctx.translate(b.x, Math.max(b.size / 2, b.y - b.z));
    ctx.rotate(chosen ? 0 : ((b.tilt + b.z * b.vx * 0.006) * Math.PI) / 180);
    if (chosen) {
      const turn = playgroundFlipState(flipElapsed);
      ctx.scale(turn.scaleX, 1);
      if (won) {
        ctx.shadowColor = '#fff3a3';
        ctx.shadowBlur = 12;
      }
      if (turn.back) {
        back(ctx, b, skin?.color ?? '#9fcbb4');
        ctx.restore();
        continue;
      }
    }
    const image = images.get(b.skinId);
    if (image) ctx.drawImage(image, -b.size * 0.41, -b.size * 0.41, b.size * 0.82, b.size * 0.82);
    else {
      ctx.fillStyle = skin?.color ?? '#9fcbb4';
      ctx.beginPath();
      ctx.arc(0, 0, b.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3f5746';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(skin?.name ?? '伙伴', 0, 5);
    }
    variation(ctx, b);
    ctx.restore();
  }
}
