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
import { getProfile, auditDataAccess } from '../me/service';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

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
      tier: user.tier,
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
