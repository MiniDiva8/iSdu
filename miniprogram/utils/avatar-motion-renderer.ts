import { AVATAR_BALL_RADIUS, type AvatarPose } from './avatar-motion';

type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
type Surface = WechatMiniprogram.OffscreenCanvas;
type SurfaceFactory = (width: number, height: number) => Surface;
const colors: Record<string, string> = {
  happy: '#f4d46b',
  calm: '#bfd7b9',
  excited: '#f4b86a',
  grateful: '#efa9ac',
  relaxed: '#cbdcad',
  nostalgic: '#b5c9ce',
  inspired: '#edcf87',
  proud: '#d6b9d0',
  lonely: '#bac2d2',
  sad: '#9abcc8',
  tired: '#bfa98b',
  custom: '#e7dfcb',
};

function face(context: Context, mood: string, diameter: number) {
  const radius = diameter / 2;
  context.save();
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = colors[mood] ?? colors.happy!;
  context.fillRect(-radius, -radius, diameter, diameter);
  context.rotate(((mood === 'excited' ? 6 : -4) * Math.PI) / 180);
  context.scale(diameter / 94, diameter / 94);
  context.fillStyle = '#303831';
  context.strokeStyle = '#303831';
  context.lineWidth = 4;
  context.lineCap = 'round';
  if (mood === 'grateful') {
    context.fillStyle = '#e99b83';
    context.globalAlpha = 0.7;
    for (const x of [-24, 27]) {
      context.beginPath();
      context.ellipse(x, 7, 6.5, 3.7, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.fillStyle = '#303831';
  }
  for (const x of [-14, 16]) {
    context.beginPath();
    if (mood === 'relaxed' || mood === 'tired' || (mood === 'inspired' && x > 0)) {
      context.lineWidth = 3;
      context.moveTo(x - 4, -9);
      context.lineTo(x + 4, -8);
      context.stroke();
    } else {
      context.ellipse(x, -8.5, 3.3, 3.8, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.save();
  if (mood === 'proud') {
    context.translate(2, 12);
    context.rotate((-15 * Math.PI) / 180);
    context.translate(-2, -12);
  }
  context.beginPath();
  context.lineWidth = mood === 'nostalgic' ? 3 : 4;
  if (mood === 'calm' || mood === 'tired') {
    context.moveTo(-8, 12);
    context.lineTo(12, 12);
    context.stroke();
  } else if (mood === 'sad' || mood === 'lonely') {
    context.moveTo(-9, 20);
    context.quadraticCurveTo(2, 6, 14, 20);
    context.stroke();
    context.beginPath();
    context.ellipse(-21, 6, 3.3, 7, 0.17, 0, Math.PI * 2);
    context.fillStyle = '#6c9fbd';
    context.fill();
  } else if (mood === 'excited') {
    context.moveTo(-8, 1);
    context.lineTo(11, 1);
    context.quadraticCurveTo(14, 1, 14, 4);
    context.lineTo(14, 11);
    context.quadraticCurveTo(14, 23, 2, 23);
    context.quadraticCurveTo(-11, 23, -11, 11);
    context.lineTo(-11, 4);
    context.quadraticCurveTo(-11, 1, -8, 1);
    context.fill();
  } else if (mood === 'nostalgic') {
    context.moveTo(-9, 12);
    context.quadraticCurveTo(1.5, 15, 12, 12);
    context.stroke();
  } else {
    const width = mood === 'nostalgic' ? 10 : 15;
    context.moveTo(2 - width, 7);
    context.quadraticCurveTo(2, mood === 'nostalgic' ? 18 : 29, 2 + width, 7);
    context.stroke();
  }
  context.restore();
  if (mood === 'custom') {
    context.fillStyle = '#a68444';
    context.font = '30px sans-serif';
    context.fillText('✦', 21, -20);
  }
  context.restore();
}

export function createAvatarRenderer(
  mood: string,
  size: number,
  pixelRatio: number,
  factory?: SurfaceFactory,
) {
  const radius = size / 2 - 10;
  const diameter = radius * AVATAR_BALL_RADIUS * 2;
  let sprite: Surface | null = null;
  if (factory) {
    try {
      const pixels = Math.max(1, Math.ceil(diameter * pixelRatio));
      const image = factory(pixels, pixels);
      image.width = pixels;
      image.height = pixels;
      const context = image.getContext('2d') as Context | null;
      if (context) {
        context.scale(pixels / diameter, pixels / diameter);
        context.translate(diameter / 2, diameter / 2);
        face(context, mood, diameter);
        sprite = image;
      }
    } catch {
      /* A single vector face is cheap when offscreen caching is unavailable. */
    }
  }
  return {
    draw(context: Context, pose: AvatarPose) {
      context.clearRect(0, 0, size, size);
      context.save();
      try {
        context.translate(size / 2 + pose.x * radius, size / 2 + pose.y * radius);
        context.rotate(pose.angle);
        if (sprite) {
          try {
            context.drawImage(sprite, -diameter / 2, -diameter / 2, diameter, diameter);
            return;
          } catch {
            sprite = null;
          }
        }
        face(context, mood, diameter);
      } finally {
        context.restore();
      }
    },
  };
}
