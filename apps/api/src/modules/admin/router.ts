/**
 * /admin - support/monitoring overview and content library management
 * (AQF-07 §3.4). requireAdmin on every route.
 */
import { Router } from 'express';
import { z } from 'zod';
import { EQUIPMENT, type Exercise, type MealLog, type User, type WorkoutSession } from '@aquazerofit/shared';
import { requireAdmin, requireAuth } from '../../platform/auth';
import { AppError, asyncHandler } from '../../platform/errors';
import { getStore } from '../../platform/store';
import { getWgerImportStatus, runWgerImport } from '../../data/wger/importer';
import { requireFreshMfa } from '../mfa/middleware';
import { getProfile, auditDataAccess } from '../me/service';
import {
  effectiveTier,
  entitlementHistory,
  grantPremium,
  revokePremium,
} from '../billing/entitlements';
import { refundStarsPurchase } from '../payments/stars';
import { refundStarsSubscription } from '../payments/starsSubscription';
import { refundGift } from '../fightCamp/gifts';
import { todayFor } from '../../platform/dates';
import { retentionReport } from './retention';
import { engageMetrics } from '../fightCamp/metrics';

export const adminRouter = Router();
/**
 * Order matters: identify (requireAuth), then authorise (requireAdmin), then
 * re-prove possession of the second factor (requireFreshMfa). The role alone
 * used to be enough, and GET /users below returns every account on the
 * platform, so the step-up is what stops one phished password from being the
 * whole user table. See modules/mfa/middleware for the unenrolled-admin
 * posture.
 */
adminRouter.use(requireAuth, requireAdmin, requireFreshMfa);

function isUserDoc(d: { id: string }): d is User {
  const t = (d as { type?: string }).type;
  return (t === undefined || t === 'user') && typeof (d as User).email === 'string';
}

adminRouter.get('/users', (req, res) => {
  const store = getStore();
  const users = store.where<User>('users', isUserDoc);
  const overview = users.map((user) => {
    const mealLogs = store.where<MealLog>(
      'logs',
      (d) => d.type === 'mealLog' && d.userId === user.id,
    ).length;
    const workoutsCompleted = store.where<WorkoutSession>(
      'plans',
      (d) => d.type === 'workoutSession' && d.userId === user.id && d.status === 'completed',
    ).length;
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      tier: effectiveTier(user),
      emailVerified: user.emailVerified,
      telegramLinked: user.tgId !== undefined && user.tgId !== null,
      hasProfile: getProfile(user.id) !== undefined,
      deletionRequestedAt: user.deletionRequestedAt ?? null,
      createdAt: user.createdAt,
      mealLogs,
      workoutsCompleted,
    };
  });
  auditDataAccess(req.user!.id, 'admin.users.list', { count: overview.length });
  res.json({ users: overview });
});

/**
 * Retention baseline: D1/D7/D30 by signup week and weekly active loggers
 * (see ./retention for the definitions). Aggregate counts only, so the
 * response carries no account identifiers; the read is still audited because
 * it walks every member's activity.
 */
const retentionQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(52).default(12),
});

adminRouter.get('/retention', (req, res) => {
  const { weeks } = retentionQuerySchema.parse(req.query);
  const report = retentionReport(todayFor(req), weeks);
  auditDataAccess(req.user!.id, 'admin.retention.read', { weeks });
  res.json({ report });
});

/**
 * Fight Camp metrics (AZF-P1 §7.2): aggregate counts and rates only, for the
 * kill-criteria report (tools/engage/kill-report.mjs). Not behind the Fight
 * Camp flags: an admin reads them to decide whether to switch features on or
 * off. Audited, because it walks every member's activity.
 */
const engageMetricsQuerySchema = z.object({
  season: z.coerce.number().int().min(1).max(10_000).optional(),
});

adminRouter.get(
  '/engage/metrics',
  asyncHandler(async (req, res) => {
    const { season } = engageMetricsQuerySchema.parse(req.query);
    const metrics = await engageMetrics(todayFor(req), season);
    auditDataAccess(req.user!.id, 'admin.engage.metrics.read', { season: metrics.season.number });
    res.json({ metrics });
  }),
);

/**
 * Content update: attribution fields (licence, licenceAuthor, sourceId) are
 * intentionally NOT editable - they are never stripped (AQF-12 obligation).
 */
const exercisePatchSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(2000),
    category: z.enum(['strength', 'cardio', 'mobility', 'core']),
    primaryMuscles: z.array(z.string().min(1)).min(1),
    secondaryMuscles: z.array(z.string()),
    equipment: z.array(z.enum(EQUIPMENT)).min(1),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    media: z.array(
      z.object({
        kind: z.enum(['image', 'video']),
        // Only http(s) URLs or relative /uploads paths - blocks javascript:,
        // data: and other schemes from ever entering the content library.
        url: z
          .string()
          .min(1)
          .max(2048)
          .refine(
            (value) =>
              /^https?:\/\/[^\s]+$/i.test(value) || /^\/uploads\/[^\s]+$/.test(value),
            { message: 'url must be an http(s) URL or a relative /uploads path' },
          ),
        caption: z.string().optional(),
      }),
    ),
  })
  .partial();

adminRouter.put('/exercises/:id', (req, res) => {
  const store = getStore();
  const existing = store.byId<Exercise>('content', req.params.id);
  if (!existing || existing.type !== 'exercise') {
    throw new AppError('NOT_FOUND', 'Exercise not found');
  }
  const patch = exercisePatchSchema.parse(req.body ?? {});
  const updated: Exercise = {
    ...existing,
    ...patch,
    // Immutable identity + attribution.
    id: existing.id,
    type: 'exercise',
    licence: existing.licence,
    licenceAuthor: existing.licenceAuthor,
    sourceId: existing.sourceId,
  };
  store.upsert('content', updated);
  auditDataAccess(req.user!.id, 'admin.exercise.update', { exerciseId: existing.id });
  res.json({ exercise: updated });
});

/**
 * Trigger the wger exercise ETL server-side (wger-integration-plan.md Phase
 * 1.5). The import runs in the background of the API process (full crawl is
 * multi-minute); progress is observable via GET /admin/exercises/import/status.
 * Body: { incremental?: boolean } - incremental uses last_update_global +
 * the wger deletion-log.
 */
const importTriggerSchema = z
  .object({ incremental: z.boolean().optional() })
  .optional();

adminRouter.post('/exercises/import', (req, res) => {
  if (getWgerImportStatus().running) {
    throw new AppError('CONFLICT', 'A wger import is already running');
  }
  const body = importTriggerSchema.parse(req.body ?? undefined);
  auditDataAccess(req.user!.id, 'admin.exercises.import', {
    incremental: body?.incremental === true,
  });
  // Fire-and-forget: run stats are tracked module-side; errors land in
  // lastRun.errors rather than crashing the request loop.
  void runWgerImport({ incremental: body?.incremental === true }).catch(() => undefined);
  res.status(202).json({ started: true, status: getWgerImportStatus() });
});

/** Last-run stats for the wger import (counts, duration, errors, wgerVersion). */
adminRouter.get('/exercises/import/status', (_req, res) => {
  res.json(getWgerImportStatus());
});

// ---------------------------------------------------------------------------
// Paid entitlements
// ---------------------------------------------------------------------------

/**
 * Grant or revoke premium by hand.
 *
 * This is the ONLY route in the product that can change a paid entitlement,
 * and it is deliberately behind requireAdmin + requireFreshMfa rather than
 * exposed to the account holder: a self-serve tier flip with no payment behind
 * it is an entitlement any caller could grant themselves, which is the reason
 * `/me` has never had one.
 *
 * It exists before any payment rail does, for three reasons that outlast the
 * rails: comping a user after a support failure, testing the whole premium
 * path end to end without a sandbox purchase, and reversing a chargeback that
 * the provider's own webhook did not carry.
 *
 * `days` rather than an absolute date: an admin acting on a support ticket is
 * thinking in "give them a month", and a date field invites a typo that reads
 * as a valid year.
 */
const premiumGrantSchema = z.object({
  action: z.enum(['grant', 'revoke']),
  days: z.number().int().min(1).max(3660).optional(),
  reason: z.string().min(1).max(500),
});

adminRouter.post('/users/:id/premium', (req, res) => {
  const input = premiumGrantSchema.parse(req.body ?? {});
  const userId = String(req.params.id ?? '');
  const store = getStore();
  const user = store.byId<User>('users', userId);
  if (!user || !isUserDoc(user)) throw new AppError('NOT_FOUND', 'Account not found');

  // The admin's own id is part of the idempotency key and the audit trail:
  // "who comped this account, and why" is the question a refund dispute asks.
  const actor = req.user!.id;

  if (input.action === 'revoke') {
    revokePremium(userId, 'admin', `admin:${actor}:${Date.now()}`, input.reason);
    auditDataAccess(actor, 'admin.premium.revoke', { userId, reason: input.reason });
    res.json({ user: { id: userId, tier: 'free', premiumUntil: null } });
    return;
  }

  if (input.days === undefined) {
    throw new AppError('VALIDATION_FAILED', 'days is required when granting premium.');
  }
  const until = new Date(Date.now() + input.days * 24 * 3600 * 1000).toISOString();
  const outcome = grantPremium({
    userId,
    source: 'admin',
    externalId: `admin:${actor}:${Date.now()}`,
    premiumUntil: until,
    reason: input.reason,
  });
  auditDataAccess(actor, 'admin.premium.grant', {
    userId,
    days: input.days,
    reason: input.reason,
  });
  res.json({ user: { id: userId, tier: 'premium', premiumUntil: outcome.premiumUntil } });
});

/** Entitlement history for one account. What support reads on a billing query. */
adminRouter.get('/users/:id/premium', (req, res) => {
  const userId = String(req.params.id ?? '');
  auditDataAccess(req.user!.id, 'admin.premium.history', { userId });
  res.json({ grants: entitlementHistory(userId) });
});

/**
 * Refund one Telegram Stars purchase.
 *
 * Admin and a fresh MFA step-up, same gate as a premium revoke: this call
 * returns money and removes a coach. Idempotent on the charge id. The
 * purchase row stays in the ledger; a starsRefund document is appended and
 * the coach is taken off the account.
 *
 * `telegramUserId` is only a fallback for a purchase recorded before we
 * stored the payer. It cannot retarget a charge that already names who paid.
 */
const starsRefundSchema = z.object({
  telegramPaymentChargeId: z.string().trim().min(1).max(256),
  reason: z.string().trim().min(1).max(500),
  telegramUserId: z.number().int().positive().optional(),
});

adminRouter.post(
  '/payments/stars/refund',
  asyncHandler(async (req, res) => {
    const input = starsRefundSchema.parse(req.body ?? {});
    const refundInput = {
      telegramPaymentChargeId: input.telegramPaymentChargeId,
      reason: input.reason,
      actorId: req.user!.id,
      telegramUserId: input.telegramUserId,
    };
    // A charge is a coach purchase, a subscription payment or a Fight Camp
    // gift. Each is asked in turn, and the next only when the last has no row.
    const refunders = [refundStarsPurchase, refundStarsSubscription, refundGift];
    let outcome: { userId: string | null; status: string; coachId?: string } | undefined;
    for (const [i, refund] of refunders.entries()) {
      try {
        outcome = await refund(refundInput);
        break;
      } catch (err) {
        const last = i === refunders.length - 1;
        if (last || !(err instanceof AppError) || err.code !== 'NOT_FOUND') throw err;
      }
    }
    if (!outcome) throw new AppError('NOT_FOUND', 'No Stars payment matches that charge.');
    auditDataAccess(req.user!.id, 'admin.stars.refund', {
      userId: outcome.userId,
      coachId: outcome.coachId ?? null,
      status: outcome.status,
      reason: input.reason,
    });
    res.json({ refund: outcome });
  }),
);
