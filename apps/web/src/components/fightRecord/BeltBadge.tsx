/**
 * A belt, drawn: band, knot, tails and the rank bar near the end. Pure SVG so
 * it scales from a shelf chip to the celebration hero without an asset, and so
 * the colour comes from the same table as the share card (lib/fightRecord).
 *
 * "No belt yet" is a dashed outline rather than a grey belt: a grey belt would
 * read as a belt someone lost, and nothing in Fight Record can be lost.
 */
import type { BeltTier } from '@aquazerofit/shared';
import { BELT_COLOUR, beltName, rankBarColour } from '@/lib/fightRecord';

const SIZE = { sm: 'w-14', md: 'w-20', lg: 'w-36' } as const;

export function BeltBadge({
  tier,
  size = 'md',
  className = '',
  decorative = false,
}: {
  tier: BeltTier | null;
  size?: keyof typeof SIZE;
  className?: string;
  /** Set when adjacent text already names the belt. */
  decorative?: boolean;
}) {
  const label = tier ? beltName(tier) : 'No belt yet';
  const a11y = decorative
    ? { 'aria-hidden': true as const }
    : { role: 'img' as const, 'aria-label': label };

  if (!tier) {
    return (
      <svg viewBox="0 0 120 56" className={`${SIZE[size]} h-auto ${className}`} {...a11y}>
        <rect
          x="4"
          y="16"
          width="112"
          height="16"
          rx="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="6 5"
          className="text-outline-variant"
        />
      </svg>
    );
  }

  const fill = BELT_COLOUR[tier];
  return (
    <svg viewBox="0 0 120 56" className={`${SIZE[size]} h-auto ${className}`} {...a11y}>
      <g stroke="currentColor" strokeWidth="1.5" className="text-outline">
        <rect x="4" y="16" width="112" height="16" rx="5" fill={fill} />
        <rect x="88" y="18" width="14" height="12" fill={rankBarColour(tier)} stroke="none" />
        <path d="M57 32 L46 52 L53 54 L61 32 Z" fill={fill} />
        <path d="M63 32 L74 52 L67 54 L59 32 Z" fill={fill} />
        <rect x="50" y="11" width="20" height="26" rx="5" fill={fill} />
      </g>
    </svg>
  );
}
