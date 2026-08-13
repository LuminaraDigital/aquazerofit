/**
 * /progress — weight series, streaks and achievements (AQF-07 §3.3).
 *
 * GET /summary  deterministic progress rollup
 * GET /insight  the P-08 progress insight: code-computed statistics plus a
 *               short narration of them
 *
 * The insight route exists because a chart does not tell a user their results
 * materialised — a sentence does. That makes it a retention surface, and the
 * shape of the route follows from that: it must never be the thing that errors
 * on someone's dashboard. A brand-new user, a free-tier user, a user with
 * personalisation switched off and a user whose provider chain is down all get
 * a 200 with a genuine, deterministic insight. Only the phrasing is premium.
 *
 * Admission sequence (brief rule 4) applies to the model path only:
 *   cache → data floor → tier/consent → reserve → complete → guardrail →
 *   commit-or-release → persist.
 */
import { Router } from 'express';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError } from '../../platform/errors';
import { addDays, todayFor } from '../../platform/dates';
import { INSIGHT_MIN_ACTIVE_DAYS, INSIGHT_PERIOD_DAYS } from '@aquazerofit/shared';
import type { AiMetadata, ProgressInsight } from '@aquazerofit/shared';
import { complete } from '../ai/gateway';
import { post as postGuardrail } from '../ai/guardrails';
import { creditLedger } from '../ai/creditLedger';
import { isLaneAllowed } from '../ai/tierPolicy';
import { loadPrompt } from '../ai/prompts';
import { hasConsent } from '../me/service';
import { asyncHandler, byIdDoc, getUser, nowIso, upsertDoc } from '../ai/util';
import { getProgressSummary } from './service';
import {
  NOT_ENOUGH_DATA_NARRATIVE,
  computeChanges,
  computeInsightStats,
  countActiveDays,
  deterministicNarrative,
  previousPeriodEnd,
} from './insight';

export const progressRouter = Router();
progressRouter.use(requireAuth);

progressRouter.get('/summary', (req, res) => {
  res.json(getProgressSummary(userIdOf(req), todayFor(req)));
});

// ---------------------------------------------------------------------------

/**
 * Sane bounds for ?periodDays=. Below three days there is no trend to read;
 * above ninety the window stops describing "recently" in any useful sense.
 */
const MIN_PERIOD_DAYS = 3;
const MAX_PERIOD_DAYS = 90;

/** Junk is rejected; a real number outside the bounds is clamped. */
function parsePeriodDays(raw: unknown): number {
  if (raw === undefined) return INSIGHT_PERIOD_DAYS;
  if (typeof raw !== 'string' || !/^\d{1,3}$/.test(raw)) {
    throw new AppError('VALIDATION_FAILED', 'periodDays must be a whole number of days.', {
      field: 'periodDays',
    });
  }
  const value = Number(raw);
  return Math.min(MAX_PERIOD_DAYS, Math.max(MIN_PERIOD_DAYS, value));
}

/**
 * Monday of the local week containing `today` — the CACHE BUCKET, so an insight
 * is authored once per user per week and every later dashboard load that week is
 * free. Re-billing a premium user on every mount would be a real cost bug.
 *
 * This is deliberately not the same value as the insight's `periodStart`. The
 * bucket answers "have we already written one this week"; `periodStart` answers
 * "which days do these numbers cover". Conflating them put a Monday date on a
 * window that actually began the previous Saturday, so the card was labelled
 * with days it did not describe.
 */
function cacheWeekOf(localDate: string): string {
  const dayOfWeek = new Date(`${localDate}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(localDate, -((dayOfWeek + 6) % 7));
}

/** First day of the window the statistics actually cover (inclusive). */
function periodStartOf(today: string, periodDays: number): string {
  return addDays(today, -(periodDays - 1));
}

/**
 * Deterministic id: the periodDays are part of the key because a 30-day insight
 * is a different document from a 7-day one, and serving one for the other would
 * put numbers on screen that do not match the label above them.
 */
function insightId(userId: string, cacheWeek: string, periodDays: number): string {
  return `insight-${userId}-${cacheWeek}-${periodDays}d`;
}

/** AiMetadata for every path that never reached a model. */
function deterministicMeta(model: string): AiMetadata {
  return {
    provider: 'deterministic',
    model,
    promptVersion: 'n/a',
    generatedAt: nowIso(),
  };
}

progressRouter.get(
  '/insight',
  asyncHandler(async (req, res) => {
    const user = getUser(req);
    const today = todayFor(req);
    const periodDays = parsePeriodDays(req.query.periodDays);
    const periodStart = periodStartOf(today, periodDays);
    const id = insightId(user.id, cacheWeekOf(today), periodDays);

    // --- 1. Cache first. A hit costs neither a credit nor a model call.
    const cached = await byIdDoc<ProgressInsight>('ai', id);
    if (cached && cached.type === 'progressInsight' && cached.userId === user.id) {
      res.json({ insight: cached, cached: true });
      return;
    }

    const previousEnd = previousPeriodEnd(today, periodDays);
    const stats = await computeInsightStats(user.id, today, periodDays);
    const previous = await computeInsightStats(user.id, previousEnd, periodDays);

    // Count comparisons are only meaningful when the user was actually present
    // in both windows — see computeChanges. Measured symmetrically, so a sparse
    // window suppresses the comparison in either direction.
    const activeNow = countActiveDays(user.id, today, periodDays);
    const activeBefore = countActiveDays(user.id, previousEnd, periodDays);
    const comparable = Math.min(activeNow, activeBefore) >= INSIGHT_MIN_ACTIVE_DAYS;

    const changes = computeChanges(stats, previous, comparable);
    const fallbackNarrative = deterministicNarrative(stats, changes);

    const draft = (narrative: string, ai: AiMetadata): ProgressInsight => ({
      id,
      userId: user.id,
      type: 'progressInsight',
      periodStart,
      periodDays,
      stats,
      changes,
      narrative,
      ai,
      createdAt: nowIso(),
    });

    // Nothing below this point is persisted unless a model authored it. A
    // deterministic insight is free to recompute, and caching one would pin a
    // user to "keep logging" for the rest of the week after they started
    // logging, or to the free-tier copy for the rest of the week after they
    // upgraded.

    // --- 2. Below the data floor: encourage, never error. A new user meeting a
    // 404 or a 422 on their first dashboard is the churn cliff this feature
    // exists to close.
    if (activeNow < INSIGHT_MIN_ACTIVE_DAYS) {
      res.json({
        insight: draft(NOT_ENOUGH_DATA_NARRATIVE, deterministicMeta('insufficient-data')),
        cached: false,
      });
      return;
    }

    // --- 3. Free tier / personalisation off. assertLaneAllowed would throw
    // FORBIDDEN here; a paywall is not an error on a screen the user already
    // has open, so the gate is checked rather than asserted. No model call, no
    // personal data in any model context, no billing — everyone gets the
    // retention value and only the model-authored phrasing is premium.
    const laneAllowed = isLaneAllowed(user.tier, 'insightBatch');
    const personalised = hasConsent(user.id, 'aiPersonalisation');
    if (!laneAllowed || !personalised) {
      res.json({
        insight: draft(
          fallbackNarrative,
          deterministicMeta(laneAllowed ? 'consent-off-fallback' : 'premium-required-fallback'),
        ),
        cached: false,
      });
      return;
    }

    // --- 4. Premium + consent on: reserve, narrate, guardrail, settle.
    let reservationId: string;
    try {
      reservationId = await creditLedger.reserve(user.id, 'progressInsight');
    } catch (err) {
      // Out of credits is an expected user state, not a fault, and it is not a
      // reason to show someone nothing. Note it server-side and degrade.
      console.warn(
        '[progress] insight credit reservation unavailable',
        err instanceof Error ? err.message : err,
      );
      res.json({
        insight: draft(fallbackNarrative, deterministicMeta('credits-unavailable-fallback')),
        cached: false,
      });
      return;
    }

    try {
      const prompt = loadPrompt('P-08');
      const result = await complete(
        'insightBatch',
        [
          {
            role: 'system',
            content:
              prompt.content ||
              'Summarise the supplied progress statistics supportively in 2–4 sentences. Use no number that is not in the statistics.',
          },
          {
            role: 'user',
            content: `Summarise my progress over the last ${periodDays} days.`,
          },
        ],
        { promptId: 'P-08', context: { stats }, maxTokens: 256 },
      );

      // Model-authored text passes the output guardrail before it can reach the
      // user; on any block the deterministic narration substitutes, so the user
      // still gets their numbers.
      const modelText = result.text.trim();
      const usable =
        modelText.length > 0 && !postGuardrail(modelText, { userId: user.id }).blocked;
      const insight = draft(usable ? modelText : fallbackNarrative, result.meta);

      // Real providers failed and the gateway fell back to offline templates —
      // do not charge. Keyless mock (no providers configured) keeps degraded
      // false and bills normally per product rules. Same stance as the chat and
      // recommendation lanes.
      if (result.meta.degraded) {
        await creditLedger.release(reservationId);
      } else {
        await creditLedger.commit(reservationId);
      }

      // --- 5. Persist: this is the document the cache check above will find.
      await upsertDoc('ai', insight);
      res.json({ insight, cached: false });
    } catch (err) {
      await creditLedger.release(reservationId);
      // Error hygiene: internals are logged server-side only and never reach
      // the client envelope. The user gets their numbers regardless — an AI
      // outage must not take the progress card down with it.
      console.error('[progress] insight narration failed', err);
      res.json({
        insight: draft(fallbackNarrative, deterministicMeta('ai-unavailable-fallback')),
        cached: false,
      });
    }
  }),
);
