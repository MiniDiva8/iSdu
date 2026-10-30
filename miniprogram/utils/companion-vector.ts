/** Small code-native accessories and two legacy keepsakes. No SVG decoding on Canvas is needed. */
type Context = WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D;
export function drawCompanionVector(ctx: Context, id: string, width: number, height: number): void {
  ctx.save();
  ctx.translate(-width / 2, -height / 2);
  ctx.scale(width / 100, height / 100);
  ctx.strokeStyle = '#315c59';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.stroke();
  };
  if (id === 'pond') {
    ellipse(50, 54, 44, 28, '#a5d6c7');
    ellipse(50, 54, 34, 20, '#d5eee0');
    ctx.strokeStyle = '#78b7aa';
    ctx.beginPath();
    ctx.moveTo(24, 53);
    ctx.quadraticCurveTo(36, 43, 47, 53);
    ctx.moveTo(49, 65);
    ctx.quadraticCurveTo(64, 55, 77, 64);
    ctx.stroke();
  } else if (id === 'cushion') {
    ellipse(50, 56, 42, 30, '#fcf1ce');
    ellipse(22, 46, 16, 20, '#fcf1ce');
    ellipse(47, 31, 21, 18, '#fcf1ce');
    ellipse(76, 42, 18, 20, '#fcf1ce');
  } else if (id === 'flower') {
    for (let n = 0; n < 5; n++) {
      const a = (n * Math.PI * 2) / 5;
      ellipse(50 + Math.sin(a) * 23, 49 + Math.cos(a) * 23, 17, 20, '#f5bfa6');
    }
    ellipse(50, 49, 14, 14, '#f5d97e');
  } else if (id === 'hat') {
    ctx.fillStyle = '#f3d78d';
    ctx.beginPath();
    ctx.moveTo(23, 59);
    ctx.lineTo(30, 26);
    ctx.quadraticCurveTo(50, 9, 71, 26);
    ctx.lineTo(78, 59);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ellipse(50, 65, 39, 12, '#f7e4ac');
  } else if (id === 'headphones') {
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(19, 65);
    ctx.lineTo(19, 44);
    ctx.bezierCurveTo(19, 2, 81, 2, 81, 44);
    ctx.lineTo(81, 65);
    ctx.stroke();
    ellipse(22, 66, 10, 17, '#95cdbd');
    ellipse(78, 66, 10, 17, '#95cdbd');
  } else if (id === 'book') {
    ctx.fillStyle = '#f8edc8';
    ctx.beginPath();
    ctx.moveTo(13, 25);
    ctx.quadraticCurveTo(32, 17, 50, 28);
    ctx.quadraticCurveTo(70, 16, 87, 25);
    ctx.lineTo(87, 77);
    ctx.quadraticCurveTo(67, 68, 50, 81);
    ctx.quadraticCurveTo(32, 68, 13, 77);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 28);
    ctx.lineTo(50, 80);
    ctx.moveTo(23, 37);
    ctx.lineTo(40, 40);
    ctx.moveTo(61, 39);
    ctx.lineTo(78, 35);
    ctx.stroke();
  } else if (id === 'scarf') {
    ctx.fillStyle = '#eb9476';
    ctx.beginPath();
    ctx.moveTo(17, 35);
    ctx.quadraticCurveTo(50, 56, 83, 35);
    ctx.lineTo(78, 60);
    ctx.quadraticCurveTo(52, 76, 22, 59);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#e9b36e';
    ctx.beginPath();
    ctx.moveTo(58, 59);
    ctx.lineTo(77, 57);
    ctx.lineTo(70, 91);
    ctx.lineTo(52, 86);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
