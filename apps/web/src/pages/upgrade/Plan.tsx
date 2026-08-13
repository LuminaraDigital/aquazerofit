/**
 * Your plan (GET /api/v1/me/entitlements).
 *
 * The weekly-insight card tells a free-tier user that "a coach-written note
 * comes with premium". This is where that sentence lands, and the job here is
 * to be straight rather than to sell:
 *
 * 1. The user's actual position leads — their tier and the credit balance they
 *    can spend today. A real number someone can act on beats a value
 *    proposition they cannot check.
 * 2. What premium changes is rendered from `premiumLanes` and `costs`, not from
 *    copy. Server constants are the truth; a hand-written feature list is a
 *    claim that goes stale silently, which on a paid tier is a lie with a price
 *    attached.
 * 3. There is no purchase step, because there is no payment provider in this
 *    product yet. That is stated plainly instead of being papered over with a
 *    button that looks live and does nothing — and there is deliberately no
 *    control here that changes `tier`, since with nothing to pay that would be
 *    an entitlement any caller could grant themselves.
 *
 * A premium account sees its position and what is switched on, not a sales
 * page it has already bought.
 */
import { Link, useNavigate } from 'react-router-dom';
import { AppHeader } from '@/components/ui/AppHeader';
import { BottomNav } from '@/components/ui/BottomNav';
import { Chip } from '@/components/ui/Chip';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassCard } from '@/components/ui/GlassCard';
import { SecondaryButton } from '@/components/ui/SecondaryButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useEntitlements, type Entitlements } from '@/lib/queries';

/**
 * What each premium model lane means to a person, keyed by the lane id the API
 * reports. Unknown lanes still render — a lane the server has added and this
 * map has not is described generically rather than dropped, so the page can
 * never quietly under-report what a tier includes.
 */
const PREMIUM_LANE_COPY: Record<string, { title: string; body: string }> = {
  insightBatch: {
    title: 'A coach-written weekly note',
    body: 'On premium, the narrative at the top of your weekly summary is written by the coach. On free it is written from your own numbers by the app itself — you still get the summary, and every "what changed" line in it, every week.',
  },
};

function laneCopy(lane: string): { title: string; body: string } {
  return (
    PREMIUM_LANE_COPY[lane] ?? {
      title: lane,
      body: 'This part of the coach runs on a model lane the free tier does not reach.',
    }
  );
}

/** Human labels for the credit price list; unlisted tasks fall back to their id. */
const TASK_LABEL: Record<string, string> = {
  chatTurn: 'Message to Aqua Coach',
  mealPhoto: 'Meal photo analysis',
  mealRecommendation: 'Meal recommendation',
  planGeneration: 'New training plan',
  recipeGeneration: 'Recipe',
  progressInsight: 'Weekly insight',
};

function creditWord(n: number): string {
  return n === 1 ? 'credit' : 'credits';
}

// ---------- sections ----------

/**
 * Position first. The balance is the ledger balance, which is what the user can
 * actually spend right now — the daily grant is what tops it up, so both
 * numbers are stated rather than folded into an "X of Y" that would be wrong
 * for anyone carrying credits over.
 */
function PositionCard({ entitlements }: { entitlements: Entitlements }) {
  const { tier, dailyCredits, creditsRemaining } = entitlements;
  const premium = tier === 'premium';
  // Bar denominator never smaller than the balance, so a carried-over balance
  // cannot overflow the track.
  const scale = Math.max(dailyCredits, creditsRemaining, 1);
  const pct = Math.round((Math.max(creditsRemaining, 0) / scale) * 100);

  return (
    <GlassCard className="p-card-padding space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface-variant">
          Current plan
        </h2>
        <Chip
          label={premium ? 'Premium' : 'Free'}
          tone={premium ? 'green' : 'navy'}
          icon={premium ? 'workspace_premium' : 'person'}
        />
      </div>

      <div>
        <p className="flex items-baseline gap-2">
          <span className="font-heading font-bold text-4xl tabular-nums text-primary">
            {creditsRemaining.toLocaleString()}
          </span>
          <span className="text-sm text-on-surface-variant">
            AI {creditWord(creditsRemaining)} available
          </span>
        </p>
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-container-high/70"
          aria-hidden="true"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-xs leading-relaxed text-on-surface-variant">
          The first AI action you take each day adds {dailyCredits.toLocaleString()}{' '}
          {creditWord(dailyCredits)} to your balance, and anything you do not spend carries over.
          Logging meals, water and weight by hand never costs a credit.
        </p>
      </div>
    </GlassCard>
  );
}

/** The credit price list, straight from the server's own cost map. */
function CostsCard({ costs }: { costs: Entitlements['costs'] }) {
  const rows = Object.entries(costs);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="plan-costs">
      <h2
        id="plan-costs"
        className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface-variant mb-3 px-2"
      >
        What each AI action costs
      </h2>
      <GlassCard className="p-card-padding">
        <dl className="divide-y divide-outline-variant/25">
          {rows.map(([task, cost]) => (
            <div key={task} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
              <dt className="min-w-0 text-sm text-on-surface">{TASK_LABEL[task] ?? task}</dt>
              <dd className="shrink-0 text-sm tabular-nums text-on-surface-variant">
                {cost} {creditWord(cost)}
              </dd>
            </div>
          ))}
        </dl>
      </GlassCard>
    </section>
  );
}

/** What the premium lanes actually buy — one block per lane the API reports. */
function LaneList({ lanes, premium }: { lanes: string[]; premium: boolean }) {
  return (
    <div className="space-y-3">
      {lanes.map((lane) => {
        const copy = laneCopy(lane);
        return (
          <GlassCard key={lane} className="p-card-padding space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface">
                {copy.title}
              </h3>
              {/* The state is spelled out, never carried by the tick alone. */}
              <span
                className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium ${
                  premium ? 'text-secondary' : 'text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  {premium ? 'check_circle' : 'lock'}
                </span>
                {premium ? 'On' : 'Premium'}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-on-surface-variant">{copy.body}</p>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ---------- page ----------

export default function Plan() {
  const navigate = useNavigate();
  const { data: entitlements, isLoading, isError, refetch } = useEntitlements();

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto min-h-screen relative safe-bottom">
        <AppHeader back title="Your plan" />
        <main className="pt-6 px-container-margin space-y-4" aria-busy="true">
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-32 w-full rounded-card" />
          <Skeleton className="h-24 w-3/4 rounded-card" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (isError || !entitlements) {
    return (
      <div className="max-w-md mx-auto min-h-screen relative safe-bottom">
        <AppHeader back title="Your plan" />
        <main className="pt-6 px-container-margin">
          <ErrorState
            message="We could not read your plan details right now."
            retry={() => void refetch()}
          />
        </main>
        <BottomNav />
      </div>
    );
  }

  const premium = entitlements.tier === 'premium';
  const lanes = entitlements.premiumLanes;

  return (
    <div className="max-w-md mx-auto min-h-screen relative safe-bottom">
      <AppHeader back title="Your plan" />

      <main className="pt-6 px-container-margin space-y-section-gap pb-6">
        <PositionCard entitlements={entitlements} />

        <section aria-labelledby="plan-difference">
          <h2
            id="plan-difference"
            className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface-variant mb-3 px-2"
          >
            {premium ? 'What premium gives you' : 'What premium changes'}
          </h2>

          {lanes.length === 0 ? (
            <GlassCard className="p-card-padding">
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Nothing is held back from the free plan at the moment — every feature in the app is
                available to you.
              </p>
            </GlassCard>
          ) : (
            <>
              <LaneList lanes={lanes} premium={premium} />
              <p className="mt-3 px-2 text-xs leading-relaxed text-on-surface-variant">
                {lanes.length === 1
                  ? 'That is the whole difference today.'
                  : 'That is the difference today.'}{' '}
                Your targets, your logging, your training plans, the coach chat and every number in
                your weekly summary work the same way on both plans.
              </p>
            </>
          )}
        </section>

        <CostsCard costs={entitlements.costs} />

        {/*
          The purchase step. No payment provider is integrated, so there is no
          checkout and no control here that could change a tier — and no
          disabled-looking button either, because a button is a promise that
          something will happen when it is pressed.
        */}
        {!premium && (
          <section aria-labelledby="plan-availability">
            <GlassCard className="p-card-padding space-y-3 border-l-4 border-l-outline-variant">
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[20px] text-on-surface-variant"
                  aria-hidden="true"
                >
                  schedule
                </span>
                <h2
                  id="plan-availability"
                  className="font-heading font-semibold uppercase tracking-wide text-base text-on-surface"
                >
                  Upgrading is not available yet
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                There is no way to buy premium in AquaZeroFit today — payment is not built yet. We
                would rather tell you that than show you a button that does nothing. When there is
                something to buy, it will appear on this page, with the price on it.
              </p>
              <p className="text-sm leading-relaxed text-on-surface-variant">
                Until then your free plan keeps working exactly as it does now, and nothing you use
                today is going to be taken away to make room for a paid tier.
              </p>
            </GlassCard>
          </section>
        )}

        {premium && (
          <p className="px-2 text-xs leading-relaxed text-on-surface-variant">
            Nothing to do here — this page is just your current position. Your weekly note is
            written for you automatically.
          </p>
        )}

        <SecondaryButton onClick={() => navigate('/progress')} className="min-h-[48px]">
          See your weekly summary
        </SecondaryButton>

        <p className="px-2 text-xs leading-relaxed text-on-surface-variant">
          Questions about your account?{' '}
          <Link
            to="/support"
            className="text-primary underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            Support
          </Link>
          .
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
