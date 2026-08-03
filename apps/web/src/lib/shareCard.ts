/**
 * Renders branded share cards to a canvas PNG (no external deps).
 * Draws a random Akin pose when the pose sheet is available.
 */
import { AKIN_POSES, AQUA_CHARACTER } from '@aquazerofit/shared';

export type ShareKind = 'meal' | 'workout' | 'streak' | 'challenge';

export interface ShareCardPayload {
  kind: ShareKind;
  headline: string;
  subline: string;
  stats: { label: string; value: string }[];
  catchphrase?: string;
}

const W = 1080;
const H = 1350;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export async function renderShareCard(payload: ShareCardPayload): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#04141f');
  bg.addColorStop(0.55, '#0a2a38');
  bg.addColorStop(1, '#062018');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft aqua glow
  const glow = ctx.createRadialGradient(W * 0.7, H * 0.2, 40, W * 0.7, H * 0.2, 420);
  glow.addColorStop(0, 'rgba(47, 217, 244, 0.28)');
  glow.addColorStop(1, 'rgba(47, 217, 244, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Card panel
  ctx.fillStyle = 'rgba(8, 28, 40, 0.72)';
  roundRect(ctx, 64, 72, W - 128, H - 160, 48);
  ctx.fill();
  ctx.strokeStyle = 'rgba(138, 235, 255, 0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Character (full figure, random pose for share variety)
  try {
    const pose = AKIN_POSES[Math.floor(Math.random() * AKIN_POSES.length)]!;
    const character = await loadImage(AQUA_CHARACTER.poses[pose].url);
    const charH = 520;
    const scale = charH / character.height;
    const charW = character.width * scale;
    ctx.drawImage(character, W / 2 - charW / 2, 90, charW, charH);
  } catch {
    try {
      const mark = await loadImage(AQUA_CHARACTER.brandMarkUrl);
      const markSize = 160;
      ctx.drawImage(mark, (W - markSize) / 2, 140, markSize, markSize);
    } catch {
      ctx.fillStyle = '#2fd9f4';
      ctx.beginPath();
      ctx.arc(W / 2, 210, 70, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = 'rgba(138, 235, 255, 0.9)';
  ctx.font = '600 28px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(AQUA_CHARACTER.name.toUpperCase(), W / 2, 640);

  ctx.fillStyle = '#f2fbff';
  ctx.font = '700 58px system-ui, sans-serif';
  wrapText(ctx, payload.headline, W / 2, 710, W - 220, 66);

  ctx.fillStyle = 'rgba(200, 230, 240, 0.78)';
  ctx.font = '400 32px system-ui, sans-serif';
  wrapText(ctx, payload.subline, W / 2, 820, W - 240, 40);

  // Stats row
  const stats = payload.stats.slice(0, 3);
  const gap = 28;
  const boxW = (W - 220 - gap * (stats.length - 1)) / Math.max(1, stats.length);
  let x = 110;
  const y = 920;
  for (const stat of stats) {
    ctx.fillStyle = 'rgba(20, 60, 78, 0.85)';
    roundRect(ctx, x, y, boxW, 150, 28);
    ctx.fill();
    ctx.fillStyle = '#2fd9f4';
    ctx.font = '700 48px system-ui, sans-serif';
    ctx.fillText(stat.value, x + boxW / 2, y + 70);
    ctx.fillStyle = 'rgba(200, 230, 240, 0.7)';
    ctx.font = '500 24px system-ui, sans-serif';
    ctx.fillText(stat.label.toUpperCase(), x + boxW / 2, y + 115);
    x += boxW + gap;
  }

  const phrase =
    payload.catchphrase ??
    AQUA_CHARACTER.catchphrases[Math.floor(Math.random() * AQUA_CHARACTER.catchphrases.length)]!;
  ctx.fillStyle = '#45dfa4';
  ctx.font = '600 34px system-ui, sans-serif';
  ctx.fillText(`"${phrase}"`, W / 2, 1140);

  ctx.fillStyle = 'rgba(200, 230, 240, 0.55)';
  ctx.font = '500 26px system-ui, sans-serif';
  ctx.fillText('AquaZeroFit', W / 2, 1210);
  ctx.font = '400 22px system-ui, sans-serif';
  ctx.fillText(AQUA_CHARACTER.tagline, W / 2, 1250);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG encode failed'));
    }, 'image/png');
  });
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(/\s+/);
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

export async function blobToObjectUrl(blob: Blob): Promise<string> {
  return URL.createObjectURL(blob);
}
