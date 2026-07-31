import { useEffect, useState, type ReactNode } from 'react';

export type RingTone = 'aqua' | 'green' | 'coral' | 'navy';

const TONE_COLOR: Record<RingTone, string> = {
  aqua: '#2fd9f4',
  green: '#45dfa4',
  coral: '#ffb2b9',
  navy: '#22d3ee',
};

/**
 * SVG progress ring with rounded end-caps and an animated stroke-dashoffset
 * fill on mount. Center content defaults to label/sublabel, or pass children.
 */
export function RingProgress({
  value,
  target,
  size = 120,
  strokeWidth = 8,
  tone = 'aqua',
  label,
  sublabel,
  children,
}: {
  value: number;
  target: number;
  size?: number;
  strokeWidth?: number;
  tone?: RingTone;
  label?: string;
  sublabel?: string;
  children?: ReactNode;
}) {
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setOffset(circumference - pct * circumference),
    );
    return () => cancelAnimationFrame(frame);
  }, [circumference, pct]);

  const color = TONE_COLOR[tone];
  const center = size / 2;

  return (
    <div
      role="img"
      aria-label={`${label ?? 'Progress'}: ${Math.round(value)} of ${Math.round(target)}`}
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={tone === 'navy' ? '#3c494c' : '#1E4C74'}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: 'stroke-dashoffset 800ms cubic-bezier(0.4, 0, 0.2, 1)',
            filter: `drop-shadow(0 0 6px ${color}40)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        {children ?? (
          <>
            {label && (
              <span className="tabular-nums font-body font-bold text-on-surface leading-tight">
                {label}
              </span>
            )}
            {sublabel && (
              <span className="text-xs text-on-surface-variant leading-tight">{sublabel}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
