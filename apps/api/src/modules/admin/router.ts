/**
 * /admin — support/monitoring overview and content library management
 * (AQF-07 §3.4). requireAdmin on every route.
 */
import { Router } from 'express';
import { z } from 'zod';
import { EQUIPMENT, type Exercise, type MealLog, type User, type WorkoutSession } from '@aquazerofit/shared';
import { requireAdmin, requireAuth } from '../../platform/auth';
import { AppError } from '../../platform/errors';
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
 * Content update: attribution fields (licence, licenceAuthor, sourceId) are
 * intentionally NOT editable — they are never stripped (AQF-12 obligation).
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
        // Only http(s) URLs or relative /uploads paths — blocks javascript:,
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
 * Body: { incremental?: boolean } — incremental uses last_update_global +
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

/** Entitlement history for one account — what support reads on a billing query. */
adminRouter.get('/users/:id/premium', (req, res) => {
  const userId = String(req.params.id ?? '');
  auditDataAccess(req.user!.id, 'admin.premium.history', { userId });
  res.json({ grants: entitlementHistory(userId) });
});
