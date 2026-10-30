import { BOTTLE_HEIGHT, BOTTLE_WALLS, BOTTLE_WIDTH, type BottleParticle } from './memory-bottle';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;

export function traceBottleGlass(context: Context): void {
  context.beginPath();
  BOTTLE_WALLS.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
}

export function drawBottleFace(context: Context, particle: BottleParticle): void {
  const { radius, mood } = particle;
  context.save();
  context.translate(particle.x, particle.y);
  context.rotate(particle.angle);
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fillStyle = particle.color;
  context.fill();
  context.strokeStyle = 'rgba(63, 62, 48, 0.09)';
  context.lineWidth = 1;
  context.stroke();

  context.beginPath();
  context.arc(-radius * 0.3, -radius * 0.38, radius * 0.2, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 255, 0.35)';
  context.fill();
  context.scale(radius / 20, radius / 20);
  context.strokeStyle = '#45443b';
  context.fillStyle = '#45443b';
  context.lineWidth = 1.8;
  context.lineCap = 'round';
  const quiet = mood === 'calm' || mood === 'relaxed' || mood === 'tired';
  for (const x of [-6, 6]) {
    context.beginPath();
    if (quiet) {
      context.moveTo(x - 2, -3);
      context.quadraticCurveTo(x, -1, x + 2, -3);
      context.stroke();
    } else {
      context.arc(x, -3, 1.5, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.beginPath();
  if (mood === 'sad' || mood === 'lonely') {
    context.arc(0, 10, 5, Math.PI * 1.13, Math.PI * 1.87);
    context.stroke();
  } else if (mood === 'excited' || mood === 'inspired') {
    context.arc(0, 6, 3, 0, Math.PI * 2);
    context.fill();
  } else if (mood === 'tired') {
    context.moveTo(-3, 6);
    context.lineTo(3, 6);
    context.stroke();
  } else {
    context.arc(0, 3, 6, Math.PI * 0.12, Math.PI * 0.88);
    context.stroke();
  }
  context.restore();
}

export function drawBottleBackground(context: Context): void {
  context.save();
  context.beginPath();
  context.ellipse(BOTTLE_WIDTH / 2, BOTTLE_HEIGHT - 7, 116, 5, 0, 0, Math.PI * 2);
  context.fillStyle = 'rgba(73, 98, 77, 0.07)';
  context.fill();

  context.save();
  traceBottleGlass(context);
  context.shadowColor = 'rgba(62, 94, 75, 0.08)';
  context.shadowBlur = 20;
  context.shadowOffsetY = 5;
  context.fillStyle = '#fbfcf7';
  context.fill();
  context.restore();

  context.restore();
}

export function drawBottleForeground(context: Context): void {
  context.save();
  traceBottleGlass(context);
  context.lineWidth = 3;
  context.lineJoin = 'round';
  context.strokeStyle = '#a7bfac';
  context.stroke();
  context.beginPath();
  context.moveTo(34, 146);
  context.lineTo(34, 322);
  context.moveTo(286, 177);
  context.lineTo(286, 254);
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  context.stroke();

  context.fillStyle = '#d8bd96';
  context.fillRect(105, 36, 110, 22);
  context.strokeStyle = '#b69a73';
  context.lineWidth = 1;
  context.strokeRect(105, 36, 110, 22);
  for (let x = 116; x < 214; x += 12) {
    context.beginPath();
    context.moveTo(x, 40);
    context.lineTo(x - 3, 53);
    context.stroke();
  }
  context.fillStyle = '#6d806d';
  context.font = '11px sans-serif';
  context.textAlign = 'center';
  context.fillText('把心情，好好收藏', 160, 23);
  context.restore();
}

export function drawMemoryBottle(context: Context, particles: readonly BottleParticle[]): void {
  drawBottleBackground(context);
  context.save();
  traceBottleGlass(context);
  context.clip();
  particles.forEach((particle) => drawBottleFace(context, particle));
  context.restore();
  drawBottleForeground(context);
}
