/**
 * /fight-record/recap/:seasonNumber: "Your Season N" (AZF-P1 US-A3).
 *
 * A look back in days and cheers: the belt held, days shown up, the longest
 * run, cheers given and received, and the squad. Nothing about weight, food
 * or bodies. Share opens the Share Kit's recap card; joining the new season
 * is offered here too, because a finished season is the natural fresh start.
 */
import { useEffect, useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { seasonByNumber, seasonTheme, type SeasonRecap } from '@aquazerofit/shared';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppBackground } from '@/components/layout/AppBackground';
import { BottomNav } from '@/components/ui/BottomNav';
import { GlassCard } from '@/components/ui/GlassCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { BeltBadge } from '@/components/fightRecord/BeltBadge';
import { ShareKitSheet } from '@/components/fightCamp/ShareKitSheet';
import { EnrolAction } from '@/components/fightCamp/EnrolAction';
import { ApiError } from '@/lib/api';
import { beltName, useFightCamp, useFightRecord } from '@/lib/fightRecord';
import { useSeasonRecap } from '@/lib/fightCamp';
import { trackGrowth } from '@/lib/growth';

export default function RecapPage() {
  const { seasonNumber = '' } = useParams();
  const n = Number(seasonNumber);
  const recap = useSeasonRecap(Number.isInteger(n) && n >= 1 ? n : null);

  let body;
  if (recap.isPending) {
    body = (
      <div aria-busy="true" aria-label="Recap loading" className="mt-6 space-y-4">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  } else if (recap.isError) {
    if (recap.error instanceof ApiError && recap.error.status === 404) return <Navigate to="/fight-record" replace />;
    body = (
      <div className="mt-6">
        <ErrorState surface="recap" message="We couldn't load your season recap." retry={() => void recap.refetch()} />
      </div>
    );
  } else if (!recap.data) {
    return <Navigate to="/fight-record" replace />;
  } else {
    body = <Recap recap={recap.data} />;
  }

  return (
    <>
      <AppBackground />
      <div className="azf-content relative mx-auto min-h-screen max-w-md safe-bottom">
        <div className="px-5 pb-28">
          <AppHeader title="Season recap" back />
          {body}
        </div>
        <BottomNav />
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-surface-container-low p-4">
      <dt className="text-xs text-on-surface-variant">{label}</dt>
      <dd className="mt-1 font-heading text-2xl font-semibold tabular-nums text-on-surface">{value}</dd>
    </div>
  );
}

function Recap({ recap }: { recap: SeasonRecap }) {
  const [sharing, setSharing] = useState(false);
  const camp = useFightCamp().data;
  const record = useFightRecord().data;
  const theme = seasonTheme(recap.seasonNumber);
  const card = useMemo(
    () => ({
      kind: 'recap' as const,
      season: seasonByNumber(recap.seasonNumber),
      accent: seasonTheme(recap.seasonNumber).accent,
      belt: recap.belt,
      activeDays: recap.activeDays,
    }),
    [recap],
  );

  useEffect(() => {
    void trackGrowth('fc_recap_viewed', { season: recap.seasonNumber, belt: recap.belt ?? 'none' });
  }, [recap.seasonNumber, recap.belt]);

  return (
    <div className="mt-4 space-y-5">
      <GlassCard className="p-5">
        {/* The accent marks, never colours text: it has no contrast promise. */}
        <p className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
          <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: theme.accent }} />
          {recap.seasonName}
        </p>
        <h2 className="heading-display mt-1 font-heading text-3xl text-on-surface text-balance">
          Your Season {recap.seasonNumber}
        </h2>
        <div className="mt-4 flex items-center gap-4">
          <BeltBadge tier={recap.belt} size="md" decorative />
          <p className="font-heading text-2xl font-semibold text-on-surface">
            {recap.belt ? beltName(recap.belt) : 'No belt this season'}
          </p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Days you showed up" value={recap.activeDays} />
          <Stat label="Longest run" value={`${recap.longestRun} ${recap.longestRun === 1 ? 'day' : 'days'}`} />
          <Stat label="Cheers given" value={recap.cheersGiven} />
          <Stat label="Cheers received" value={recap.cheersReceived} />
        </dl>
        {recap.squadName && (
          <p className="mt-4 text-sm text-on-surface">
            You finished the season with <span className="font-semibold">{recap.squadName}</span>.
          </p>
        )}
        {camp?.shareKit && record?.adult && (
          <PrimaryButton className="mt-5" onClick={() => setSharing(true)}>
            Share your season
          </PrimaryButton>
        )}
      </GlassCard>

      {camp?.enrolment && record && !camp.enrolment.enrolled && (
        <GlassCard className="p-5">
          <h2 className="font-heading text-lg font-semibold text-on-surface">A new season is open</h2>
          <p className="mt-1 text-sm text-on-surface-variant text-pretty">{camp.theme.coachLine}</p>
          <EnrolAction enrolment={camp.enrolment} season={record.current.season} source="recap" />
        </GlassCard>
      )}

      {sharing && (
        <ShareKitSheet open onClose={() => setSharing(false)} accentId={theme.accentId} card={card} />
      )}
    </div>
  );
}
