import { useState } from 'react';

export interface RingMacroData {
  key: string;
  label: string;
  consumed: number;
  target: number;
  unit: string;
  color: string;
  glowColor: string;
  icon: string;
}

export interface CircularMacroRingProps {
  calories: { consumed: number; target: number };
  protein: { consumed: number; target: number };
  carbs: { consumed: number; target: number };
  fat: { consumed: number; target: number };
  water: { consumed: number; target: number }; // stored in ml (target e.g. 2500ml)
  size?: number;
  strokeWidth?: number;
  className?: string;
  onSelectRing?: (key: string | null) => void;
}

export function CircularMacroRing({
  calories,
  protein,
  carbs,
  fat,
  water,
  size = 240,
  strokeWidth = 9,
  className = '',
  onSelectRing,
}: CircularMacroRingProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  // Convert water to Liters for cleaner ring display if preferred, or keep ml.
  // Standardizing ring values
  const rings: RingMacroData[] = [
    {
      key: 'calories',
      label: 'Calories',
      consumed: Math.max(0, calories.consumed),
      target: Math.max(1, calories.target),
      unit: 'kcal',
      color: '#2fd9f4', // Aqua primary
      glowColor: 'rgba(47, 217, 244, 0.5)',
      icon: 'local_fire_department',
    },
    {
      key: 'protein',
      label: 'Protein',
      consumed: Math.max(0, protein.consumed),
      target: Math.max(1, protein.target),
      unit: 'g',
      color: '#10b981', // Emerald green
      glowColor: 'rgba(16, 185, 129, 0.5)',
      icon: 'fitness_center',
    },
    {
      key: 'carbs',
      label: 'Carbs',
      consumed: Math.max(0, carbs.consumed),
      target: Math.max(1, carbs.target),
      unit: 'g',
      color: '#f59e0b', // Amber
      glowColor: 'rgba(245, 158, 11, 0.5)',
      icon: 'grain',
    },
    {
      key: 'fat',
      label: 'Fat',
      consumed: Math.max(0, fat.consumed),
      target: Math.max(1, fat.target),
      unit: 'g',
      color: '#f43f5e', // Coral / Rose
      glowColor: 'rgba(244, 63, 94, 0.5)',
      icon: 'opacity',
    },
    {
      key: 'water',
      label: 'Hydration',
      consumed: Math.max(0, water.consumed),
      target: Math.max(1, water.target),
      unit: 'ml',
      color: '#3b82f6', // Sky Blue
      glowColor: 'rgba(59, 130, 246, 0.5)',
      icon: 'water_drop',
    },
  ];

  const gap = 3.5; // Gap between concentric rings
  const center = size / 2;
  const outerRadius = center - strokeWidth;

  const handleRingHover = (key: string | null) => {
    setHoveredKey(key);
    onSelectRing?.(key);
  };

  const activeRing = rings.find((r) => r.key === hoveredKey);

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      {/* SVG Concentric Rings */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="transform -rotate-90 drop-shadow-md select-none"
      >
        <defs>
          {rings.map((ring) => (
            <filter key={`glow-${ring.key}`} id={`ring-glow-${ring.key}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          ))}
        </defs>

        {rings.map((ring, index) => {
          const radius = outerRadius - index * (strokeWidth + gap);
          if (radius <= 10) return null; // Avoid inverted or zero radius

          const circumference = 2 * Math.PI * radius;
          const ratio = Math.min(1, ring.consumed / ring.target);
          const strokeDashoffset = circumference * (1 - ratio);
          const isHovered = hoveredKey === ring.key;
          const isAnyHovered = hoveredKey !== null;

          return (
            <g
              key={ring.key}
              className="cursor-pointer transition-opacity duration-300"
              onMouseEnter={() => handleRingHover(ring.key)}
              onMouseLeave={() => handleRingHover(null)}
              onClick={() => handleRingHover(hoveredKey === ring.key ? null : ring.key)}
            >
              {/* Background Track */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="rgba(255, 255, 255, 0.07)"
                strokeWidth={strokeWidth}
              />

              {/* Progress Ring Stroke */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={ring.color}
                strokeWidth={isHovered ? strokeWidth + 2 : strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                filter={isHovered ? `url(#ring-glow-${ring.key})` : undefined}
                opacity={isAnyHovered && !isHovered ? 0.35 : 1}
                className="transition-all duration-700 ease-out"
              />
            </g>
          );
        })}
      </svg>

      {/* Center Display / Tooltip Overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center"
        aria-live="polite"
      >
        {activeRing ? (
          <div className="animate-fade-in flex flex-col items-center">
            <span
              className="material-symbols-outlined text-xl mb-0.5"
              style={{ color: activeRing.color }}
              aria-hidden="true"
            >
              {activeRing.icon}
            </span>
            <span className="text-xs uppercase font-semibold tracking-wider text-on-surface-variant">
              {activeRing.label}
            </span>
            <div className="text-2xl font-bold text-on-surface tabular-nums leading-tight">
              {Math.round(activeRing.consumed)}
              <span className="text-xs font-normal text-on-surface-variant ml-1">
                / {Math.round(activeRing.target)} {activeRing.unit}
              </span>
            </div>
            <span
              className="text-[11px] font-bold mt-0.5 px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${activeRing.color}20`, color: activeRing.color }}
            >
              {Math.round((activeRing.consumed / activeRing.target) * 100)}%
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <span className="text-3xl font-extrabold text-primary tabular-nums tracking-tight">
              {Math.max(0, calories.target - calories.consumed)}
            </span>
            <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">
              kcal left
            </span>
            <span className="text-[10px] text-outline mt-1 font-mono">Hover ring for details</span>
          </div>
        )}
      </div>

      {/* Ring Legend Pill Controls below */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4 max-w-xs">
        {rings.map((ring) => {
          const isHovered = hoveredKey === ring.key;
          const pct = Math.min(999, Math.round((ring.consumed / ring.target) * 100));
          return (
            <button
              key={ring.key}
              type="button"
              onMouseEnter={() => handleRingHover(ring.key)}
              onMouseLeave={() => handleRingHover(null)}
              onClick={() => handleRingHover(hoveredKey === ring.key ? null : ring.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                isHovered
                  ? 'scale-105 border-white/40 shadow-lg'
                  : 'border-outline-variant/40 bg-surface-container-low/60 text-on-surface-variant'
              }`}
              style={{
                color: isHovered ? ring.color : undefined,
                borderColor: isHovered ? ring.color : undefined,
              }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: ring.color }}
                aria-hidden="true"
              />
              <span>{ring.label}</span>
              <span className="tabular-nums opacity-75 text-[11px]">{pct}%</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
