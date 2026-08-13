import type { ExperienceStatus } from '@aquazerofit/shared';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * Level, rank and progress toward the next level.
 *
 * The copy rules here match the consistency model's: nothing on this component
 * can go down, and nothing describes a shortfall. It shows XP *earned*, never
 * XP missed; the daily cap reads as "banked for today", not as a limit hit;
 * and there is no countdown, no "you need N more to keep your level", because
 * a level is never lost. A progress bar in a weight-and-food product is a
 * pressure surface by default, and this one is deliberately defused.
 */
export function LevelBar({
  experience,
  loading = false,
  compact = false,
}: {
  experience: ExperienceStatus | undefined;
  loading?: boolean;
  compact?: boolean;
}) {
  if (loading || !experience) {
    return <Skeleton className={compact ? 'h-10 w-full' : 'h-16 w-full'} />;
  }

  const { level, rank, totalXp, levelStartXp, nextLevelXp, levelProgress, earnedToday } =
    experience;
  const intoLevel = totalXp - levelStartXp;
  const levelSpan = nextLevelXp === null ? 0 : nextLevelXp - levelStartXp;
  const pct = Math.round(levelProgress * 100);

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-heading font-semibold text-on-surface tabular-nums">
            Level {level}
          </span>
          <span className="text-xs uppercase tracking-wider text-primary/90 truncate">
            {rank.name}
          </span>
        </div>
        {earnedToday > 0 && (
          <span className="text-xs font-medium text-primary tabular-nums shrink-0">
            +{earnedToday} today
          </span>
        )}
      </div>

      <div
        className="h-2 w-full rounded-full bg-surface-variant/50 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Level ${level} progress`}
      >
        <div
          className="h-full rounded-full cta-gradient transition-[width] duration-700 ease-out"
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>

      {!compact && (
        <p className="text-xs text-on-surface-variant/70 mt-1.5 tabular-nums">
          {nextLevelXp === null
            ? `${totalXp.toLocaleString()} XP — top of the ladder.`
            : `${intoLevel.toLocaleString()} / ${levelSpan.toLocaleString()} XP to level ${level + 1}`}
        </p>
      )}
    </div>
  );
}

/**
 * Today's earnings, itemised. Rendered only when there is something to show —
 * an empty breakdown on a rest morning would read as a scorecard of nothing
 * done, which is the opposite of what this feature is for.
 */
export function XpBreakdown({ experience }: { experience: ExperienceStatus | undefined }) {
  if (!experience || experience.todayBreakdown.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {experience.todayBreakdown.map((entry) => (
        <li
          key={entry.kind}
          className="text-[11px] px-2 py-1 rounded-full bg-surface-variant/40 text-on-surface-variant/80 tabular-nums"
        >
          {entry.label} <span className="text-primary font-medium">+{entry.points}</span>
        </li>
      ))}
      {experience.dailyCapReached && (
        <li className="text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary">
          Full day banked
        </li>
      )}
    </ul>
  );
}
