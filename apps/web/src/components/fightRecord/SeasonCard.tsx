/**
 * Season card on the dashboard (AZF-W3-05 US-01).
 *
 * Shows the season, the belt held and what the next one asks for. Nothing
 * here counts down: "days left" is a plain sentence, never a ring or a timer,
 * and the meter shows progress toward the next belt rather than days missed.
 * No weight, calorie or body figure appears on this surface.
 *
 * Renders only once there is a season to show. While the request is in
 * flight, when it fails, and when Fight Record is off for the account it
 * renders nothing at all, so a dark launch leaves the dashboard exactly as it
 * was: no skeleton that collapses, no error card about a feature the user
 * does not have. The /fight-record page carries the loading and error states.
 * Also hosts the celebration, which is why every new belt is announced on the
 * next dashboard visit.
 *
 * Fight Camp (AZF-P1) adds to the card only what is switched on for the
 * account: the season's accent and coach line, then the enrolment action.
 * With every Fight Camp flag off the card renders exactly as it did in R1a.
 */
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '@/components/ui/GlassCard';
import { formatDate } from '@/lib/format';
import { beltName, nextBeltCopy, useFightCamp, useFightRecord } from '@/lib/fightRecord';
import { EnrolAction } from '@/components/fightCamp/EnrolAction';
import { CutManChip } from '@/components/fightCamp/CutMan';
import { BeltBadge } from './BeltBadge';
import { BeltCelebration } from './BeltCelebration';

export function SeasonCard() {
  const navigate = useNavigate();
  const record = useFightRecord().data;
  const camp = useFightCamp().data ?? null;
  if (!record) return null;

  const { season, activeDays, daysLeft, tier, next } = record.current;
  const pct = next ? Math.min(100, Math.round((activeDays / next.activeDays) * 100)) : 100;

  return (
    <>
      <GlassCard className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="heading-display font-heading text-2xl text-on-surface">
              Season {season.number}
            </h2>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              {season.name} · {formatDate(season.startsOn)} to {formatDate(season.endsOn)}
            </p>
          </div>
          <BeltBadge tier={tier} size="sm" className="shrink-0" decorative />
        </div>

        <p className="mt-4 font-heading text-2xl font-semibold leading-tight text-on-surface">
          {tier ? beltName(tier) : 'No belt yet'}
        </p>
        <p className="mt-1 text-sm text-on-surface-variant text-pretty">{nextBeltCopy(record)}</p>

        {/* Toward the next belt. The meter never marks an individual day. Its
            fill is the season's one accent when Fight Camp is on. */}
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-outline-variant/40"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${pct}%`, ...(camp ? { backgroundColor: camp.theme.accent } : {}) }}
          />
        </div>

        {camp && (
          <p className="mt-3 text-sm text-on-surface text-pretty">{camp.theme.coachLine}</p>
        )}
        {camp?.grace && <CutManChip grace={camp.grace} />}
        {camp?.enrolment && <EnrolAction enrolment={camp.enrolment} season={season} />}

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs tabular-nums text-on-surface-variant">
            {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left in the season
          </p>
          <button
            type="button"
            onClick={() => navigate('/fight-record')}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Fight Record
          </button>
        </div>
      </GlassCard>
      <BeltCelebration record={record} />
    </>
  );
}
