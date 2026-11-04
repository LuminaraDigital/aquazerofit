/**
 * Share Kit effort cards (AZF-P1 US-F1, §6.2): what a card may say, and the
 * drawing of it in story, feed and X sizes.
 *
 * Effort only, by construction. `EffortCardInput` has fields for a belt,
 * active days, days this week, a season and a squad name, and nothing else,
 * so a weight, a calorie count, a meal or a body photo has nowhere to go.
 * The name on the card is the person's first name only if they turn it on;
 * otherwise "A Fight Camp member".
 *
 * Content is pure and tested; drawing is a thin layer over it.
 */
import {
  SHARE_FORMATS,
  STORY_SAFE_ZONE,
  type BeltTier,
  type Season,
  type ShareFormat,
  type ShareKindP1,
} from '@aquazerofit/shared';
import { BELT_COLOUR, BELT_LABEL, rankBarColour } from './fightRecord';

export const ANONYMOUS_NAME = 'A Fight Camp member';

export interface EffortCardInput {
  kind: ShareKindP1;
  season: Season;
  accent: string;
  belt: BeltTier | null;
  /** Active days this season (season and recap cards). */
  activeDays?: number;
  /** Active days this week, 0 to 7 (week cards). */
  weekActiveDays?: number;
  /** Squad cards only: the squad's own name, never its members. */
  squadName?: string;
  /** First name, or null for the anonymous default. */
  firstName: string | null;
  /** The short link printed on the card. */
  link: string;
}

export interface EffortCard {
  accent: string;
  belt: BeltTier | null;
  /** The one big thing on the card: a count of days or a belt. */
  hero: string;
  heroLabel: string;
  seasonLine: string;
  name: string;
  link: string;
  /** For native share and download (US-F1 §6.2 "alt text"). */
  alt: string;
}

const days = (n: number) => `${n} active ${n === 1 ? 'day' : 'days'}`;

export function effortCard(input: EffortCardInput): EffortCard {
  const name = input.firstName?.trim() || ANONYMOUS_NAME;
  const seasonLine = `Season ${input.season.number} · ${input.season.name}`;
  const beltLabel = input.belt ? `${BELT_LABEL[input.belt]} Belt` : null;
  const base = { accent: input.accent, belt: input.belt, seasonLine, name, link: input.link };
  switch (input.kind) {
    case 'belt':
      return {
        ...base,
        hero: beltLabel ?? 'No belt yet',
        heroLabel: 'Earned by showing up',
        alt: `${name} earned the ${beltLabel ?? 'first belt'} in Fight Camp, ${seasonLine}.`,
      };
    case 'season': {
      const n = input.activeDays ?? 0;
      return {
        ...base,
        hero: String(n),
        heroLabel: n === 1 ? 'active day this season' : 'active days this season',
        alt: `${name}: ${days(n)} so far in Fight Camp, ${seasonLine}${beltLabel ? `, ${beltLabel}` : ''}.`,
      };
    }
    case 'recap': {
      const n = input.activeDays ?? 0;
      return {
        ...base,
        hero: String(n),
        heroLabel: beltLabel ? `active days · ${beltLabel}` : 'active days this season',
        alt: `${name}'s season recap: ${days(n)}${beltLabel ? ` and the ${beltLabel}` : ''}, ${seasonLine}.`,
      };
    }
    case 'week': {
      const n = Math.max(0, Math.min(7, input.weekActiveDays ?? 0));
      return {
        ...base,
        belt: null,
        hero: `${n} of 7`,
        heroLabel: 'days showed up this week',
        alt: `${name} showed up ${n} of 7 days this week in Fight Camp.`,
      };
    }
    case 'squad_invite':
      return {
        ...base,
        belt: null,
        hero: input.squadName ?? 'My squad',
        heroLabel: 'Join my squad',
        alt: `An invitation to join ${input.squadName ?? 'a squad'} in Fight Camp on AquaZeroFit.`,
      };
  }
}

// ---------- drawing ----------

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawBelt(ctx: CanvasRenderingContext2D, tier: BeltTier, cx: number, cy: number, width: number): void {
  const h = width * 0.14;
  ctx.save();
  ctx.lineWidth = Math.max(2, width * 0.012);
  ctx.strokeStyle = 'rgba(242, 251, 255, 0.6)';
  ctx.fillStyle = BELT_COLOUR[tier];
  roundRect(ctx, cx - width / 2, cy - h / 2, width, h, h * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = rankBarColour(tier);
  ctx.fillRect(cx + width * 0.28, cy - h * 0.38, width * 0.11, h * 0.76);
  ctx.fillStyle = BELT_COLOUR[tier];
  roundRect(ctx, cx - h * 0.9, cy - h * 0.8, h * 1.8, h * 1.6, h * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Shrink a font until `text` fits `maxWidth`. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, size: number, maxWidth: number): void {
  let s = size;
  ctx.font = `${weight} ${s}px system-ui, sans-serif`;
  while (s > 24 && ctx.measureText(text).width > maxWidth) {
    s -= 4;
    ctx.font = `${weight} ${s}px system-ui, sans-serif`;
  }
}

export async function renderEffortCard(card: EffortCard, format: ShareFormat): Promise<Blob> {
  const { width: W, height: H } = SHARE_FORMATS[format];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Story keeps everything inside the safe zone the story chrome covers.
  const top = format === 'story' ? STORY_SAFE_ZONE.top : 0;
  const bottom = format === 'story' ? H - STORY_SAFE_ZONE.bottom : H;
  const wide = format === 'x';
  const unit = wide ? H / 900 : W / 1080;

  ctx.fillStyle = '#06151f';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = card.accent;
  ctx.fillRect(0, top + 60 * unit, W, 18 * unit);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const cx = W / 2;
  const span = bottom - top;

  ctx.fillStyle = card.accent;
  ctx.font = `600 ${36 * unit}px system-ui, sans-serif`;
  ctx.fillText(card.seasonLine.toUpperCase(), cx, top + span * 0.16);

  if (card.belt) drawBelt(ctx, card.belt, cx, top + span * 0.32, (wide ? 620 : 760) * unit);

  ctx.fillStyle = '#f2fbff';
  // The hero is the card's one number (or belt): at least 48 px at story size.
  fit(ctx, card.hero, 800, (card.hero.length > 8 ? 120 : 220) * unit, W - 160 * unit);
  ctx.fillText(card.hero, cx, top + span * (card.belt ? 0.58 : 0.5));

  ctx.fillStyle = '#c8e6f0';
  ctx.font = `500 ${42 * unit}px system-ui, sans-serif`;
  ctx.fillText(card.heroLabel, cx, top + span * (card.belt ? 0.65 : 0.58));

  fit(ctx, card.name, 600, 40 * unit, W - 160 * unit);
  ctx.fillText(card.name, cx, top + span * 0.76);

  ctx.fillStyle = '#f2fbff';
  ctx.font = `700 ${48 * unit}px system-ui, sans-serif`;
  ctx.fillText('AquaZeroFit', cx, top + span * 0.88);
  ctx.fillStyle = '#c8e6f0';
  fit(ctx, card.link, 500, 30 * unit, W - 120 * unit);
  ctx.fillText(card.link, cx, top + span * 0.93);

  try {
    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png');
    });
  } finally {
    // A 1080x1920 backing store is large; iOS caps the total a page may hold.
    canvas.width = 0;
    canvas.height = 0;
  }
}
