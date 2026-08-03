/**
 * /workouts — today's session (pre-computed read model), completion,
 * constrained variation-aware swap, stats, exercise library. A small
 * standalone /exercises router re-exposes the library (AQF-07 lists
 * GET /exercises for the workout library screen).
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  completeWorkoutSchema,
  EQUIPMENT,
  swapExerciseSchema,
  type Exercise,
} from '@aquazerofit/shared';
import { requireAuth, userIdOf } from '../../platform/auth';
import { AppError, asyncHandler } from '../../platform/errors';
import { todayFor } from '../../platform/dates';
import { getStore } from '../../platform/store';
import {
  completeWorkout,
  getExerciseVariations,
  getTodayWorkout,
  queryExercises,
  swapExercise,
} from './service';
import { getWorkoutStats } from './stats';

const EXERCISE_CATEGORIES = ['strength', 'cardio', 'mobility', 'core'] as const;

const libraryQuerySchema = z.object({
  search: z.string().max(120).optional(),
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  muscle: z.string().max(60).optional(),
  equipment: z.enum(EQUIPMENT).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  respectProfile: z.enum(['true', 'false']).optional(),
});

const LIBRARY_PARAMS = ['search', 'category', 'muscle', 'equipment', 'limit', 'offset', 'respectProfile'];

const statsQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(52).default(8),
});

const swapBodySchema = swapExerciseSchema.extend({
  reason: z.string().max(280).optional(),
});

export const workoutsRouter = Router();
workoutsRouter.use(requireAuth);

workoutsRouter.get('/today', (req, res) => {
  res.json(getTodayWorkout(userIdOf(req), todayFor(req)));
});

// NOTE: registered before '/:id/...' so 'stats' / 'exercises' are never read
// as a session id.
workoutsRouter.get('/stats', (req, res) => {
  const { weeks } = statsQuerySchema.parse(req.query);
  res.json(getWorkoutStats(userIdOf(req), weeks, todayFor(req)));
});

workoutsRouter.get('/exercises', (req, res) => {
  handleLibrary(req, res);
});

workoutsRouter.post('/:id/complete', (req, res) => {
  const input = completeWorkoutSchema.parse({
    ...req.body,
    localDate: (req.body ?? {}).localDate ?? todayFor(req),
  });
  res.json({ session: completeWorkout(userIdOf(req), req.params.id, input) });
});

workoutsRouter.post(
  '/:id/swap-exercise',
  asyncHandler(async (req, res) => {
    const { exerciseId, reason } = swapBodySchema.parse(req.body);
    // String(): newer @types/express widens route params to string | string[].
    res.json(await swapExercise(userIdOf(req), String(req.params.id ?? ''), exerciseId, { reason }));
  }),
);

// ----- exercise library (also mounted at /exercises) -----

/**
 * Backward compatibility: with no recognized query params the response is the
 * legacy plain array; with any of search/category/muscle/equipment/limit/
 * offset the response is the paginated envelope { items, total, limit, offset }.
 */
function handleLibrary(req: Request, res: Response): void {
  const query = libraryQuerySchema.parse(req.query);
  const hasParams = LIBRARY_PARAMS.some((key) => req.query[key] !== undefined);
  const userId = userIdOf(req);
  if (!hasParams) {
    res.json(queryExercises({}).items);
    return;
  }
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  const { items, total } = queryExercises({
    search: query.search ?? '',
    category: query.category,
    muscle: query.muscle,
    equipment: query.equipment,
    limit,
    offset,
    respectProfile: query.respectProfile === 'true',
    userId,
  });
  res.json({ items, total, limit, offset });
}

export const exercisesRouter = Router();
exercisesRouter.use(requireAuth);

exercisesRouter.get('/', (req, res) => {
  handleLibrary(req, res);
});

exercisesRouter.get('/:id/variations', (req, res) => {
  const { exercise, variations, basis } = getExerciseVariations(req.params.id);
  res.json({ exercise, items: variations, basis });
});

exercisesRouter.get('/:id', (req, res) => {
  const exercise = getStore().byId<Exercise>('content', req.params.id);
  if (!exercise || exercise.type !== 'exercise') {
    throw new AppError('NOT_FOUND', 'Exercise not found');
  }
  res.json({ exercise });
});
