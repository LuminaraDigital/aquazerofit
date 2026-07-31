import type { ReactNode } from 'react';

type CardTier = 'hero' | 'standard' | 'compact';

/**
 * GlassCard - the surface system.
 * - hero: gradient surface with aqua glow at top edge, for the primary content card
 * - standard: the default glass card (unchanged visual for backward compat)
 * - compact: borderless tonal card for minor content
 */
export function GlassCard({
  className = '',
  children,
  onClick,
  tier = 'standard',
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  tier?: CardTier;
}) {
  const tierClass =
    tier === 'hero' ? 'card-hero' : tier === 'compact' ? 'card-compact' : 'glass-card';

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${tierClass} block w-full text-left transition-transform active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${className}`}
      >
        {children}
      </button>
    );
  }
  return <div className={`${tierClass} ${className}`}>{children}</div>;
}