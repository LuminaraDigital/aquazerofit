/**
 * /fight-record — the season, the belt ladder and every belt ever earned
 * (AZF-W3-05 US-09).
 *
 * The page explains the rules in one paragraph and then shows them, because a
 * mechanic people cannot predict feels arbitrary, and an arbitrary reward is
 * just a slot machine with better manners. Every rung shows its threshold up
 * front; nothing is hidden behind a reveal.
 *
 * The Telegram profile switch appears only where it can work: in the Mini App,
 * on Bot API 8.0+, for an adult on a deployment with the belt emoji set. It
 * asks Telegram for permission first and stores nothing if the user declines.
 * A user the feature is off for is sent home rather than shown a teaser.
 */
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  seasonByNumber,
  seasonTheme,
  tierRank,
  type BeltAwardView,
  type BeltTier,
  type FightRecordStatus,
} from '@aquazerofit/shared';
import { AppHeader } from '@/components/ui/AppHeader';
import { AppBackground } from '@/components/layout/AppBackground';
import { BottomNav } from '@/components/ui/BottomNav';
import { GlassCard } from '@/components/ui/GlassCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { BeltBadge } from '@/components/fightRecord/BeltBadge';
import { BeltCelebration, BeltShareSheet } from '@/components/fightRecord/BeltCelebration';
import { CheersInbox } from '@/components/fightCamp/Cheers';
import { ShareKitSheet } from '@/components/fightCamp/ShareKitSheet';
import { formatDate } from '@/lib/format';
import {
  beltName,
  daysPhrase,
  nextBeltCopy,
  useFightCamp,
  useFightRecord,
  useSetEmojiStatus,
} from '@/lib/fightRecord';
import { canManageEmojiStatus, requestEmojiStatusAccess } from '@/lib/telegram';

export default function FightRecordPage() {
  const query = useFightRecord();

  return (
    <>
      <AppBackground />
      <div className="azf-content relative mx-auto min-h-screen max-w-md safe-bottom">
        <div className="px-5 pb-28">
          <AppHeader title="Fight Record" back />
          {query.isPending ? (
            <div aria-busy="true" aria-label="Fight Record loading" className="mt-6 space-y-4">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-56 w-full" />
            </div>
          ) : query.isError ? (
            <div className="mt-6">
              <ErrorState
                surface="fight-record"
                message="We couldn't load your Fight Record."
                retry={() => void query.refetch()}
              />
            </div>
          ) : query.data ? (
            <Record record={query.data} />
          ) : (
            // Off for this account: there is nothing to see here, and saying
            // "coming soon" to everyone outside a 10% bucket for weeks would
            // advertise a feature they cannot have.
            <Navigate to="/" replace />
          )}
        </div>
        <BottomNav />
      </div>
    </>
  );
}

function Record({ record }: { record: FightRecordStatus }) {
  const { season, activeDays, daysLeft, tier } = record.current;
  const [sharing, setSharing] = useState<BeltAwardView | null>(null);
  const camp = useFightCamp().data;
  const shareKit = Boolean(camp?.shareKit) && record.adult;
  // With the Share Kit on, every share goes through it; off, R1a's belt sheet.
  const [kit, setKit] = useState<{ kind: 'belt' | 'season'; belt: BeltTier | null; seasonNumber: number } | null>(null);
  const kitCard = useMemo(
    () =>
      kit && {
        kind: kit.kind,
        season: seasonByNumber(kit.seasonNumber),
        accent: seasonTheme(kit.seasonNumber).accent,
        belt: kit.belt,
        activeDays,
      },
    [kit, activeDays],
  );
  const share = (belt: BeltAwardView) =>
    shareKit ? setKit({ kind: 'belt', belt: belt.tier, seasonNumber: belt.seasonNumber }) : setSharing(belt);
  const currentBelt = record.belts.find((b) => b.seasonNumber === season.number) ?? null;

  return (
    <div className="mt-4 space-y-5">
      <p className="text-sm leading-relaxed text-on-surface-variant text-pretty">
        A season is eight weeks. Any day you log a meal, water or a weigh-in, or finish a workout,
        is an active day. Belts count active days, so a quiet day never costs you anything, and
        every season starts fresh with your old belts kept here.
      </p>

      <GlassCard className="p-5">
        <h2 className="heading-display font-heading text-2xl text-on-surface">
          Season {season.number} · {season.name}
        </h2>
        <p className="mt-0.5 text-xs text-on-surface-variant">
          {formatDate(season.startsOn)} to {formatDate(season.endsOn)} · {daysLeft}{' '}
          {daysLeft === 1 ? 'day' : 'days'} left
        </p>
        <div className="mt-4 flex items-center gap-4">
          <BeltBadge tier={tier} size="md" decorative />
          <div className="min-w-0">
            <p className="font-heading text-2xl font-semibold text-on-surface">
              {tier ? beltName(tier) : 'No belt yet'}
            </p>
            <p className="text-sm tabular-nums text-on-surface-variant">
              {daysPhrase(activeDays)} this season
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm text-on-surface-variant text-pretty">{nextBeltCopy(record)}</p>
        {currentBelt && (
          <PrimaryButton className="mt-4 w-full" onClick={() => share(currentBelt)}>
            Share my belt
          </PrimaryButton>
        )}
        {shareKit && (
          <button
            type="button"
            onClick={() => setKit({ kind: 'season', belt: tier, seasonNumber: season.number })}
            className="mt-3 min-h-[44px] w-full rounded-lg text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Share this season
          </button>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="font-heading text-lg font-semibold text-on-surface">The ladder</h2>
        <ol className="mt-3 space-y-3">
          {record.ladder.map((rung) => {
            const held = tierRank(tier) >= tierRank(rung.tier);
            return (
              <li key={rung.tier} className="flex items-center gap-3">
                <BeltBadge tier={rung.tier} size="sm" decorative />
                <span className="flex-1 text-sm text-on-surface">{beltName(rung.tier)}</span>
                <span className="text-xs tabular-nums text-on-surface-variant">
                  {daysPhrase(rung.activeDays)}
                </span>
                <span
                  className={`material-symbols-outlined text-[20px] ${held ? 'text-primary' : 'text-transparent'}`}
                  aria-hidden="true"
                >
                  check_circle
                </span>
                {held && <span className="sr-only">Held</span>}
              </li>
            );
          })}
        </ol>
      </GlassCard>

      <GlassCard className="p-5">
        <h2 className="font-heading text-lg font-semibold text-on-surface">Your belts</h2>
        {record.belts.length === 0 ? (
          <p className="mt-2 text-sm text-on-surface-variant">
            Your first belt is {daysPhrase(record.ladder[0]!.activeDays)} away.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {record.belts.map((belt) => (
              <li key={belt.id} className="flex items-center gap-3">
                <BeltBadge tier={belt.tier} size="sm" decorative />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-on-surface">{beltName(belt.tier)}</p>
                  <p className="text-xs text-on-surface-variant">
                    Season {belt.seasonNumber} · {belt.seasonName}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => share(belt)}
                  aria-label={`Share ${beltName(belt.tier)}, season ${belt.seasonNumber}`}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span className="material-symbols-outlined" aria-hidden="true">
                    ios_share
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <SquadBlock />
      <CheersBlock />

      <TelegramStatusSetting record={record} />

      <BeltCelebration record={record} />
      <BeltShareSheet award={sharing} adult={record.adult} onClose={() => setSharing(null)} />
      {kit && kitCard && camp && (
        <ShareKitSheet
          open
          onClose={() => setKit(null)}
          accentId={seasonTheme(kit.seasonNumber).accentId}
          card={kitCard}
        />
      )}
    </div>
  );
}

/** Fight Camp cheers (AZF-P1 Epic D): only where the feature is on for an adult. */
function CheersBlock() {
  return useFightCamp().data?.cheers ? <CheersInbox /> : null;
}

/** Fight Camp squads (AZF-P1 Epic C): only where the feature is on for an adult. */
function SquadBlock() {
  const squads = useFightCamp().data?.squads;
  if (!squads) return null;
  const { current } = squads;
  return (
    <GlassCard className="p-5">
      <h2 className="font-heading text-lg font-semibold text-on-surface">Your squad</h2>
      <p className="mt-1 text-sm text-on-surface-variant text-pretty">
        {current
          ? `${current.name}: see who showed up this week, and cheer them on.`
          : 'Up to five people who show up together this season.'}
      </p>
      <Link
        to="/squad"
        className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        {current ? 'Open my squad' : 'Start or join a squad'}
      </Link>
    </GlassCard>
  );
}

function TelegramStatusSetting({ record }: { record: FightRecordStatus }) {
  const toast = useToast();
  const setEmojiStatus = useSetEmojiStatus();
  const { available, enabled } = record.emojiStatus;
  // Turning it off needs no Telegram client, so an enabled status stays
  // switchable from the web too; turning it on needs the Mini App's prompt.
  if (!record.adult || !available || !(enabled || canManageEmojiStatus())) return null;

  const toggle = async () => {
    if (!enabled && !(await requestEmojiStatusAccess())) return;
    setEmojiStatus.mutate(!enabled, {
      onError: () =>
        toast.error(
          enabled
            ? 'Could not turn that off. Try again.'
            : 'Telegram did not accept the status. Allow AquaZeroFit to manage it, then try again.',
        ),
    });
  };

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="tg-status-label" className="font-heading text-lg font-semibold text-on-surface">
            Show my belt on Telegram
          </h2>
          <p
            id="tg-status-help"
            className="mt-1 text-sm leading-relaxed text-on-surface-variant text-pretty"
          >
            Everyone you chat with sees your belt emoji next to your name. It changes when you earn
            a new belt and clears when the season ends. Turn it off any time.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="tg-status-label"
          aria-describedby="tg-status-help"
          disabled={setEmojiStatus.isPending}
          onClick={() => void toggle()}
          className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60 ${
            enabled ? 'bg-primary' : 'bg-outline-variant'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute top-1 h-5 w-5 rounded-full bg-surface transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>
    </GlassCard>
  );
}
