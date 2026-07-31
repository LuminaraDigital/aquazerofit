import type { TrendPoint } from '@aquazerofit/shared';

interface SparklineProps {
  points: TrendPoint[];
  width?: number;
  height?: number;
  label?: string;
}

/** Hand-rolled SVG spark-line (no chart libs) for weight trends. */
export function Sparkline({ points, width = 280, height = 64, label }: SparklineProps) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-on-surface-variant">Log a few weigh-ins to see your trend.</p>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 6;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (p.value - min) / span) * (height - pad * 2);
    return { x, y };
  });

  const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const area = `${line} L${last.x.toFixed(1)},${height} L${first.x.toFixed(1)},${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label={
        label ??
        `Weight trend from ${points[0].value.toFixed(1)} to ${points[points.length - 1].value.toFixed(1)} kilograms`
      }
    >
      <defs>
        <linearGradient id="azf-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2fd9f4" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2fd9f4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#azf-spark-fill)" />
      <path
        d={line}
        fill="none"
        stroke="#8aebff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="3.5" fill="#45dfa4" stroke="#0e1416" strokeWidth="1.5" />
    </svg>
  );
}
