import type { TrendPoint } from '@aquazerofit/shared';

interface Pt {
  x: number;
  y: number;
}


/** Catmull-Rom → cubic bezier smooth path. */
export function smoothPath(pts: Pt[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}



function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function WeightChart({
  series,
  goal,
}: {
  series: TrendPoint[];
  goal: number | null;
}) {
  const W = 360;
  const H = 170;
  const PAD = 14;
  const values = series.map((p) => p.value);
  const withGoal = goal !== null ? [...values, goal] : values;
  const min = Math.min(...withGoal);
  const max = Math.max(...withGoal);
  const span = Math.max(0.5, max - min);
  const x = (i: number) => PAD + (i / Math.max(1, series.length - 1)) * (W - PAD * 2);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2 - 18);
  const pts = series.map((p, i) => ({ x: x(i), y: y(p.value) }));
  const line = smoothPath(pts);
  const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z` : '';
  const minIdx = values.indexOf(Math.min(...values));
  const maxIdx = values.indexOf(Math.max(...values));
  const first = series[0];
  const last = series[series.length - 1];

  return (
    <figure aria-label={`Weight chart from ${first ? shortDate(first.date) : ''} to ${last ? shortDate(last.date) : ''}. Latest ${last ? last.value.toFixed(1) : '-'} kilograms${goal !== null ? `, goal ${goal.toFixed(1)} kilograms` : ''}.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="azfWeightArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8aebff" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#8aebff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {goal !== null && (
          <>
            <line
              x1={PAD}
              x2={W - PAD}
              y1={y(goal)}
              y2={y(goal)}
              stroke="#45dfa4"
              strokeDasharray="4 4"
              strokeWidth="1.5"
            />
            <text x={W - PAD} y={y(goal) - 5} textAnchor="end" fontSize="10" fontWeight="700" fill="#45dfa4">
              Goal: {goal.toFixed(1)}kg
            </text>
          </>
        )}
        {area && <path d={area} fill="url(#azfWeightArea)" />}
        <path d={line} fill="none" stroke="#8aebff" strokeWidth="3" strokeLinecap="round" />
        {pts.length > 0 && (
          <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="4" fill="#8aebff" />
        )}
        {minIdx >= 0 && pts[minIdx] && (
          <text x={pts[minIdx].x} y={Math.min(H - 4, pts[minIdx].y + 14)} textAnchor="middle" fontSize="9" fill="#bbc9cd">
            {values[minIdx].toFixed(1)}
          </text>
        )}
        {maxIdx >= 0 && pts[maxIdx] && maxIdx !== minIdx && (
          <text x={pts[maxIdx].x} y={Math.max(10, pts[maxIdx].y - 8)} textAnchor="middle" fontSize="9" fill="#bbc9cd">
            {values[maxIdx].toFixed(1)}
          </text>
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        <span>{first ? shortDate(first.date) : ''}</span>
        <span>{last ? shortDate(last.date) : ''}</span>
      </figcaption>
    </figure>
  );
}

export function KcalBars({ series, target }: { series: TrendPoint[]; target: number | null }) {
  const W = 360;
  const H = 140;
  const PAD = 10;
  const max = Math.max(target ?? 0, ...series.map((p) => p.value), 1);
  const bw = Math.max(2, (W - PAD * 2) / Math.max(1, series.length) - 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const avg = series.length
    ? Math.round(series.reduce((a, p) => a + p.value, 0) / series.length)
    : 0;

  return (
    <figure aria-label={`Daily calorie intake bars. Average ${avg} kilocalories${target !== null ? ` against a target of ${target}` : ''}.`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-hidden="true">
        {/* Every bar is the same aqua. Painting over-target days coral marked
            them as errors, which is the calorie-target guilt this product is
            required to design out (AQF-11 §6) - and it was redundant besides:
            a bar that crosses the dashed target line has already said so, by
            position rather than by alarm. Position also survives colour
            blindness, which the red/blue split did not. */}
        {series.map((p, i) => (
          <rect
            key={p.date}
            x={PAD + i * ((W - PAD * 2) / Math.max(1, series.length)) + 1}
            y={y(p.value)}
            width={bw}
            height={Math.max(1, H - PAD - y(p.value))}
            rx={Math.min(3, bw / 2)}
            fill="#2fd9f4"
            opacity={0.7}
          />
        ))}
        {target !== null && (
          <>
            <line x1={PAD} x2={W - PAD} y1={y(target)} y2={y(target)} stroke="#45dfa4" strokeDasharray="4 4" strokeWidth="1.5" />
            <text x={W - PAD} y={y(target) - 4} textAnchor="end" fontSize="10" fontWeight="700" fill="#45dfa4">
              Target {target}
            </text>
          </>
        )}
      </svg>
      <figcaption className="mt-1 text-xs text-on-surface-variant">
        Avg <span className="font-bold text-on-surface tabular-nums">{avg} kcal</span> / day
      </figcaption>
    </figure>
  );
}

export function MacroDonut({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const kcal = { p: protein * 4, c: carbs * 4, f: fat * 9 };
  const total = Math.max(1, kcal.p + kcal.c + kcal.f);
  const R = 52;
  const C = 2 * Math.PI * R;
  const segs = [
    { key: 'Protein', frac: kcal.p / total, color: '#45dfa4', grams: protein },
    { key: 'Carbs', frac: kcal.c / total, color: '#2fd9f4', grams: carbs },
    { key: 'Fat', frac: kcal.f / total, color: '#ffb2b9', grams: fat },
  ];
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <figure
        aria-label={`Average macro split: protein ${Math.round((kcal.p / total) * 100)} percent, carbs ${Math.round((kcal.c / total) * 100)} percent, fat ${Math.round((kcal.f / total) * 100)} percent of calories.`}
      >
        <svg viewBox="0 0 140 140" className="h-32 w-32" role="img" aria-hidden="true">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#1E4C74" strokeWidth="14" />
          {segs.map((s) => {
            const el = (
              <circle
                key={s.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, s.frac * C - 2)} ${C}`}
                strokeDashoffset={-offset * C}
                transform="rotate(-90 70 70)"
              />
            );
            offset += s.frac;
            return el;
          })}
        </svg>
      </figure>
      <ul className="space-y-2">
        {segs.map((s) => (
          <li key={s.key} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="text-on-surface-variant">{s.key}</span>
            <span className="font-bold text-on-surface tabular-nums">
              {Math.round(s.grams)}g · {Math.round(s.frac * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

