import { useEffect, useState } from 'react';
import type { CoachArt } from '@aquazerofit/shared';

type Expression = 'neutral' | 'celebrate' | 'encourage';

/**
 * A coach's face, with a monogram fallback.
 *
 * The fallback is the point of this component. Coach art is a large, slowly
 * produced asset set — nine characters × up to four expressions — and the code
 * ships before the art does. Without a fallback, every missing file is a broken
 * image icon in the middle of the app's most emotional surface, which makes
 * the whole feature look unfinished when it is merely un-illustrated.
 *
 * The chain is **expression → avatar → monogram**, and the middle step is not
 * optional politeness. Expression variants are hand-made and currently do not
 * exist for anyone, so a single-step fallback would replace the coach's face
 * with initials at exactly the moment the coach congratulates you — turning
 * the feature's best moment into its most obviously broken one. Degrading to
 * the neutral avatar keeps the character present and only loses the emotion.
 *
 * Note that a missing file does not 404 here: the SPA host answers unknown
 * paths with `index.html`, so the browser receives 200 text/html and fails to
 * *decode* it. `onError` fires either way, which is why this is keyed on the
 * decode failing rather than on a status code nothing here ever sees.
 */
export function CoachAvatar({
  art,
  name,
  colour,
  size = 44,
  expression = 'neutral',
  className = '',
}: {
  art: CoachArt;
  name: string;
  colour: string;
  size?: number;
  expression?: Expression;
  className?: string;
}) {
  const preferred = sourceFor(art, expression);
  // How far down the chain we have fallen: 0 = preferred, 1 = neutral avatar,
  // 2 = monogram.
  const [step, setStep] = useState(0);

  // A new preferred source (coach switch, expression change) restarts the
  // chain — otherwise one missing celebration image permanently downgrades the
  // neutral avatar that was loading perfectly well.
  useEffect(() => setStep(0), [preferred]);

  const src = step === 0 ? preferred : step === 1 ? art.avatar : undefined;
  const failed = step >= 2;
  const dimension = { width: size, height: size };

  if (failed || !src) {
    return (
      <span
        aria-hidden="true"
        style={{ ...dimension, backgroundColor: `${colour}22`, color: colour, borderColor: `${colour}55` }}
        className={`inline-flex items-center justify-center rounded-full border font-heading font-semibold select-none ${className}`}
      >
        <span style={{ fontSize: Math.round(size * 0.42) }}>{initialsOf(name)}</span>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      // Skip straight to the monogram when the neutral avatar is what just
      // failed; retrying the same file would loop.
      onError={() => setStep((current) => (current === 0 && preferred !== art.avatar ? 1 : 2))}
      style={{ ...dimension, borderColor: `${colour}55` }}
      className={`rounded-full border object-cover object-top bg-surface-variant/40 ${className}`}
    />
  );
}

function sourceFor(art: CoachArt, expression: Expression): string | undefined {
  if (expression === 'celebrate') return art.celebrate ?? art.avatar;
  if (expression === 'encourage') return art.encourage ?? art.avatar;
  return art.avatar;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/**
 * Full-body character-select art, with the same fallback contract. Kept
 * separate from the avatar because the portrait is a tall crop that must not
 * be forced into a circle.
 */
export function CoachPortrait({
  art,
  name,
  colour,
  className = '',
}: {
  art: CoachArt;
  name: string;
  colour: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [art.portrait]);

  if (failed) {
    return (
      <div
        style={{ backgroundColor: `${colour}18`, color: colour }}
        className={`flex items-end justify-center ${className}`}
      >
        <span className="font-heading font-semibold text-4xl opacity-40 mb-4">
          {initialsOf(name)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={art.portrait}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-contain object-bottom ${className}`}
    />
  );
}
